const { read, write } = require("../storage");

const STORE = "aliases";

function _read()   { return read(STORE, {}); }
function _write(d) { write(STORE, d); }

/**
 * Returns all aliases for a guild.
 * @param {string} guildId
 * @returns {{ [alias: string]: string }}  alias → command string
 */
function getAliases(guildId) {
  return _read()[guildId] ?? {};
}

/**
 * Add or overwrite an alias.
 * @param {string} guildId
 * @param {string} alias    The new short name
 * @param {string} command  The command string it expands to
 */
function addAlias(guildId, alias, command) {
  const d = _read();
  if (!d[guildId]) d[guildId] = {};
  d[guildId][alias.toLowerCase()] = command;
  _write(d);
}

/**
 * Remove an alias.
 * @returns {boolean} true if removed
 */
function removeAlias(guildId, alias) {
  const d = _read();
  if (!d[guildId] || !d[guildId][alias.toLowerCase()]) return false;
  delete d[guildId][alias.toLowerCase()];
  _write(d);
  return true;
}

/**
 * Resolve an alias for a guild. Returns null if not found.
 * @param {string} guildId
 * @param {string} raw  The word typed after prefix
 * @returns {string|null}  The full command expansion
 */
function resolveAlias(guildId, raw) {
  return getAliases(guildId)[raw.toLowerCase()] ?? null;
}

module.exports = { getAliases, addAlias, removeAlias, resolveAlias };
