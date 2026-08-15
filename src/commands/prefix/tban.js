const { PermissionFlagsBits } = require("discord.js");
const { parseDuration, formatDuration } = require("../../util/time");
const { tempBan } = require("../../services/moderation");
const { success, danger, warn } = require("../../util/embed");

module.exports = {
  name: "tban",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Ban Members)")] });
    }

    if (!args.length) {
      return message.reply({ embeds: [warn("Missing User", "**Usage:** `,tban <user(s)> [duration] [reason]`\n**Examples:**\n`,tban @John 1d breaking rules`\n`,tban 123456789012345678 2h spam`\n`,tban @John 123456789012345678 1d`")] });
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

    if (!userIds.length) {
      return message.reply({ embeds: [warn("Invalid User", "Provide at least one valid user mention or ID.")] });
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
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    const embed = success(
      "Ban Result",
      `Banned **${successCount}** user${successCount !== 1 ? "s" : ""}${failCount ? `, failed **${failCount}**` : ""}\n` +
      `Duration: ${durationText}\nReason: ${reason}`
    );

    // Add details for each (truncate if too long)
    const details = results.map(r =>
      r.success
        ? `✅ **${r.userTag}** (${r.userId})`
        : `❌ **${r.userTag}** (${r.userId}) — ${r.error}`
    ).join("\n");

    if (details.length > 1024) {
      embed.addFields({ name: "Details (truncated)", value: details.slice(0, 1021) + "…" });
    } else {
      embed.addFields({ name: "Details", value: details });
    }

    return message.reply({ embeds: [embed] });
  },
};