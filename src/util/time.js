// "10m", "1h30m", "2d", "45s" -> milliseconds
function parseDuration(str) {
  if (!str) return null;
  const re = /(\d+)\s*(s|m|h|d|w)/gi;
  let total = 0;
  let match;
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  while ((match = re.exec(str)) !== null) {
    total += parseInt(match[1], 10) * mult[match[2].toLowerCase()];
  }
  return total || null;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

module.exports = { parseDuration, formatDuration };
