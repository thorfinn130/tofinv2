const { PermissionFlagsBits } = require("discord.js");
const { removeWarning, getWarnings } = require("../../services/moderation");
const { danger, warn, info } = require("../../util/embed");

module.exports = {
  name: "unwarn",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Moderate Members)")] });
    }
    const user = message.mentions.users.first();
    if (!user) {
      return message.reply({ embeds: [warn("Missing User", "You need to mention a user.\n**Usage:** `,unwarn @user <warning#>`\n> Use `,warnings @user` to see warning numbers.")] });
    }
    const index = parseInt(args[1]);
    if (isNaN(index) || index < 1) {
      return message.reply({ embeds: [warn("Missing Warning #", "Provide the warning number to remove.\n**Usage:** `,unwarn @user <warning#>`\n> Use `,warnings @user` to see warning numbers.")] });
    }

    const list = getWarnings(message.guild.id, user.id);
    if (!list.length) {
      return message.reply({ embeds: [info("No Warnings", `${user} has no warnings.`)] });
    }
    if (index > list.length) {
      return message.reply({ embeds: [warn("Invalid #", `${user} only has **${list.length}** warning${list.length !== 1 ? "s" : ""}. Use a number between 1 and ${list.length}.`)] });
    }

    const result = removeWarning(message.guild.id, user.id, index);
    if (!result) {
      return message.reply({ embeds: [danger("Error", "Could not remove that warning.")] });
    }

    return message.reply("👌");
  },
};
