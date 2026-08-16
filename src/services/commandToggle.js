const { read, write } = require("../storage");

const STORE = "command_toggles";

// Commands that can never be disabled — guild admins should never be able
// to lock themselves out of managing the bot or getting help.
const PROTECTED = new Set(["disable", "enable", "help", "setprefix"]);

function defaultConfig() {
  return {
    global: [],     // command names disabled everywhere in this guild
    channels: {},   // { channelId: [commandNames] } — disabled just in that channel
  };
}

function _read() { return read(STORE, {}); }
function _write(d) { write(STORE, d); }

function getConfig(guildId) {
  const d = _read();
  const cfg = d[guildId] ?? defaultConfig();
  cfg.global = cfg.global ?? [];
  cfg.channels = cfg.channels ?? {};
  return cfg;
}

function _save(guildId, cfg) {
  const d = _read();
  d[guildId] = cfg;
  _write(d);
}

function isProtected(commandName) {
  return PROTECTED.has(commandName);
}

function isDisabled(guildId, channelId, commandName) {
  const cfg = getConfig(guildId);
  if (cfg.global.includes(commandName)) return true;
  if (channelId && cfg.channels[channelId]?.includes(commandName)) return true;
  return false;
}

// channelId omitted/null => disable everywhere in the guild
function disableCommand(guildId, commandName, channelId = null) {
  if (isProtected(commandName)) return null;
  const cfg = getConfig(guildId);
  if (channelId) {
    if (!cfg.channels[channelId]) cfg.channels[channelId] = [];
    if (!cfg.channels[channelId].includes(commandName)) cfg.channels[channelId].push(commandName);
  } else if (!cfg.global.includes(commandName)) {
    cfg.global.push(commandName);
  }
  _save(guildId, cfg);
  return cfg;
}

function enableCommand(guildId, commandName, channelId = null) {
  const cfg = getConfig(guildId);
  if (channelId) {
    if (cfg.channels[channelId]) {
      cfg.channels[channelId] = cfg.channels[channelId].filter((c) => c !== commandName);
      if (!cfg.channels[channelId].length) delete cfg.channels[channelId];
    }
  } else {
    cfg.global = cfg.global.filter((c) => c !== commandName);
  }
  _save(guildId, cfg);
  return cfg;
}

// Used by the interactive toggle menu: make the disabled set for one category,
// in one scope (global or a channel), match `disabledNames` exactly.
function setCategoryState(guildId, categoryCommandNames, disabledNames, channelId = null) {
  const cfg = getConfig(guildId);
  const disabledSet = new Set(disabledNames.filter((n) => !isProtected(n)));

  if (channelId) {
    const current = new Set(cfg.channels[channelId] || []);
    for (const name of categoryCommandNames) {
      if (disabledSet.has(name)) current.add(name);
      else current.delete(name);
    }
    if (current.size) cfg.channels[channelId] = [...current];
    else delete cfg.channels[channelId];
  } else {
    const current = new Set(cfg.global);
    for (const name of categoryCommandNames) {
      if (disabledSet.has(name)) current.add(name);
      else current.delete(name);
    }
    cfg.global = [...current];
  }
  _save(guildId, cfg);
  return cfg;
}

function disableAllInChannel(guildId, channelId, allCommandNames) {
  const cfg = getConfig(guildId);
  cfg.channels[channelId] = allCommandNames.filter((n) => !isProtected(n));
  _save(guildId, cfg);
  return cfg;
}

function enableAllInChannel(guildId, channelId) {
  const cfg = getConfig(guildId);
  delete cfg.channels[channelId];
  _save(guildId, cfg);
  return cfg;
}

module.exports = {
  PROTECTED, isProtected, getConfig, isDisabled,
  disableCommand, enableCommand, setCategoryState,
  disableAllInChannel, enableAllInChannel,
};
