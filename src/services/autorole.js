const { getGuild, setGuild } = require("../storage");

const STORE = "autorole"; // per-guild: { roleIds: [id, ...] }

function getRoles(guildId) {
  const data = getGuild(STORE, guildId, { roleIds: [] });
  return data.roleIds;
}

function addRole(guildId, roleId) {
  const data = getGuild(STORE, guildId, { roleIds: [] });
  if (!data.roleIds.includes(roleId)) {
    data.roleIds.push(roleId);
    setGuild(STORE, guildId, data);
    return true;
  }
  return false;
}

function removeRole(guildId, roleId) {
  const data = getGuild(STORE, guildId, { roleIds: [] });
  const before = data.roleIds.length;
  data.roleIds = data.roleIds.filter((id) => id !== roleId);
  setGuild(STORE, guildId, data);
  return before !== data.roleIds.length;
}

module.exports = { getRoles, addRole, removeRole };