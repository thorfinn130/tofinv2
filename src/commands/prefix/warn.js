const { PermissionFlagsBits } = require("discord.js");
const { addWarning, getWarnings } = require("../../services/moderation");
const { danger, warn } = require("../../util/embed");

module.exports = {
  name: "warn",
  aliases: ["twarn"],
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Moderate Members)")] });
    }
    const user = message.mentions.users.first();
    if (!user) {
      return message.reply({ embeds: [warn("Missing User", "You need to mention a user.\n**Usage:** `,warn @user <reason>`\n**Example:** `,warn @John spamming in chat`")] });
    }
    const reason = args.slice(1).join(" ");
    if (!reason) {
      return message.reply({ embeds: [warn("Missing Reason", "You need to provide a reason for the warning.\n**Usage:** `,warn @user <reason>`\n**Example:** `,warn @John spamming in chat`")] });
    }

    const list = addWarning(message.guild.id, user.id, reason, message.author.id);

    try {
      await user.send({ embeds: [warn("You have been warned", `**Server:** ${message.guild.name}\n**Reason:** ${reason}\n**Total warnings:** ${list.length}`)] });
    } catch {}

    return message.reply("👌");
  },
};
