const https = require("https");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const { saveGif } = require("./gifMemory");
const { compressToFit } = require("../util/videoCompressor");

// ── Replace with your custom emoji IDs ──
const PINTEREST_EMOJI = "<:pinterest:1519108054208221226>";
const LIKES_EMOJI = "<:likes:1519108050848448595>";   // optional
const COMMENTS_EMOJI = "<:comments:1519108047182499994>"; // optional

const PINTEREST_REGEX = /https?:\/\/(?:[^\s\/]+\.)?pinterest\.com\/(?:pin|video)\/[0-9]+\/?|https?:\/\/pin\.it\/[a-zA-Z0-9]+/i;
const MAX_BYTES = 25 * 1024 * 1024;
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function extractPinterestUrl(text) {
  const m = text.match(PINTEREST_REGEX);
  return m ? m[0] : null;
}

function resolveRedirect(url) {
  return new Promise((resolve, reject) => {
    const request = (currentUrl, redirects = 0) => {
      if (redirects > 10) return reject(new Error("Too many redirects"));
      const proto = currentUrl.startsWith("https") ? https : http;
      const req = proto.get(currentUrl, { headers: { "User-Agent": BROWSER_UA } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400) {
          const location = res.headers.location;
          if (!location) return resolve(currentUrl);
          const nextUrl = location.startsWith("/") ? new URL(location, currentUrl).href : location;
          res.resume();
          return request(nextUrl, redirects + 1);
        }
        resolve(currentUrl);
        res.resume();
      });
      req.on("error", reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error("Redirect timeout")); });
    };
    request(url);
  });
}

function fetchOEmbed(pinUrl) {
  return new Promise((resolve, reject) => {
    const oembedUrl = `https://www.pinterest.com/oembed?url=${encodeURIComponent(pinUrl)}`;
    https.get(oembedUrl, { headers: { "User-Agent": BROWSER_UA } }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

function fetchPageHtml(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": BROWSER_UA } }, (res) => {
      let data = "";
      res.on("data", c => {
        if (data.length > 2 * 1024 * 1024) { res.destroy(); reject(new Error("Page too large")); }
        data += c;
      });
      res.on("end", () => resolve(data));
    });
    request.on("error", reject);
    request.setTimeout(15000, () => { request.destroy(); reject(new Error("Fetch timeout")); });
  });
}

