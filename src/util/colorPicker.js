const { createCanvas, loadImage } = require("@napi-rs/canvas");
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder,
} = require("discord.js");
const https = require("https");
const http  = require("http");

// ── Color math ────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function hslToHex(h, s, l) {
  const [r, g, b] = hslToRgb(h, s, l);
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function hexToHsl(hex) {
  const clean = hex.replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [235, 88, 67];
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return rgbToHsl(
    Math.round(r * 255),
    Math.round(g * 255),
    Math.round(b * 255),
  );
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

// ── Image sampling ────────────────────────────────────────────────────────────

function fetchBuf(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout: 6000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

async function sampleImageColor(url) {
  try {
    const buf = await fetchBuf(url);
    const img = await loadImage(buf);
    const SIZE = 48;
    const c = createCanvas(SIZE, SIZE);
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0, SIZE, SIZE);
    const { data } = x.getImageData(0, 0, SIZE, SIZE);
    let bH = 235, bS = 88, bL = 67, best = -1;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 128) continue;
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      const score = s * (1 - Math.abs(l - 50) / 50);
      if (score > best) { best = score; bH = h; bS = s; bL = l; }
    }
    return [bH, Math.max(20, bS), clamp(bL, 20, 80)];
  } catch {
    return [235, 88, 67];
  }
}

// ── Canvas generation ─────────────────────────────────────────────────────────

