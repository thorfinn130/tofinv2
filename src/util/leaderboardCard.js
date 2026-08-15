const { createCanvas, loadImage } = require("@napi-rs/canvas");
const https = require("https");
const http = require("http");

const W = 700;
const ROW_H = 52;
const ROW_GAP = 10;
const PAD_X = 24;
const PAD_TOP = 90;
const PAD_BOTTOM = 30;

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, (res) => {
      if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Rank number colors, matching the reference: gold / silver / bronze / muted
function rankColor(i) {
  if (i === 0) return "#fbbf24"; // gold
  if (i === 1) return "#e5e7eb"; // silver
  if (i === 2) return "#f0955a"; // bronze
  return "#7c7f93";              // muted gray
}

// Draws a small rounded-square avatar. Falls back to a solid initial tile if
// the avatar can't be fetched/decoded, so a broken CDN link never leaves a
// blank/broken image in the row (unlike the reference screenshot).
async function drawAvatar(ctx, avatarURL, username, x, y, size) {
  const r = 10;
  try {
    const buf = await fetchBuffer(avatarURL.includes("?") ? avatarURL : `${avatarURL}?size=128`);
    const img = await loadImage(buf);
    ctx.save();
    roundRect(ctx, x, y, size, size, r);
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  } catch {
    const grad = ctx.createLinearGradient(x, y, x + size, y + size);
    grad.addColorStop(0, "#5865f2");
    grad.addColorStop(1, "#8a5cf6");
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, size, size, r);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.floor(size * 0.45)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((username?.[0] ?? "?").toUpperCase(), x + size / 2, y + size / 2 + 1);
  }
}

// entries: [{ rank, userId, username, avatarURL, level, xp, xpNeeded }]
async function generateLeaderboardCard({ title, entries, metricLabel = "Overall XP" }) {
  const rowsHeight = entries.length * ROW_H + Math.max(0, entries.length - 1) * ROW_GAP;
  const H = PAD_TOP + rowsHeight + PAD_BOTTOM + 60; // +60 for the metric label pill at the bottom
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ── Background ──
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0d0821");
  bg.addColorStop(1, "#160a2e");
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 18);
  ctx.fill();

  // ── Title ──
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(title, PAD_X, 48);

  // ── Rows ──
  let y = PAD_TOP;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const rowX = PAD_X;
    const rowW = W - PAD_X * 2;

    // Row background
    ctx.fillStyle = "#181229";
    roundRect(ctx, rowX, y, rowW, ROW_H, 8);
    ctx.fill();

    // Avatar
    const avatarSize = ROW_H - 12;
    const avatarX = rowX + 6;
    const avatarY = y + 6;
    await drawAvatar(ctx, e.avatarURL, e.username, avatarX, avatarY, avatarSize);

    // Rank + username + level
    const textX = avatarX + avatarSize + 16;
    ctx.textBaseline = "alphabetic";
    ctx.font = "bold 16px sans-serif";
    const rankText = `#${e.rank}`;
    ctx.fillStyle = rankColor(i);
    ctx.fillText(rankText, textX, y + 24);
    const rankWidth = ctx.measureText(rankText).width;

    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#9a96ad";
    const dot = "  •  ";
    ctx.fillText(dot, textX + rankWidth, y + 24);
    const dotWidth = ctx.measureText(dot).width;

    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#f2f2f5";
    const nameText = `@${e.username}`;
    ctx.fillText(nameText, textX + rankWidth + dotWidth, y + 24);
    const nameWidth = ctx.measureText(nameText).width;

    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#9a96ad";
    ctx.fillText(`  •  LVL: ${e.level}`, textX + rankWidth + dotWidth + nameWidth, y + 24);

    // Progress underline (XP progress toward next level)
    const barY = y + ROW_H - 10;
    const barW = rowW - (textX - rowX) - 12;
    const pct = e.xpNeeded ? Math.min(e.xp / e.xpNeeded, 1) : 0;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx, textX, barY, barW, 4, 2);
    ctx.fill();
    if (pct > 0) {
      const fillGrad = ctx.createLinearGradient(textX, 0, textX + barW, 0);
      fillGrad.addColorStop(0, "#34d399");
      fillGrad.addColorStop(1, "#22c55e");
      ctx.fillStyle = fillGrad;
      roundRect(ctx, textX, barY, Math.max(4, barW * pct), 4, 2);
      ctx.fill();
    }

    y += ROW_H + ROW_GAP;
  }

  // ── Metric label pill (static — only "Overall XP" is tracked) ──
  const pillY = y + 10;
  const pillH = 40;
  ctx.fillStyle = "#181229";
  roundRect(ctx, PAD_X, pillY, W - PAD_X * 2, pillH, 10);
  ctx.fill();
  ctx.fillStyle = "#e5e5ea";
  ctx.font = "bold 15px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(metricLabel, PAD_X + 14, pillY + pillH / 2 + 1);
  ctx.fillStyle = "#7c7f93";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("▾", W - PAD_X - 14, pillY + pillH / 2 + 1);

  return canvas.toBuffer("image/png");
}

module.exports = { generateLeaderboardCard };