// ── Extract additional metadata from HTML (likes, comments, author avatar, description) ──
function extractMetadataFromHtml(html) {
  const metadata = {
    authorName: null,
    authorAvatar: null,
    description: null,
    likes: null,
    comments: null,
  };

  // Try to find author name
  const authorMatch = html.match(/<a[^>]+data-test-id="[^"]*owner-name[^"]*"[^>]*>([^<]+)<\/a>/i)
    || html.match(/"owner"\s*:\s*{[^}]*"full_name"\s*:\s*"([^"]+)"/i)
    || html.match(/"username"\s*:\s*"([^"]+)"/i);
  if (authorMatch) metadata.authorName = authorMatch[1];

  // Try to find author avatar
  const avatarMatch = html.match(/<img[^>]+data-test-id="[^"]*owner-avatar[^"]*"[^>]+src="([^"]+)"/i)
    || html.match(/"image_small_url"\s*:\s*"([^"]+)"/i)
    || html.match(/"avatar_url"\s*:\s*"([^"]+)"/i);
  if (avatarMatch) metadata.authorAvatar = avatarMatch[1];

  // Try to find description
  const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)
    || html.match(/"description"\s*:\s*"([^"]+)"/i);
  if (descMatch) metadata.description = descMatch[1];

  // Try to find likes count
  const likesMatch = html.match(/[^"]"like_count"\s*:\s*(\d+)/i)
    || html.match(/>\s*([\d,]+)\s*likes?\s*</i);
  if (likesMatch) {
    const raw = likesMatch[1].replace(/,/g, '');
    metadata.likes = parseInt(raw, 10);
  }

  // Try to find comments count
  const commentsMatch = html.match(/[^"]"comment_count"\s*:\s*(\d+)/i)
    || html.match(/>\s*([\d,]+)\s*comments?\s*</i);
  if (commentsMatch) {
    const raw = commentsMatch[1].replace(/,/g, '');
    metadata.comments = parseInt(raw, 10);
  }

  return metadata;
}

function extractMediaFromHtml(html) {
  // ── GIF detection ──
  const gifPatterns = [
    /"url"\s*:\s*"([^"]+\.gif[^"]*)"/i,
    /<meta[^>]+property="og:image"[^>]+content="([^"]+\.gif[^"]*)"/i,
    /<img[^>]+src="([^"]+\.gif[^"]*)"/i,
    /"images"\s*:\s*{[^}]*"originals"\s*:\s*{[^}]*"url"\s*:\s*"([^"]+\.gif[^"]*)"/i,
  ];
  for (const pattern of gifPatterns) {
    const match = html.match(pattern);
    if (match) {
      const url = match[1].replace(/\\/g, "").replace(/&amp;/g, "&");
      if (url.match(/\.gif/i)) return { url, type: "gif" };
    }
  }

  // ── Video URLs ──
  const videoPatterns = [
    /"video_list"\s*:\s*{[^}]*"V_H264_13MBPS"\s*:\s*{[^}]*"url"\s*:\s*"([^"]+)"/i,
    /"video_list"\s*:\s*{[^}]*"V_H264_6MBPS"\s*:\s*{[^}]*"url"\s*:\s*"([^"]+)"/i,
    /"url"\s*:\s*"([^"]+\.mp4[^"]*)"/i,
    /<video[^>]+src="([^"]+\.mp4[^"]*)"/i,
    /"videoUrl"\s*:\s*"([^"]+)"/i,
    /<meta[^>]+property="og:video"[^>]+content="([^"]+)"/i,
  ];
  for (const pattern of videoPatterns) {
    const match = html.match(pattern);
    if (match) return { url: match[1].replace(/\\/g, ""), type: "video" };
  }

  // ── Static images ──
  const imagePatterns = [
    /"images"\s*:\s*{[^}]*"originals"\s*:\s*{[^}]*"url"\s*:\s*"([^"]+)"/i,
    /"image"\s*:\s*{[^}]*"url"\s*:\s*"([^"]+)"/i,
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i,
    /"url"\s*:\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
  ];
  for (const pattern of imagePatterns) {
    const match = html.match(pattern);
    if (match) return { url: match[1].replace(/\\/g, ""), type: "image" };
  }

  return null;
}

function downloadBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("too many redirects"));
    const proto = url.startsWith("https") ? https : http;
    const request = proto.get(url, { headers: { "User-Agent": BROWSER_UA } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        const location = res.headers.location;
        if (!location) return reject(new Error("Redirect without location"));
        const nextUrl = location.startsWith("/") ? new URL(location, url).href : location;
        res.resume();
        return downloadBuffer(nextUrl, redirects + 1).then(resolve).catch(reject);
      }
      const chunks = [];
      let totalSize = 0;
      res.on("data", c => {
        totalSize += c.length;
        if (totalSize > MAX_BYTES) { res.destroy(); reject(new Error("File too large")); }
        chunks.push(c);
      });
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
    request.setTimeout(30000, () => { request.destroy(); reject(new Error("Download timeout")); });
  });
}

// Streams to a temp file instead of buffering in memory, and doesn't abort
// early on size — used for video, where a too-big download can still be
// saved by compression instead of just being thrown away.
function downloadToFile(url, destPath, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("too many redirects"));
    const proto = url.startsWith("https") ? https : http;
    const request = proto.get(url, { headers: { "User-Agent": BROWSER_UA } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        const location = res.headers.location;
        if (!location) return reject(new Error("Redirect without location"));
        const nextUrl = location.startsWith("/") ? new URL(location, url).href : location;
        res.resume();
        return downloadToFile(nextUrl, destPath, redirects + 1).then(resolve).catch(reject);
      }
      if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on("finish", () => fileStream.close(() => resolve(destPath)));
      fileStream.on("error", reject);
      res.on("error", reject);
    }).on("error", reject);
    request.setTimeout(60000, () => { request.destroy(); reject(new Error("Download timeout")); });
  });
}

