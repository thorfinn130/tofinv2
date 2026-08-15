const { read, write } = require("../storage");

const STORE = "afk";

function _read()   { return read(STORE, {}); }
function _write(d) { write(STORE, d); }

/**
 * Set a user as AFK in a guild.
 * @param {string} guildId
 * @param {string} userId
 * @param {string} reason  Max 25 chars
 */
function setAfk(guildId, userId, reason) {
  const d = _read();
  if (!d[guildId]) d[guildId] = {};
  d[guildId][userId] = { reason: reason.slice(0, 25), since: Date.now() };
  _write(d);
}

/**
 * Remove a user's AFK status in a guild.
 */
function clearAfk(guildId, userId) {
  const d = _read();
  if (d[guildId]) {
    delete d[guildId][userId];
    _write(d);
  }
}

/**
 * Get AFK entry for a user in a guild. Returns null if not AFK.
 */
function getAfk(guildId, userId) {
  return _read()[guildId]?.[userId] ?? null;
}

/**
 * Check if a user is AFK in a guild.
 */
function isAfk(guildId, userId) {
  return !!getAfk(guildId, userId);
}

module.exports = { setAfk, clearAfk, getAfk, isAfk };
