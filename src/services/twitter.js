const https = require("https");
const http = require("http");
const { EmbedBuilder } = require("discord.js");
const { saveGif } = require("./gifMemory");

// ── Replace with your custom emoji IDs ──
const TWITTER_EMOJI = "<:twitter:1519108059757019357>";


const TWITTER_REGEX = /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status\/(\d+)/i;

function extractTwitterUrl(text) {
  const m = text.match(TWITTER_REGEX);
  return m ? m[0].split('?')[0] : null;
}

// ── Fetch tweet data from vxtwitter (free, no key) ──
function fetchTwitterApi(tweetId) {
  return new Promise((resolve, reject) => {
    const url = `https://api.vxtwitter.com/status/${tweetId}`;
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

// ── Download buffer with proper headers (Referer for Twitter) ──
function downloadBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("too many redirects"));
    const proto = url.startsWith("https") ? https : http;
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    };
    // Twitter media requires Referer
    if (url.includes("twimg.com") || url.includes("twitter.com")) {
      headers["Referer"] = "https://twitter.com/";
      headers["Origin"] = "https://twitter.com";
    }
    const req = proto.get(url, { headers }, (res) => {
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
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("Download timeout")); });
  });
}

const MAX_BYTES = 25 * 1024 * 1024; // Increased to 25MB for better compatibility

// ── Main handler ──
async function handleTwitter(message) {
  const url = extractTwitterUrl(message.content);
  if (!url) return false;

  try {
    await message.channel.sendTyping();

    const tweetId = url.match(/\/status\/(\d+)/i)?.[1];
    if (!tweetId) return false;

    const data = await fetchTwitterApi(tweetId);
    if (!data) return false;

    // ── Extract media ──
    let mediaList = data.media_extended || [];
    let mediaUrl = null;
    let mediaType = null; // 'image', 'gif', 'video'
    let isGif = false;

    // No media at all — nothing to post as "just video", fall back to a link.
    if (mediaList.length === 0) {
      return message.reply({ content: `🐦 No media found. View it here: ${url}` });
    }

    // ── Prioritize GIFs, then videos, then images ──
    const gifMedia = mediaList.find(m => m.type === "gif");
    if (gifMedia) {
      mediaUrl = gifMedia.url;
      mediaType = "gif";
      isGif = true;
    } else {
      const videoMedia = mediaList.find(m => m.type === "video");
      if (videoMedia) {
        mediaUrl = videoMedia.url;
        mediaType = "video";
      } else {
        const imageMedia = mediaList.find(m => m.type === "image");
        if (imageMedia) {
          mediaUrl = imageMedia.url;
          mediaType = "image";
        }
      }
    }

    if (!mediaUrl) {
      return message.reply({ content: `🐦 No media found. View it here: ${url}` });
    }

    // ── Clean URL ──
    mediaUrl = mediaUrl.replace(/&amp;/g, "&");

    // ── Save GIF if needed ──
    if (isGif) {
      saveGif(message.guild.id, mediaUrl);
    }

    // ── Download media ──
    const buffer = await downloadBuffer(mediaUrl);
    if (!buffer || buffer.length === 0) throw new Error("Empty download");

    if (buffer.length > MAX_BYTES) {
      // Too large – send link instead
      return message.reply({ content: `📁 File too large. View it here: ${mediaUrl}` });
    }

    // ── Determine file extension ──
    let ext = "jpg";
    const headerHex = buffer.toString("hex", 0, 4);
    if (headerHex === "47494638") ext = "gif";
    else if (headerHex === "89504e47") ext = "png";
    else if (headerHex.startsWith("ffd8")) ext = "jpg";
    else if (mediaUrl.includes(".mp4") || mediaType === "video") ext = "mp4";
    else if (mediaUrl.includes(".gif")) ext = "gif";
    else if (mediaUrl.includes(".png")) ext = "png";
    else if (mediaUrl.includes(".webp")) ext = "webp";

    const fileName = `twitter.${ext}`;

    // Delete the original link message only once we have the final media ready to post.
    await message.delete().catch(() => {});

    await message.channel.send({
      files: [{ attachment: buffer, name: fileName }],
    });

    return true;

  } catch (err) {
    console.error("[twitter]", err.message);
    // Fallback: send the link as a last resort
    try {
      await message.reply({ content: `🐦 Couldn't fetch media. View it here: ${url}` });
    } catch (e) {}
    return false;
  }
}

// ── Slash-command-friendly version (works without a message object) ──
async function fetchTwitterResult(url) {
  const tweetId = url.match(/\/status\/(\d+)/i)?.[1];
  if (!tweetId) throw new Error("Could not parse a tweet ID from that link.");

  const data = await fetchTwitterApi(tweetId);
  if (!data) throw new Error("No data returned for that tweet.");

  let mediaList = data.media_extended || [];
  let mediaUrl = null;
  let mediaType = null;
  let isGif = false;

  const buildBaseEmbed = () =>
    new EmbedBuilder()
      .setColor(0x1DA1F2)
      .setTitle(`${TWITTER_EMOJI} View Original Post`)
      .setURL(url)
      .setAuthor({ name: `${data.user_name} (@${data.user_screen_name})` })
      .setDescription(data.text || "Twitter Post")
      .setFooter({ text: "Twitter" })
      .setTimestamp();

  if (mediaList.length === 0) {
    return { embed: buildBaseEmbed() };
  }

  const gifMedia = mediaList.find(m => m.type === "gif");
  if (gifMedia) {
    mediaUrl = gifMedia.url; mediaType = "gif"; isGif = true;
  } else {
    const videoMedia = mediaList.find(m => m.type === "video");
    if (videoMedia) {
      mediaUrl = videoMedia.url; mediaType = "video";
    } else {
      const imageMedia = mediaList.find(m => m.type === "image");
      if (imageMedia) { mediaUrl = imageMedia.url; mediaType = "image"; }
    }
  }

  if (!mediaUrl) return { embed: buildBaseEmbed() };

  mediaUrl = mediaUrl.replace(/&amp;/g, "&");
  const embed = buildBaseEmbed();

  const buffer = await downloadBuffer(mediaUrl);
  if (!buffer || buffer.length === 0) throw new Error("Empty download.");

  if (buffer.length > MAX_BYTES) {
    return { embed, link: mediaUrl, isGif };
  }

  let ext = "jpg";
  const headerHex = buffer.toString("hex", 0, 4);
  if (headerHex === "47494638") ext = "gif";
  else if (headerHex === "89504e47") ext = "png";
  else if (headerHex.startsWith("ffd8")) ext = "jpg";
  else if (mediaUrl.includes(".mp4") || mediaType === "video") ext = "mp4";
  else if (mediaUrl.includes(".gif")) ext = "gif";
  else if (mediaUrl.includes(".png")) ext = "png";
  else if (mediaUrl.includes(".webp")) ext = "webp";

  return { embed, buffer, fileName: `twitter.${ext}`, isGif, mediaUrl };
}

module.exports = { handleTwitter, extractTwitterUrl, fetchTwitterResult };