async function handlePinterest(message) {
  let url = extractPinterestUrl(message.content);
  if (!url) return false;

  try {
    await message.channel.sendTyping();

    url = await resolveRedirect(url);

    if (!url.includes("pinterest.com/pin/") && !url.includes("pinterest.com/video/")) {
      await message.reply({ content: `📌 View it here: ${url}` });
      return true;
    }

    let mediaUrl = null;
    let mediaType = "image";
    let isGif = false;

    // ── Get oEmbed data ──
    let oembed = null;
    try {
      oembed = await fetchOEmbed(url);
    } catch (e) {}

    // ── Fetch HTML for extra metadata and media ──
    let html = null;
    try {
      html = await fetchPageHtml(url);
      const media = extractMediaFromHtml(html);
      if (media) {
        mediaUrl = media.url;
        mediaType = media.type;
        isGif = mediaType === "gif";
      }
    } catch (e) {}

    // ── If no media from HTML, fallback to oEmbed ──
    if (!mediaUrl && oembed && oembed.url) {
      mediaUrl = oembed.url;
      mediaType = "image";
      isGif = mediaUrl.includes(".gif") || mediaUrl.includes("gif");
      if (oembed.type === "video" && oembed.html) {
        const videoMatch = oembed.html.match(/src="([^"]+\.mp4[^"]*)"/i);
        if (videoMatch) {
          mediaUrl = videoMatch[1];
          mediaType = "video";
        }
      }
    }

    // ── If still no media, send link ──
    if (!mediaUrl) {
      await message.reply({ content: `📌 View it here: ${url}` });
      return true;
    }

    // Clean URL
    mediaUrl = mediaUrl.replace(/\\/g, "").replace(/&amp;/g, "&");

    // Determine file name
    let fileName = "pinterest.jpg";
    if (mediaType === "video" || mediaUrl.includes(".mp4")) fileName = "pinterest.mp4";
    else if (isGif || mediaUrl.includes(".gif")) fileName = "pinterest.gif";
    else if (mediaUrl.includes(".png")) fileName = "pinterest.png";
    else if (mediaUrl.includes(".webp")) fileName = "pinterest.webp";

    // Save GIF if applicable
    if (isGif) saveGif(message.guild.id, mediaUrl);

    // ── Download media ──
    // Video is streamed to disk (can be large) and compressed if it doesn't
    // fit; images/gifs stay on the simple buffer path since they can't be
    // meaningfully compressed the same way.
    let buffer;
    if (mediaType === "video" || fileName.endsWith(".mp4")) {
      const tmpPath = path.join(os.tmpdir(), `pin_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
      await downloadToFile(mediaUrl, tmpPath);
      const size = fs.statSync(tmpPath).size;
      if (size <= MAX_BYTES) {
        buffer = fs.readFileSync(tmpPath);
        fs.unlink(tmpPath, () => {});
      } else {
        buffer = await compressToFit(tmpPath, MAX_BYTES).catch((err) => {
          console.error("[pinterest] compression failed", err.message);
          return null;
        });
        fs.unlink(tmpPath, () => {});
        if (!buffer) {
          await message.reply({ content: `📌 File too large. View it here: ${mediaUrl}` });
          return true;
        }
      }
    } else {
      buffer = await downloadBuffer(mediaUrl);
      if (buffer.length > MAX_BYTES) {
        await message.reply({ content: `📌 File too large. View it here: ${mediaUrl}` });
        return true;
      }
    }

    // Delete the original link message only once we have the final media ready to post.
    await message.delete().catch(() => {});

    await message.channel.send({
      files: [{ attachment: buffer, name: fileName }],
    });

    return true;

  } catch (err) {
    console.error("[pinterest]", err.message);
    try {
      await message.reply({ content: `📌 Couldn't fetch media directly. View it here: ${url}` });
    } catch (e) {}
    return false;
  }
}

// ── Slash-command-friendly version (works without a message object) ──
async function fetchPinterestResult(rawUrl) {
  let url = await resolveRedirect(rawUrl);

  if (!url.includes("pinterest.com/pin/") && !url.includes("pinterest.com/video/")) {
    return { embed: new EmbedBuilder().setColor(0xE60023).setTitle("View Pin").setURL(url).setTimestamp(), link: url };
  }

  let mediaUrl = null;
  let mediaType = "image";
  let isGif = false;

  let oembed = null;
  try { oembed = await fetchOEmbed(url); } catch (e) {}

  let metadata = { authorName: null, authorAvatar: null, description: null, likes: null, comments: null };
  try {
    const html = await fetchPageHtml(url);
    metadata = extractMetadataFromHtml(html);
    const media = extractMediaFromHtml(html);
    if (media) { mediaUrl = media.url; mediaType = media.type; isGif = mediaType === "gif"; }
  } catch (e) {}

  if (!mediaUrl && oembed && oembed.url) {
    mediaUrl = oembed.url;
    mediaType = "image";
    isGif = mediaUrl.includes(".gif") || mediaUrl.includes("gif");
    if (oembed.type === "video" && oembed.html) {
      const videoMatch = oembed.html.match(/src="([^"]+\.mp4[^"]*)"/i);
      if (videoMatch) { mediaUrl = videoMatch[1]; mediaType = "video"; }
    }
  }

  if (!mediaUrl) {
    return { embed: new EmbedBuilder().setColor(0xE60023).setTitle("View Pin").setURL(url).setTimestamp(), link: url };
  }

  mediaUrl = mediaUrl.replace(/\\/g, "").replace(/&amp;/g, "&");

  let fileName = "pinterest.jpg";
  if (mediaType === "video" || mediaUrl.includes(".mp4")) fileName = "pinterest.mp4";
  else if (isGif || mediaUrl.includes(".gif")) fileName = "pinterest.gif";
  else if (mediaUrl.includes(".png")) fileName = "pinterest.png";
  else if (mediaUrl.includes(".webp")) fileName = "pinterest.webp";

  const embed = new EmbedBuilder()
    .setColor(0xE60023)
    .setTitle(`${PINTEREST_EMOJI} View Original Pin`)
    .setURL(url)
    .setDescription(metadata.description || (isGif ? "🔄 Animated GIF" : mediaType === "video" ? "🎬 Pinterest Video" : "🖼️ Pinterest Image"))
    .setFooter({ text: "Pinterest" })
    .setTimestamp();

  if (metadata.authorName) {
    embed.setAuthor({ name: metadata.authorName, iconURL: metadata.authorAvatar || null });
  } else if (oembed && oembed.author_name) {
    embed.setAuthor({ name: oembed.author_name, iconURL: null });
  }

  if (mediaType === "image" && !isGif) {
    embed.setImage(mediaUrl);
  } else if (oembed && oembed.thumbnail_url) {
    embed.setThumbnail(oembed.thumbnail_url);
  }

  // (like/comment counts intentionally not displayed)

  let buffer;
  if (mediaType === "video" || fileName.endsWith(".mp4")) {
    const tmpPath = path.join(os.tmpdir(), `pin_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
    await downloadToFile(mediaUrl, tmpPath);
    const size = fs.statSync(tmpPath).size;
    if (size <= MAX_BYTES) {
      buffer = fs.readFileSync(tmpPath);
      fs.unlink(tmpPath, () => {});
    } else {
      buffer = await compressToFit(tmpPath, MAX_BYTES).catch((err) => {
        console.error("[pinterest] compression failed", err.message);
        return null;
      });
      fs.unlink(tmpPath, () => {});
      if (!buffer) return { embed, link: mediaUrl, isGif };
    }
  } else {
    buffer = await downloadBuffer(mediaUrl);
    if (buffer.length > MAX_BYTES) {
      return { embed, link: mediaUrl, isGif };
    }
  }

  return { embed, buffer, fileName, isGif, mediaUrl };
}

module.exports = { handlePinterest, extractPinterestUrl, fetchPinterestResult };