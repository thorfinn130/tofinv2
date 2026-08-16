const fs   = require("fs");
const path = require("path");

const STORE  = path.join(__dirname, "../../data/guild_gifs.json");
const MAX    = 60; // max GIFs stored per guild

function load() {
  try { return JSON.parse(fs.readFileSync(STORE, "utf8")); }
  catch { return {}; }
}
function save(d) { fs.writeFileSync(STORE, JSON.stringify(d, null, 2)); }

// ── Extract a usable GIF URL from a Discord message ───────────────────────────
function extractGifUrl(message) {
  // 1. File attachment (.gif)
  for (const [, att] of message.attachments) {
    if (att.contentType === "image/gif" || att.url?.toLowerCase().includes(".gif")) {
      return att.url;
    }
  }

  // 2. Discord embed from Tenor GIF picker (type = "gifv")
  for (const embed of message.embeds) {
    if (embed.type === "gifv") {
      // embed.url is the Tenor page URL — Discord will re-embed it as a GIF
      if (embed.url) return embed.url;
    }
    // Some clients send image embeds with .gif URLs
    if (embed.type === "image" && embed.url?.toLowerCase().includes(".gif")) {
      return embed.url;
    }
    // Tenor media proxy inside an embed
    const imgUrl = embed.image?.url ?? embed.thumbnail?.url;
    if (imgUrl && imgUrl.includes("tenor.com") || imgUrl?.includes(".gif")) {
      return imgUrl;
    }
  }

  // 3. Direct .gif or Tenor/Giphy/media URL in message text
  const content = message.content || "";
  const gifInContent = content.match(
    /https?:\/\/(?:media\.tenor\.com|tenor\.com\/view|media\.giphy\.com|i\.imgur\.com)[^\s]*/i
  );
  if (gifInContent) return gifInContent[0];

  const directGif = content.match(/https?:\/\/[^\s]+\.gif(?:\?[^\s]*)?/i);
  if (directGif) return directGif[0];

  return null;
}

// Domains known to issue long-lived, stable URLs — safe to store and reuse
// indefinitely (Tenor/Giphy/Imgur don't sign or expire their links, and our
// own Cloudinary uploads are permanent by design).
const STABLE_DOMAINS = [
  "tenor.com", "media.tenor.com", "media1.tenor.com",
  "giphy.com", "media.giphy.com",
  "imgur.com", "i.imgur.com",
  "res.cloudinary.com",
];

function isStableUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return STABLE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

// ── Save a GIF URL for a guild ────────────────────────────────────────────────
// Only genuinely permanent links get kept — Discord attachment URLs and most
// third-party CDN links (TikTok, Twitter, Pinterest) carry a signed signature
// that expires within hours once the link is copied out of its original
// message, so saving those for later reuse just produces dead links down the
// line. Skip them here rather than storing something that will go stale.
function saveGif(guildId, url) {
  if (!url || !isStableUrl(url)) return;
  const d = load();
  if (!d[guildId]) d[guildId] = [];
  if (d[guildId].some(g => g.url === url)) return; // no dupes
  d[guildId].unshift({ url, savedAt: Date.now() });
  if (d[guildId].length > MAX) d[guildId] = d[guildId].slice(0, MAX);
  save(d);
}

// ── Get a random selection of saved GIFs for a guild ─────────────────────────
function getGifs(guildId, limit = 10) {
  const all = (load()[guildId] || []).map(g => g.url);
  if (all.length <= limit) return all;
  // Shuffle and pick `limit` random ones
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, limit);
}

module.exports = { extractGifUrl, saveGif, getGifs };
