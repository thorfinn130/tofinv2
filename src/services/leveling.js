const { read, write, getGuild, setGuild } = require("../storage");

const STORE = "leveling";
const SETTINGS_STORE = "guild_settings";
const XP_COOLDOWN = 30_000;
const xpCooldowns = new Map();

function xpNeeded(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

function defaultUser() {
  return { xp: 0, level: 1, totalXp: 0 };
}

function _read() { return read(STORE, {}); }
function _write(d) { write(STORE, d); }

function getUser(guildId, userId) {
  const d = _read();
  return d[guildId]?.[userId] ?? defaultUser();
}

function setUser(guildId, userId, u) {
  const d = _read();
  if (!d[guildId]) d[guildId] = {};
  d[guildId][userId] = u;
  _write(d);
}

// ---- Per-guild XP settings (rate + cooldown), defaults keep old behaviour ----
function getXpSettings(guildId) {
  const s = getGuild(SETTINGS_STORE, guildId, {});
  return {
    xpPerMessage: s.xpPerMessage ?? 15,
    cooldownMs: s.xpCooldownMs ?? XP_COOLDOWN,
  };
}

function setXpRate(guildId, xpPerMessage) {
  const s = getGuild(SETTINGS_STORE, guildId, {});
  s.xpPerMessage = Math.max(1, parseInt(xpPerMessage) || 15);
  setGuild(SETTINGS_STORE, guildId, s);
  return s.xpPerMessage;
}

function setXpCooldown(guildId, seconds) {
  const s = getGuild(SETTINGS_STORE, guildId, {});
  s.xpCooldownMs = Math.max(0, (parseInt(seconds) || 30) * 1000);
  setGuild(SETTINGS_STORE, guildId, s);
  return s.xpCooldownMs;
}

// ---- Level-role rewards: { guildId: [{ level, roleId }] } ----
const LEVELROLES_STORE = "level_roles";
function getLevelRoles(guildId) {
  const d = read(LEVELROLES_STORE, {});
  return (d[guildId] ?? []).sort((a, b) => a.level - b.level);
}

function addLevelRole(guildId, level, roleId) {
  const d = read(LEVELROLES_STORE, {});
  if (!d[guildId]) d[guildId] = [];
  d[guildId] = d[guildId].filter((r) => r.level !== level);
  d[guildId].push({ level, roleId });
  write(LEVELROLES_STORE, d);
  return d[guildId];
}

function removeLevelRole(guildId, level) {
  const d = read(LEVELROLES_STORE, {});
  if (!d[guildId]) return [];
  d[guildId] = d[guildId].filter((r) => r.level !== level);
  write(LEVELROLES_STORE, d);
  return d[guildId];
}

// Roles the member should have based on their level (stacking: every threshold reached)
function rolesEarnedAt(guildId, level) {
  return getLevelRoles(guildId).filter((r) => level >= r.level).map((r) => r.roleId);
}

// Admin setters
function adminSetLevel(guildId, userId, level) {
  const u = getUser(guildId, userId);
  u.level = Math.max(1, parseInt(level) || 1);
  u.xp = 0;
  setUser(guildId, userId, u);
  return u;
}

function adminAddXp(guildId, userId, amount) {
  const u = getUser(guildId, userId);
  const gain = parseInt(amount) || 0;
  u.xp += gain;
  u.totalXp = (u.totalXp || 0) + Math.max(0, gain);
  let leveled = false;
  while (u.xp >= xpNeeded(u.level)) {
    u.xp -= xpNeeded(u.level);
    u.level++;
    leveled = true;
  }
  if (u.xp < 0) u.xp = 0;
  setUser(guildId, userId, u);
  return { u, leveled };
}

function resetUser(guildId, userId) {
  setUser(guildId, userId, defaultUser());
}

// Returns { leveled: bool, level, prevLevel } or null if on cooldown / disabled
function addXP(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const { xpPerMessage, cooldownMs } = getXpSettings(guildId);
  if (xpCooldowns.has(key) && now - xpCooldowns.get(key) < cooldownMs) return null;
  xpCooldowns.set(key, now);

  const u = getUser(guildId, userId);
  const prevLevel = u.level;
  u.xp += xpPerMessage;
  u.totalXp = (u.totalXp || 0) + xpPerMessage;
  let leveled = false;
  while (u.xp >= xpNeeded(u.level)) {
    u.xp -= xpNeeded(u.level);
    u.level++;
    leveled = true;
  }
  setUser(guildId, userId, u);
  return { leveled, level: u.level, prevLevel, xp: u.xp, xpNeeded: xpNeeded(u.level) };
}

function xpBar(xp, needed, size = 12) {
  const pct = Math.min(xp / needed, 1);
  const filled = Math.round(pct * size);
  return `${"█".repeat(filled)}${"░".repeat(size - filled)} ${Math.round(pct * 100)}%`;
}

// ---- Leaderboard ----
function getLeaderboard(guildId, limit = 10) {
  const d = _read();
  const guildData = d[guildId] ?? {};
  return Object.entries(guildData)
    .map(([userId, u]) => ({ userId, level: u.level, xp: u.xp, totalXp: u.totalXp || 0 }))
    .sort((a, b) => (b.level - a.level) || (b.xp - a.xp))
    .slice(0, limit);
}

function getRank(guildId, userId) {
  const d = _read();
  const guildData = d[guildId] ?? {};
  const sorted = Object.entries(guildData)
    .map(([id, u]) => ({ userId: id, level: u.level, xp: u.xp }))
    .sort((a, b) => (b.level - a.level) || (b.xp - a.xp));
  const idx = sorted.findIndex((u) => u.userId === userId);
  return { rank: idx === -1 ? sorted.length + 1 : idx + 1, total: sorted.length };
}

module.exports = {
  getUser, setUser, addXP, xpNeeded, xpBar, resetUser,
  getXpSettings, setXpRate, setXpCooldown,
  getLevelRoles, addLevelRole, removeLevelRole, rolesEarnedAt,
  adminSetLevel, adminAddXp,
  getLeaderboard, getRank,
};
