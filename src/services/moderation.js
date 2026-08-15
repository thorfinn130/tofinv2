const { getGuild, setGuild } = require("../storage");

const WARN_STORE = "warnings";

function addWarning(guildId, userId, reason, by) {
  const data = getGuild(WARN_STORE, guildId, {});
  data[userId] = data[userId] ?? [];
  data[userId].push({ reason, by, at: Date.now() });
  setGuild(WARN_STORE, guildId, data);
  return data[userId];
}

function removeWarning(guildId, userId, index) {
  const data = getGuild(WARN_STORE, guildId, {});
  const list = data[userId] ?? [];
  if (index < 1 || index > list.length) return null;
  const removed = list.splice(index - 1, 1)[0];
  data[userId] = list;
  setGuild(WARN_STORE, guildId, data);
  return { removed, list };
}

function getWarnings(guildId, userId) {
  const data = getGuild(WARN_STORE, guildId, {});
  return data[userId] ?? [];
}

async function tempMute(member, ms, reason) {
  await member.timeout(ms, reason);
}

async function removeMute(member, reason) {
  await member.timeout(null, reason);
}

async function tempBan(guild, userId, ms, reason) {
  await guild.bans.create(userId, { reason });
  if (ms) {
    setTimeout(() => {
      guild.bans.remove(userId, "Tempban expired").catch(() => {});
    }, ms);
  }
}

async function removeBan(guild, userId, reason) {
  await guild.bans.remove(userId, reason);
}

module.exports = { addWarning, removeWarning, getWarnings, tempMute, removeMute, tempBan, removeBan };
