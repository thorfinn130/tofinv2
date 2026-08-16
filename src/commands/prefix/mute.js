const { PermissionFlagsBits } = require("discord.js");
const { parseDuration, formatDuration } = require("../../util/time");
const { tempMute } = require("../../services/moderation");
const { danger, warn } = require("../../util/embed");

module.exports = {
  name: "mute",
  aliases: ["tmute"],
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Timeout Members)")] });
    }
    const member = message.mentions.members.first();
    if (!member) {
      return message.reply({ embeds: [warn("Missing User", "You need to mention a user.\n**Usage:** `,mute @user <duration> [reason]`\n**Example:** `,mute @John 10m spamming`")] });
    }
    const ms = parseDuration(args[1]);
    if (!ms) {
      return message.reply({ embeds: [warn("Missing Duration", "You need to provide how long to mute them.\n**Usage:** `,mute @user <duration> [reason]`\n**Examples:** `10m` · `1h` · `2d`")] });
    }
    const reason = args.slice(2).join(" ") || "No reason";

    try {
      await tempMute(member, ms, reason);

      try {
        await member.user.send({ embeds: [warn("You have been muted", `**Server:** ${message.guild.name}\n**Duration:** **${formatDuration(ms)}**\n**Reason:** ${reason}`)] });
      } catch {}

      return message.reply("👌");
    } catch (e) {
      if (e.code === 50013) {
        return message.reply({ embeds: [danger("Bot Missing Permission", "Permission: (Timeout Members)\n\nGo to your Discord server → **Roles** → give the bot's role **Timeout Members** permission, or make sure the bot's role is above the target user.")] });
      }
      throw e;
    }
  },
};
