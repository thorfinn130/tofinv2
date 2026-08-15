const { createCanvas, loadImage } = require("@napi-rs/canvas");
const https = require("https");
const http = require("http");

const W = 934;
const H = 260;

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, (res) => {
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

// { username, avatarURL, level, xp, xpNeeded, rank, totalMembers, totalXp }
async function generateRankCard({ username, avatarURL, level, xp, xpNeeded, rank, totalMembers, totalXp }) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ── Background ──
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0d0d1a");
  bg.addColorStop(1, "#1a1a2e");
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fill();

  // Subtle grid overlay
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Accent glow top-left
  const glow = ctx.createRadialGradient(160, 130, 0, 160, 130, 200);
  glow.addColorStop(0, "rgba(88, 101, 242, 0.18)");
  glow.addColorStop(1, "rgba(88, 101, 242, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── Avatar ──
  const AX = 50, AY = 70, AR = 70;
  try {
    const avBuf = await fetchBuffer(avatarURL + "?size=256");
    const avatar = await loadImage(avBuf);
    ctx.save();
    ctx.beginPath();
    ctx.arc(AX + AR, AY + AR, AR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, AX, AY, AR * 2, AR * 2);
    ctx.restore();
  } catch {
    ctx.fillStyle = "#5865f2";
    ctx.beginPath();
    ctx.arc(AX + AR, AY + AR, AR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(username[0].toUpperCase(), AX + AR, AY + AR);
  }

  // Avatar ring
  ctx.strokeStyle = "#5865f2";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(AX + AR, AY + AR, AR + 3, 0, Math.PI * 2);
  ctx.stroke();

  const LEFT = AX + AR * 2 + 30;

  // ── Username ──
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(username, LEFT, 105);

  // ── Rank pill ──
  const rankText = rank ? `RANK #${rank}${totalMembers ? ` / ${totalMembers}` : ""}` : "UNRANKED";
  ctx.font = "bold 13px sans-serif";
  const rkW = ctx.measureText(rankText).width + 20;
  const rkX = LEFT;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundRect(ctx, rkX, 116, rkW, 24, 8);
  ctx.fill();
  ctx.fillStyle = "#fee75c";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(rankText, rkX + rkW / 2, 128);

  // ── Level badge ──
  const lvText = `LEVEL ${level}`;
  ctx.font = "bold 14px sans-serif";
  const lvW = ctx.measureText(lvText).width + 20;
  const lvX = W - lvW - 30;
  const lvBg = ctx.createLinearGradient(lvX, 0, lvX + lvW, 0);
  lvBg.addColorStop(0, "#5865f2");
  lvBg.addColorStop(1, "#eb459e");
  ctx.fillStyle = lvBg;
  roundRect(ctx, lvX, 75, lvW, 28, 8);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(lvText, lvX + lvW / 2, 89);

  // ── XP Bar ──
  const BAR_X = LEFT;
  const BAR_Y = 160;
  const BAR_W = W - LEFT - 30;
  const BAR_H = 24;
  const pct = Math.min(xp / xpNeeded, 1);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundRect(ctx, BAR_X, BAR_Y, BAR_W, BAR_H, BAR_H / 2);
  ctx.fill();

  if (pct > 0) {
    const barFill = ctx.createLinearGradient(BAR_X, 0, BAR_X + BAR_W, 0);
    barFill.addColorStop(0, "#5865f2");
    barFill.addColorStop(0.5, "#eb459e");
    barFill.addColorStop(1, "#fee75c");
    ctx.fillStyle = barFill;
    roundRect(ctx, BAR_X, BAR_Y, Math.max(BAR_H, BAR_W * pct), BAR_H, BAR_H / 2);
    ctx.fill();

    const shine = ctx.createLinearGradient(BAR_X, BAR_Y, BAR_X, BAR_Y + BAR_H);
    shine.addColorStop(0, "rgba(255,255,255,0.2)");
    shine.addColorStop(0.5, "rgba(255,255,255,0)");
    ctx.fillStyle = shine;
    roundRect(ctx, BAR_X, BAR_Y, Math.max(BAR_H, BAR_W * pct), BAR_H / 2, BAR_H / 2);
    ctx.fill();
  }

  ctx.font = "bold 12px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`${xp.toLocaleString()} / ${xpNeeded.toLocaleString()} XP`, BAR_X + 12, BAR_Y + BAR_H / 2);
  ctx.textAlign = "right";
  ctx.fillText(`${Math.round(pct * 100)}%`, BAR_X + BAR_W - 12, BAR_Y + BAR_H / 2);

  // ── Total XP footer ──
  ctx.textAlign = "left";
  ctx.font = "13px sans-serif";
  ctx.fillStyle = "#888";
  ctx.fillText(`✨  ${(totalXp || 0).toLocaleString()} total XP earned`, LEFT, 210);

  // Divider
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LEFT, 198);
  ctx.lineTo(W - 30, 198);
  ctx.stroke();

  return canvas.toBuffer("image/png");
}

module.exports = { generateRankCard };
