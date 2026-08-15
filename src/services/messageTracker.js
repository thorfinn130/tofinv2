const { read, write } = require("../storage");

const STORE = "message_counts";

function _read()   { return read(STORE, {}); }
function _write(d) { write(STORE, d); }

// ── Date helpers ──────────────────────────────────────────────────────────────
function todayKey()   { return new Date().toISOString().slice(0, 10); }           // "2026-06-21"
function weekKey()    { const d = new Date(); const jan = new Date(d.getFullYear(), 0, 1); const w = Math.ceil((((d - jan) / 86400000) + jan.getDay() + 1) / 7); return `${d.getFullYear()}-W${w}`; }
function monthKey()   { return new Date().toISOString().slice(0, 7); }            // "2026-06"

function defaultUser() {
  return {
    daily:   { key: todayKey(),  count: 0 },
    weekly:  { key: weekKey(),   count: 0 },
    monthly: { key: monthKey(),  count: 0 },
    total:   0,
  };
}

function getUser(guildId, userId) {
  const all = _read();
  return all[guildId]?.[userId] ?? defaultUser();
}

function track(guildId, userId) {
  const all = _read();
  if (!all[guildId])          all[guildId] = {};
  if (!all[guildId][userId])  all[guildId][userId] = defaultUser();
  const u = all[guildId][userId];

  const today = todayKey();
  const week  = weekKey();
  const month = monthKey();

  if (u.daily.key   !== today) u.daily   = { key: today, count: 0 };
  if (u.weekly.key  !== week)  u.weekly  = { key: week,  count: 0 };
  if (u.monthly.key !== month) u.monthly = { key: month, count: 0 };

  u.daily.count++;
  u.weekly.count++;
  u.monthly.count++;
  u.total++;

  all[guildId][userId] = u;
  _write(all);
}

// Top N senders in a guild for a given period: "daily" | "weekly" | "monthly" | "total"
function getLeaderboard(guildId, period = "total", limit = 10) {
  const all = _read();
  const guild = all[guildId] ?? {};
  const today = todayKey(); const week = weekKey(); const month = monthKey();

  return Object.entries(guild)
    .map(([userId, u]) => {
      let count;
      if (period === "daily")   count = u.daily.key   === today ? u.daily.count   : 0;
      else if (period === "weekly")  count = u.weekly.key  === week  ? u.weekly.count  : 0;
      else if (period === "monthly") count = u.monthly.key === month ? u.monthly.count : 0;
      else                           count = u.total;
      return { userId, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

module.exports = { track, getUser, getLeaderboard };
