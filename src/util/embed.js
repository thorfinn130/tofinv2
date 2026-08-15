const { EmbedBuilder } = require("discord.js");
const { colors } = require("../config");

function base(title, description, color = colors.primary) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description ?? null)
    .setColor(color)
    .setTimestamp();
}

function rich({ title, description, color = colors.primary, fields = [], thumbnail, image, footer, author }) {
  const e = new EmbedBuilder()
    .setTitle(title ?? null)
    .setDescription(description ?? null)
    .setColor(color)
    .setTimestamp();
  if (fields.length) e.addFields(fields);
  if (thumbnail) e.setThumbnail(thumbnail);
  if (image) e.setImage(image);
  if (footer) e.setFooter(typeof footer === "string" ? { text: footer } : footer);
  if (author) e.setAuthor(typeof author === "string" ? { name: author } : author);
  return e;
}

// Visual progress bar — e.g. bar(7, 10, 10) → "███████░░░"
function bar(value, max, size = 12) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  const filled = Math.round(pct * size);
  return `${"█".repeat(filled)}${"░".repeat(size - filled)}`;
}

// Percentage label helper
function pct(value, max) {
  return `${Math.round((value / max) * 100)}%`;
}

// Divider line for embed descriptions
const LINE = "⎯".repeat(34);

const success = (t, d) => base(`<:checkmark:1517974555728023672>  ${t}`, d, colors.success);
const warn    = (t, d) => base(`<:problem:1517207782456168548>  ${t}`, d, colors.warn);
const danger  = (t, d) => base(`<:error:1517975133405577399>  ${t}`, d, colors.danger);
const info    = (t, d) => base(t, d, colors.primary);

module.exports = { base, rich, success, warn, danger, info, bar, pct, LINE };
