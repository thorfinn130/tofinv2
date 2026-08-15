const { PermissionFlagsBits, ChannelType } = require("discord.js");
const { setConfig, getConfig } = require("../../services/jail");
const { success, danger, info, rich } = require("../../util/embed");
const { colors } = require("../../config");

module.exports = {
  name: "setup",
  async run(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Administrator)")] });
    }

    const me = message.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles) || !me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply({ embeds: [danger("Bot Missing Permission", "Permissions needed: (Manage Roles) and (Manage Channels)")] });
    }

    const existing = getConfig(message.guild.id);

    // Don't just trust the saved config — check whether the actual roles/channels still exist.
    // If something was deleted manually, we should recreate just what's missing, not refuse to run.
    const stillIntact = existing && {
      muteRole:    existing.muteRoleId    ? message.guild.roles.cache.has(existing.muteRoleId)       : false,
      jailedRole:  existing.jailRoleId    ? message.guild.roles.cache.has(existing.jailRoleId)       : false,
      category:    existing.categoryId    ? message.guild.channels.cache.has(existing.categoryId)    : false,
      logsChannel: existing.logsChannelId ? message.guild.channels.cache.has(existing.logsChannelId) : false,
      jailChannel: existing.jailChannelId ? message.guild.channels.cache.has(existing.jailChannelId) : false,
    };

    const everythingIntact = existing && Object.values(stillIntact).every(Boolean);

    if (everythingIntact) {
      return message.reply({
        embeds: [info(
          "Already Set Up",
          "This server's moderation setup is already in place and everything still exists.\nUse `,jail role @role` or `,jail channel #channel` to change individual settings, or check `,jail config` to see the current setup.\n\n_If you deleted something manually, run `,setup` again — it'll detect what's missing and recreate just that._"
        )],
      });
    }

    const isRepair = !!existing && !everythingIntact;

    const status = await message.reply({
      embeds: [info(
        isRepair ? "Repairing Setup..." : "Setting Up...",
        isRepair
          ? "Some configured roles/channels were missing (likely deleted manually). Recreating only what's missing."
          : "Creating roles and channels, this'll just take a moment.",
      )],
    });

    // ── 1. Mute role ──────────────────────────────────────────────────────────
    let muteRole = stillIntact?.muteRole ? message.guild.roles.cache.get(existing.muteRoleId) : null;
    if (!muteRole) muteRole = message.guild.roles.cache.find((r) => r.name === "Muted");
    if (!muteRole) {
      muteRole = await message.guild.roles.create({ name: "Muted", color: 0x808080, permissions: [] });
    }

    // ── 2. Jailed role ────────────────────────────────────────────────────────
    let jailedRole = stillIntact?.jailedRole ? message.guild.roles.cache.get(existing.jailRoleId) : null;
    if (!jailedRole) jailedRole = message.guild.roles.cache.find((r) => r.name === "jailed");
    if (!jailedRole) {
      jailedRole = await message.guild.roles.create({ name: "jailed", color: 0x36393f, permissions: [] });
    }

    // ── 3. Moderation category ───────────────────────────────────────────────
    let category = stillIntact?.category ? message.guild.channels.cache.get(existing.categoryId) : null;
    if (!category) category = message.guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === "greed-mod");
    if (!category) {
      category = await message.guild.channels.create({
        name: "tofin-mod",
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: message.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
          { id: jailedRole.id, deny: [PermissionFlagsBits.ViewChannel] },
        ],
      });
    }

    // ── 4. Logs channel ───────────────────────────────────────────────────────
    let logsChannel = stillIntact?.logsChannel ? message.guild.channels.cache.get(existing.logsChannelId) : null;
    if (!logsChannel) logsChannel = message.guild.channels.cache.find((c) => c.name === "logs" && c.parentId === category.id);
    if (!logsChannel) {
      logsChannel = await message.guild.channels.create({
        name: "logs",
        type: ChannelType.GuildText,
        parent: category.id,
      });
    }

    // ── 5. Jail channel ───────────────────────────────────────────────────────
    let jailChannel = stillIntact?.jailChannel ? message.guild.channels.cache.get(existing.jailChannelId) : null;
    if (!jailChannel) jailChannel = message.guild.channels.cache.find((c) => c.name === "jail" && c.parentId === category.id);
    if (!jailChannel) {
      jailChannel = await message.guild.channels.create({
        name: "jail",
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          { id: message.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
          { id: jailedRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ],
      });
    }

    // ── Lock down every other channel from the jailed role ───────────────────
    for (const [, channel] of message.guild.channels.cache) {
      if (channel.id === jailChannel.id || channel.id === category.id) continue;
      if (!channel.permissionOverwrites) continue;
      try {
        await channel.permissionOverwrites.edit(jailedRole.id, { ViewChannel: false });
      } catch {}
    }

    setConfig(message.guild.id, {
      muteRoleId: muteRole.id,
      jailRoleId: jailedRole.id,
      jailChannelId: jailChannel.id,
      logsChannelId: logsChannel.id,
      categoryId: category.id,
    });

    await status.edit({
      embeds: [success(
        isRepair ? "Setup Repaired!" : "Setup Complete!",
        `**Mute Role:** ${muteRole}\n**Jailed Role:** ${jailedRole}\n**Category:** ${category.name}\n**Logs Channel:** ${logsChannel}\n**Jail Channel:** ${jailChannel}\n\nYou can now use \`,jail @user [duration] [reason]\` to jail someone.`
      )],
    });
  },
};