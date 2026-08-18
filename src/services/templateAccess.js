const { getGuild, setGuild } = require("../storage");

const STORE = "template_access";

function getGranted(guildId) {
  return getGuild(STORE, guildId, []);
}

function grant(guildId, userId) {
  const list = getGranted(guildId);
  if (!list.includes(userId)) {
    list.push(userId);
    setGuild(STORE, guildId, list);
  }
  return list;
}

function revoke(guildId, userId) {
  const list = getGranted(guildId).filter((id) => id !== userId);
  setGuild(STORE, guildId, list);
  return list;
}

// True for the actual server owner, or anyone the owner has granted access to.
function hasAccess(guild, userId) {
  if (userId === guild.ownerId) return true;
  return getGranted(guild.id).includes(userId);
}

module.exports = { getGranted, grant, revoke, hasAccess };
