const { ChannelType, PermissionsBitField } = require("discord.js");
const { read, write } = require("../storage");

const STORE = "backups"; // { [guildId]: [ { id, name, createdAt, data } ] }

function listBackups(guildId) {
  const all = read(STORE, {});
  return all[guildId] ?? [];
}

function getBackup(guildId, id) {
  return listBackups(guildId).find((b) => b.id === id);
}

async function createBackup(guild, label) {
  const roles = guild.roles.cache
    .filter((r) => r.name !== "@everyone" && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      name: r.name,
      color: r.color,
      hoist: r.hoist,
      mentionable: r.mentionable,
      permissions: r.permissions.bitfield.toString(),
      position: r.position,
    }));

  const channels = guild.channels.cache
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parentId: c.parentId,
      topic: c.topic ?? null,
      nsfw: c.nsfw ?? false,
      position: c.rawPosition,
    }));

  const backup = {
    id: Date.now().toString(36),
    name: label || `Backup ${new Date().toLocaleString()}`,
    createdAt: Date.now(),
    data: { name: guild.name, roles, channels },
  };

  const all = read(STORE, {});
  all[guild.id] = [...(all[guild.id] ?? []), backup];
  write(STORE, all);
  return backup;
}

async function restoreBackup(guild, id) {
  const backup = getBackup(guild.id, id);
  if (!backup) throw new Error("Backup not found");

  // Wipe existing channels & non-managed roles
  for (const ch of guild.channels.cache.values()) {
    await ch.delete("Backup restore").catch(() => {});
  }
  for (const r of guild.roles.cache.values()) {
    if (r.name === "@everyone" || r.managed) continue;
    await r.delete("Backup restore").catch(() => {});
  }

  // Recreate roles (lowest first so positions stack)
  const sortedRoles = [...backup.data.roles].sort((a, b) => a.position - b.position);
  for (const r of sortedRoles) {
    await guild.roles
      .create({
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        mentionable: r.mentionable,
        permissions: new PermissionsBitField(BigInt(r.permissions)),
        reason: "Backup restore",
      })
      .catch(() => {});
  }

  // Recreate categories first
  const idMap = new Map();
  const cats = backup.data.channels.filter((c) => c.type === ChannelType.GuildCategory);
  const rest = backup.data.channels.filter((c) => c.type !== ChannelType.GuildCategory);

  for (const c of cats) {
    const created = await guild.channels
      .create({ name: c.name, type: ChannelType.GuildCategory, reason: "Backup restore" })
      .catch(() => null);
    if (created) idMap.set(c.id, created.id);
  }
  for (const c of rest) {
    await guild.channels
      .create({
        name: c.name,
        type: c.type,
        parent: c.parentId ? idMap.get(c.parentId) ?? undefined : undefined,
        topic: c.topic ?? undefined,
        nsfw: c.nsfw ?? false,
        reason: "Backup restore",
      })
      .catch(() => {});
  }

  return backup;
}

module.exports = { createBackup, restoreBackup, listBackups, getBackup };
