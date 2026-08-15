const { PermissionFlagsBits } = require("discord.js");
const { removeBan } = require("../../services/moderation");
const { success, danger, warn } = require("../../util/embed");

module.exports = {
  name: "unban",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Ban Members)")] });
    }

    const userId = args[0]?.replace(/[<@!>]/g, "");
    if (!userId || !/^\d+$/.test(userId)) {
      return message.reply({ embeds: [warn("Missing User ID", "Provide the user's ID to unban.\n**Usage:** `,unban <userId> [reason]`\n**Example:** `,unban 123456789012345678 appeal approved`")] });
    }

    const reason = args.slice(1).join(" ") || "No reason";

    try {
      const ban = await message.guild.bans.fetch(userId).catch(() => null);
      if (!ban) {
        return message.reply({ embeds: [warn("Not Banned", `No ban found for user ID \`${userId}\`.`)] });
      }

      await removeBan(message.guild, userId, reason);

      return message.reply({
        embeds: [success("Done!", `**${ban.user.tag}** has been unbanned.\nReason: ${reason}`)],
      });
    } catch (e) {
      if (e.code === 50013) {
        return message.reply({ embeds: [danger("Bot Missing Permission", "I need **Ban Members** permission to unban users.")] });
      }
      throw e;
    }
  },
};
