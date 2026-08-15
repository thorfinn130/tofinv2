const { PermissionFlagsBits } = require("discord.js");
const { getConfig, getActiveJail, clearActiveJail } = require("../../services/jail");
const { success, danger, warn } = require("../../util/embed");

module.exports = {
  name: "unjail",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Administrator)")] });
    }

    const target = message.mentions.members.first();
    if (!target) {
      return message.reply({ embeds: [warn("Missing User", "**Usage:** `,unjail @user`")] });
    }

    const jailInfo = getActiveJail(message.guild.id, target.id);
    if (!jailInfo) {
      return message.reply({ embeds: [warn("Not Jailed", `**${target.user.tag}** isn't currently jailed.`)] });
    }

    const cfg = getConfig(message.guild.id);

    // Restore their previous roles where possible (roles may have been deleted since)
    const rolesToRestore = (jailInfo.roleSnapshot || []).filter((id) => message.guild.roles.cache.has(id));
    await target.roles.set(rolesToRestore).catch(() => {});

    clearActiveJail(message.guild.id, target.id);

    return message.reply({ embeds: [success("Unjailed", `**${target.user.tag}** has been released and had their previous roles restored.`)] });
  },
};
