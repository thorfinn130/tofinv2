const { read, write } = require("../storage");

const STORE_NAME = "join_to_create"; // data/join_to_create.json

function load() {
  // shape: { triggers: { [guildId]: [{ channelId, limit }, ...] }, temps: { [channelId]: { ownerId, guildId } } }
  return read(STORE_NAME, { triggers: {}, temps: {} });
}

function save(data) {
  write(STORE_NAME, data);
}

function addTrigger(guildId, channelId, limit = null) {
  const data = load();
  if (!data.triggers[guildId]) data.triggers[guildId] = [];

  const existing = data.triggers[guildId].find((t) => t.channelId === channelId);
  if (existing) {
    existing.limit = limit;
  } else {
    data.triggers[guildId].push({ channelId, limit });
  }
  save(data);
}

function removeTrigger(guildId, channelId) {
  const data = load();
  if (!data.triggers[guildId]) return false;
  const before = data.triggers[guildId].length;
  data.triggers[guildId] = data.triggers[guildId].filter((t) => t.channelId !== channelId);
  save(data);
  return before !== data.triggers[guildId].length;
}

function isTrigger(guildId, channelId) {
  const data = load();
  return (data.triggers[guildId] || []).some((t) => t.channelId === channelId);
}

function getTriggerLimit(guildId, channelId) {
  const data = load();
  const trigger = (data.triggers[guildId] || []).find((t) => t.channelId === channelId);
  return trigger?.limit ?? null;
}

function listTriggers(guildId) {
  const data = load();
  return (data.triggers[guildId] || []).map((t) => t.channelId);
}

function registerTemp(channelId, guildId, ownerId) {
  const data = load();
  data.temps[channelId] = { ownerId, guildId };
  save(data);
}

function getTempOwner(channelId) {
  const data = load();
  return data.temps[channelId]?.ownerId || null;
}

function isTempChannel(channelId) {
  const data = load();
  return !!data.temps[channelId];
}

function removeTemp(channelId) {
  const data = load();
  delete data.temps[channelId];
  save(data);
}

module.exports = {
  addTrigger,
  removeTrigger,
  isTrigger,
  getTriggerLimit,
  listTriggers,
  registerTemp,
  getTempOwner,
  isTempChannel,
  removeTemp,
};
