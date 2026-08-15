const https = require("https");
const http  = require("http");
const { EmbedBuilder } = require("discord.js");
const { saveGif } = require("./gifMemory");
const { compressToFit } = require("../util/videoCompressor");

const TIKTOK_REGEX = /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+/i;

function extractTikTokUrl(text) {
  const m = text.match(TIKTOK_REGEX);
  return m ? m[0].replace(/[.,!?)]+$/, "") : null;
}

function apiPost(url) {
  return new Promise((resolve, reject) => {
    const body = `url=${encodeURIComponent(url)}&hd=1`;
    const req = https.request(
      {
        hostname: "www.tikwm.com",
        path: "/api/",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "TofinBot/1.0",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.code !== 0) return reject(new Error(json.msg || "API error"));
            resolve(json.data);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("API timeout")); });
    req.write(body);
    req.end();
  });
}

function downloadBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("too many redirects"));
    const proto = url.startsWith("https") ? https : http;
    const req = proto.get(url, { headers: { "User-Agent": "TofinBot/1.0" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadBuffer(res.headers.location, redirects + 1).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("download timeout")); });
  });
}

const MAX_BYTES = 8 * 1024 * 1024;

async function handleTikTok(message) {
  const url = extractTikTokUrl(message.content);
  if (!url) return false;

  try {
    await message.channel.sendTyping();

    const data = await apiPost(url);
    const videoUrl = data.play;

    if (videoUrl && (videoUrl.includes(".gif") || data.is_gif)) {
      saveGif(message.guild.id, videoUrl);
    }

    const buffer = await downloadBuffer(videoUrl);

    let finalBuffer = buffer;
    if (finalBuffer.length > MAX_BYTES) {
      finalBuffer = await compressToFit(finalBuffer, MAX_BYTES).catch((err) => {
        console.error("[tiktok] compression failed", err.message);
        return null;
      });
    }

    if (!finalBuffer) {
      // Couldn't get it under the size limit — nothing to post as "just video",
      // so fall back to the link instead of losing the content entirely.
      return message.reply({ content: videoUrl });
    }

    // Delete the original link message only once we have the final video ready to post.
    await message.delete().catch(() => {});

    await message.channel.send({
      files: [{ attachment: finalBuffer, name: "tiktok.mp4" }],
    });

    return true;
  } catch (err) {
    console.error("[tiktok]", err.message);
    return false;
  }
}

// ── Slash-command-friendly version (works from an interaction instead of a message) ──
async function fetchTikTokResult(url) {
  const data = await apiPost(url);
  const videoUrl = data.play;
  const author   = data.author?.nickname || "unknown";
  const handle   = data.author?.unique_id ? `@${data.author.unique_id}` : "";
  const title    = (data.title || "").slice(0, 120) || "TikTok video";

  const embed = new EmbedBuilder()
    .setColor(0xFE2C55)
    .setTitle("<:tiktok:1519108519209468004> View Original Post")
    .setURL(url)
    .setAuthor({ name: `${author} (${handle})`, iconURL: data.author?.avatar })
    .setDescription(title)
    .setFooter({ text: "tiktok" })
    .setTimestamp();

  const buffer = await downloadBuffer(videoUrl);
  const isGif = videoUrl?.includes(".gif") || !!data.is_gif;

  if (buffer.length <= MAX_BYTES) {
    return { embed, buffer, fileName: "tiktok.mp4", isGif, mediaUrl: videoUrl };
  }

  const compressed = await compressToFit(buffer, MAX_BYTES).catch((err) => {
    console.error("[tiktok] compression failed", err.message);
    return null;
  });

  if (compressed) {
    return { embed, buffer: compressed, fileName: "tiktok.mp4", isGif, mediaUrl: videoUrl };
  }

  // Compression genuinely couldn't get it under the limit — fall back to the raw link.
  return { embed, link: videoUrl, isGif };
}

module.exports = { handleTikTok, extractTikTokUrl, fetchTikTokResult };