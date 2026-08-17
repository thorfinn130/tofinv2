const { PermissionFlagsBits } = require("discord.js");
const { parseDuration, formatDuration } = require("../../util/time");
const { tempBan } = require("../../services/moderation");
const { danger, warn } = require("../../util/embed");
const { resolveMember, formatAmbiguous } = require("../../util/resolve");

module.exports = {
  name: "ban",
  aliases: ["tban"],
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Ban Members)")] });
    }

    if (!args.length) {
      return message.reply({ embeds: [warn("Missing User", "**Usage:** `,ban <user(s)> [duration] [reason]`\n**Examples:**\n`,ban @John 1d breaking rules`\n`,ban 123456789012345678 2h spam`\n`,ban @John 123456789012345678 1d`")] });
    }

    // ── Parse users (mentions or IDs) ──
    const userIds = [];
    let i = 0;
    while (i < args.length) {
      const arg = args[i];
      // Check if it's a mention
      const mentionMatch = arg.match(/^<@!?(\d+)>$/);
      if (mentionMatch) {
        userIds.push(mentionMatch[1]);
        i++;
        continue;
      }
      // Check if it's a numeric ID (17-19 digits) – this covers user IDs, application IDs, bot IDs
      if (/^\d{17,19}$/.test(arg)) {
        userIds.push(arg);
        i++;
        continue;
      }
      // If it's not a user, stop and treat the rest as duration + reason
      break;
    }

    // No mention/ID found — fall back to fuzzy name matching on the first
    // token (covers the common single-target case: ,ban syth spamming).
    if (!userIds.length) {
      const nameResult = resolveMember(message.guild, args[0]);
      if (nameResult.status === "ambiguous") {
        return message.reply({ content: formatAmbiguous(nameResult, "member"), allowedMentions: { users: [], repliedUser: false } });
      }
      if (nameResult.status === "found") {
        userIds.push(nameResult.match.id);
        i = 1;
      }
    }

    if (!userIds.length) {
      return message.reply({ embeds: [warn("Invalid User", "Couldn't find that user by mention, ID, username, or nickname.")] });
    }

    // ── Parse duration and reason from remaining args ──
    const remaining = args.slice(i);
    let durationMs = null;
    let reason = "No reason";

    if (remaining.length && parseDuration(remaining[0])) {
      durationMs = parseDuration(remaining[0]);
      reason = remaining.slice(1).join(" ") || "No reason";
    } else {
      reason = remaining.join(" ") || "No reason";
    }

    const durationText = durationMs ? formatDuration(durationMs) : "**Permanent**";

    // ── Ban each user ──
    const results = [];
    for (const userId of userIds) {
      try {
        // Try to fetch the user to get their tag (optional – for display)
        let userTag = userId;
        try {
          const user = await message.client.users.fetch(userId);
          userTag = user.tag;
        } catch {}

        await tempBan(message.guild, userId, durationMs, reason);
        results.push({ userId, userTag, success: true });

        // Try to DM the user if possible
        try {
          const user = await message.client.users.fetch(userId);
          await user.send({
            embeds: [danger("You have been banned", `**Server:** ${message.guild.name}\n**Duration:** ${durationText}\n**Reason:** ${reason}`)]
          });
        } catch {}
      } catch (err) {
        results.push({ userId, userTag: userId, success: false, error: err.message });
      }
    }

    // ── Build response ──
    const failed = results.filter(r => !r.success);

    if (!failed.length) {
      return message.reply("👌");
    }

    // Some failed — keep it short, just flag who didn't go through
    const details = failed.map(r => `❌ **${r.userTag}** — ${r.error}`).join("\n");
    return message.reply({
      embeds: [warn("Some Failed", `👌 Banned ${results.length - failed.length}/${results.length}\n${details.length > 1000 ? details.slice(0, 997) + "…" : details}`)],
    });
  },
};