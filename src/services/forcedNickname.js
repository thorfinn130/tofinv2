const { getGuild, setGuild } = require("../storage");

const STORE = "forced_nicknames";

function getAll(guildId) {
  return getGuild(STORE, guildId, {});
}

function getForced(guildId, userId) {
  return getAll(guildId)[userId] || null;
}

function setForced(guildId, userId, nickname, setById) {
  const all = getAll(guildId);
  all[userId] = { nickname, setBy: setById, setAt: Date.now() };
  setGuild(STORE, guildId, all);
}

function removeForced(guildId, userId) {
  const all = getAll(guildId);
  delete all[userId];
  setGuild(STORE, guildId, all);
}

module.exports = { getAll, getForced, setForced, removeForced };
