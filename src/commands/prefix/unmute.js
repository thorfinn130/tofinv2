const { PermissionFlagsBits } = require("discord.js");
const { removeMute } = require("../../services/moderation");
const { success, danger, warn } = require("../../util/embed");

module.exports = {
  name: "unmute",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Moderate Members)")] });
    }
    const member = message.mentions.members.first();
    if (!member) {
      return message.reply({ embeds: [warn("Missing User", "You need to mention a user.\n**Usage:** `,unmute @user [reason]`")] });
    }

    if (!member.isCommunicationDisabled()) {
      return message.reply({ embeds: [warn("Not Muted", `${member} is not currently muted.`)] });
    }

    const reason = args.slice(1).join(" ") || "No reason";

    try {
      await removeMute(member, reason);

      try {
        await member.user.send({ embeds: [success("You have been unmuted", `**Server:** ${message.guild.name}\n**Reason:** ${reason}`)] });
      } catch {}

      return message.reply("👌");
    } catch (e) {
      if (e.code === 50013) {
        return message.reply({ embeds: [danger("Bot Missing Permission", "I don't have permission to unmute that member.")] });
      }
      throw e;
    }
  },
};
