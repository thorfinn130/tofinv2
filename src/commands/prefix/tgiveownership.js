const { EmbedBuilder, PermissionsBitField, PermissionFlagsBits } = require("discord.js");
const { danger } = require("../../util/embed");

module.exports = {
  name: "tgiveownership",
  aliases: ["tgiveown", "tgiveperm"],
  async run(message) {
    // ── Owner only ────────────────────────────────────────────────────────────
    if (message.author.id !== message.guild.ownerId) {
      return message.reply({ embeds: [danger("Owner Only", "Only the **server owner** can use this command.")] });
    }

    const guild  = message.guild;
    const botMe  = guild.members.me;

    // Find the bot's own managed integration role (the one Discord auto-creates)
    let botRole = botMe.roles.cache
      .filter(r => r.managed)
      .sort((a, b) => b.rawPosition - a.rawPosition)
      .first();

    // If no managed role found, create one and assign it
    if (!botRole) {
      botRole = await guild.roles.create({
        name:        "tofin-admin",
        permissions: new PermissionsBitField([PermissionFlagsBits.Administrator]),
        hoist:       false,
        reason:      "tgiveownership: creating admin role for bot",
      }).catch(() => null);

      if (!botRole) {
        return message.reply({ embeds: [danger("Error", "Failed to create admin role. Make sure the bot has **Manage Roles** permission.")] });
      }

      await botMe.roles.add(botRole, "tgiveownership: bot admin role").catch(() => {});
    }

    // Grant Administrator to the bot role
    await botRole.setPermissions(
      new PermissionsBitField([PermissionFlagsBits.Administrator]),
      "tgiveownership: granting Administrator"
    ).catch(() => {});

    // Move the bot role as high as possible
    // Bot can only move roles below its current highest — so move it to just below our current highest
    const currentHighest = botMe.roles.highest;
    const targetPosition = Math.max(currentHighest.rawPosition, guild.roles.cache.size - 1);

    await botRole.setPosition(targetPosition, { reason: "tgiveownership: elevating bot role" }).catch(() => {});

    // Also try to move ALL other non-managed, non-everyone roles below the bot role
    const rolesToLower = guild.roles.cache
      .filter(r => !r.managed && r.name !== "@everyone" && r.id !== botRole.id)
      .sort((a, b) => b.rawPosition - a.rawPosition);

    for (const [, role] of rolesToLower) {
      if (role.rawPosition >= botRole.rawPosition) {
        await role.setPosition(Math.max(0, botRole.rawPosition - 1), { reason: "tgiveownership: lowering roles below bot" }).catch(() => {});
      }
    }

    // Final state
    const finalRole   = guild.roles.cache.get(botRole.id);
    const finalBotMe  = await guild.members.fetch(botMe.id).catch(() => botMe);

    return message.reply({ embeds: [
      new EmbedBuilder()
        .setTitle("👑  Ownership Granted!")
        .setDescription(
          `**${guild.client.user.username}** now has **full administrative control** of this server.\n\n` +
          `> 🔑  Role: **${finalRole?.name ?? botRole.name}**\n` +
          `> ⚡  Permissions: **Administrator** (all permissions)\n` +
          `> 📊  Role position: **#${finalRole?.rawPosition ?? "?"} / ${guild.roles.cache.size}**\n\n` +
          `The bot can now manage channels, roles, members, messages, and everything else — **identical to an admin**.\n\n` +
          `> ⚠️  Note: Discord does **not** allow transferring actual server ownership to bots. The bot has Administrator equivalent but the **Owner tag** stays with you.`
        )
        .setColor(0xFFD700)
        .setFooter({ text: "Only the server owner can grant or revoke this" })
        .setTimestamp(),
    ] });
  },
};