function rrect(ctx, x, y, w, h, r) {
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

async function generatePickerImage(h, s, l) {
  const CW = 630, CH = 310;

  // Layout
  const PX = 18, PY = 18, PW = 390, PH = 210; // 2D picker
  const HBY = PY + PH + 16;                    // hue bar y
  const HBH = 22;                               // hue bar height
  const IPX = PX + PW + 20;                    // info panel x
  const IW  = CW - IPX - PX;                   // info panel width (~184px)

  const canvas = createCanvas(CW, CH);
  const ctx = canvas.getContext("2d");

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = "#0e0e18";
  ctx.fillRect(0, 0, CW, CH);

  // ── 2D colour picker ────────────────────────────────────────────────────────
  // 1. Base hue colour
  ctx.fillStyle = `hsl(${h}, 100%, 50%)`;
  ctx.fillRect(PX, PY, PW, PH);

  // 2. White → transparent overlay (saturation axis)
  const wGrad = ctx.createLinearGradient(PX, 0, PX + PW, 0);
  wGrad.addColorStop(0, "rgba(255,255,255,1)");
  wGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = wGrad;
  ctx.fillRect(PX, PY, PW, PH);

  // 3. Transparent → black overlay (lightness axis)
  const bGrad = ctx.createLinearGradient(0, PY, 0, PY + PH);
  bGrad.addColorStop(0, "rgba(0,0,0,0)");
  bGrad.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = bGrad;
  ctx.fillRect(PX, PY, PW, PH);

  // Border
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(PX + 0.5, PY + 0.5, PW - 1, PH - 1);

  // Cursor ring
  const cX = PX + (s / 100) * PW;
  const cY = PY + ((100 - l) / 100) * PH;
  // outer dark ring for contrast
  ctx.beginPath();
  ctx.arc(cX, cY, 9, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 3.5;
  ctx.stroke();
  // inner white ring
  ctx.beginPath();
  ctx.arc(cX, cY, 9, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();

  // ── Hue bar ──────────────────────────────────────────────────────────────────
  const hGrad = ctx.createLinearGradient(PX, 0, PX + PW, 0);
  ["#ff0000","#ffff00","#00ff00","#00ffff","#0000ff","#ff00ff","#ff0000"]
    .forEach((c, i) => hGrad.addColorStop(i / 6, c));
  ctx.fillStyle = hGrad;
  ctx.fillRect(PX, HBY, PW, HBH);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(PX + 0.5, HBY + 0.5, PW - 1, HBH - 1);

  // Hue cursor
  const hX = PX + (h / 360) * PW;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(hX, HBY); ctx.lineTo(hX, HBY + HBH); ctx.stroke();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(hX, HBY); ctx.lineTo(hX, HBY + HBH); ctx.stroke();
  // small triangles
  for (const [ty, dir] of [[HBY - 1, 1], [HBY + HBH + 1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(hX, ty);
    ctx.lineTo(hX - 5, ty - dir * 6);
    ctx.lineTo(hX + 5, ty - dir * 6);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }

  // ── Bottom hint text ─────────────────────────────────────────────────────────
  const BY = HBY + HBH + 12;
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "11px sans-serif";
  ctx.fillText("← Saturation →", PX, BY);

  // ── Info panel ───────────────────────────────────────────────────────────────
  const [r, g, b] = hslToRgb(h, s, l);
  const hex = hslToHex(h, s, l);

  // Colour swatch
  const swH = 128;
  rrect(ctx, IPX, PY, IW, swH, 10);
  ctx.fillStyle = hex;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Hex label centred over swatch
  const textColor = l > 58 ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.9)";
  ctx.fillStyle = textColor;
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(hex, IPX + IW / 2, PY + swH / 2 + 8);
  ctx.textAlign = "left";

  // Info rows below swatch
  const infoY = PY + swH + 14;
  const infoH = CH - infoY - PY;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  rrect(ctx, IPX, infoY, IW, infoH, 8);
  ctx.fill();

  const rows = [
    ["RGB", `${r},  ${g},  ${b}`],
    ["HSL", `${h}°  ${s}%  ${l}%`],
  ];
  rows.forEach(([lbl, val], i) => {
    const ry = infoY + 24 + i * 40;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "11px sans-serif";
    ctx.fillText(lbl, IPX + 12, ry);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(val, IPX + 12, ry + 18);
  });

  return canvas.toBuffer("image/png");
}

// ── Discord message builder ───────────────────────────────────────────────────

function buildPickerMessage(userId, h, s, l, buf) {
  const hex = hslToHex(h, s, l);
  const att = new AttachmentBuilder(buf, { name: "colorpicker.png" });

  const embed = new EmbedBuilder()
    .setTitle("🎨  Color Picker")
    .setDescription(
      `Current color: **${hex}**\n` +
      `-# Use buttons to adjust hue · saturation · lightness  •  ✏️ Type Hex for exact input  •  🖼️ sample from image`
    )
    .setImage("attachment://colorpicker.png")
    .setColor(parseInt(hex.replace("#", ""), 16))
    .setFooter({ text: `H: ${h}°  •  S: ${s}%  •  L: ${l}%` });

  const key = `${userId}:${h}:${s}:${l}`;

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cp_hd30:${key}`).setLabel("−30").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cp_hd10:${key}`).setLabel("−10").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cp_hlbl:${key}`).setLabel(`🎨  H: ${h}°`).setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId(`cp_hu10:${key}`).setLabel("+10").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cp_hu30:${key}`).setLabel("+30").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cp_sd20:${key}`).setLabel("−20").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cp_sd10:${key}`).setLabel("−10").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cp_slbl:${key}`).setLabel(`💧  S: ${s}%`).setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId(`cp_su10:${key}`).setLabel("+10").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cp_su20:${key}`).setLabel("+20").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cp_ld20:${key}`).setLabel("−20").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cp_ld10:${key}`).setLabel("−10").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cp_llbl:${key}`).setLabel(`☀️  L: ${l}%`).setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId(`cp_lu10:${key}`).setLabel("+10").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cp_lu20:${key}`).setLabel("+20").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cp_hex:${key}`).setLabel("Type Hex").setStyle(ButtonStyle.Secondary).setEmoji("✏️"),
      new ButtonBuilder().setCustomId(`cp_img:${key}`).setLabel("From Image URL").setStyle(ButtonStyle.Secondary).setEmoji("🖼️"),
      new ButtonBuilder().setCustomId(`cp_end:${key}`).setLabel("Done").setStyle(ButtonStyle.Success).setEmoji("✅"),
    ),
  ];

  return { embeds: [embed], files: [att], components: rows };
}

module.exports = {
  hslToHex, hexToHsl, hslToRgb, rgbToHsl, clamp,
  sampleImageColor, generatePickerImage, buildPickerMessage,
};
