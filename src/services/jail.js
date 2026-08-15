const { read, write } = require("../storage");

const STORE_NAME = "jail"; // data/jail.json

function load() {
  // shape: { configs: { [guildId]: { jailRoleId, jailChannelId, logsChannelId, categoryId, muteRoleId } },
  //           active: { [guildId]: { [userId]: { jailedAt, expiresAt, reason, jailedRoleSnapshot } } } }
  return read(STORE_NAME, { configs: {}, active: {} });
}

function save(data) {
  write(STORE_NAME, data);
}

function getConfig(guildId) {
  return load().configs[guildId] || null;
}

function setConfig(guildId, patch) {
  const data = load();
  data.configs[guildId] = { ...(data.configs[guildId] || {}), ...patch };
  save(data);
  return data.configs[guildId];
}

function getActiveJails(guildId) {
  const data = load();
  return data.active[guildId] || {};
}

function getActiveJail(guildId, userId) {
  const data = load();
  return data.active[guildId]?.[userId] || null;
}

function setActiveJail(guildId, userId, info) {
  const data = load();
  if (!data.active[guildId]) data.active[guildId] = {};
  data.active[guildId][userId] = info;
  save(data);
}

function clearActiveJail(guildId, userId) {
  const data = load();
  if (data.active[guildId]) delete data.active[guildId][userId];
  save(data);
}

function getAllActiveAcrossGuilds() {
  const data = load();
  const out = [];
  for (const guildId of Object.keys(data.active)) {
    for (const userId of Object.keys(data.active[guildId])) {
      out.push({ guildId, userId, ...data.active[guildId][userId] });
    }
  }
  return out;
}

module.exports = {
  getConfig,
  setConfig,
  getActiveJails,
  getActiveJail,
  setActiveJail,
  clearActiveJail,
  getAllActiveAcrossGuilds,
};
