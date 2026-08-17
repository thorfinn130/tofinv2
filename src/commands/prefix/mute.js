const { PermissionFlagsBits } = require("discord.js");
const { parseDuration, formatDuration } = require("../../util/time");
const { tempMute } = require("../../services/moderation");
const { danger, warn } = require("../../util/embed");
const { resolveMember, formatAmbiguous } = require("../../util/resolve");

module.exports = {
  name: "mute",
  aliases: ["tmute"],
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Timeout Members)")] });
    }
    let member = message.mentions.members.first();
    if (!member && args[0]) {
      const nameResult = resolveMember(message.guild, args[0]);
      if (nameResult.status === "ambiguous") {
        return message.reply({ content: formatAmbiguous(nameResult, "member"), allowedMentions: { users: [], repliedUser: false } });
      }
      if (nameResult.status === "found") member = nameResult.match;
    }
    if (!member) {
      return message.reply({ embeds: [warn("Missing User", "**Usage:** `,mute <user> <duration> [reason]`\n**Example:** `,mute @John 10m spamming`\nWorks with a mention, username, nickname, or a close typo of either.")] });
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
