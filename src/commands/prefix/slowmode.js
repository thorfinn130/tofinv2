const { PermissionFlagsBits } = require("discord.js");
const { danger, warn } = require("../../util/embed");

module.exports = {
  name: "slowmode",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Manage Channels)")] });
    }
    const seconds = parseInt(args[0]);
    if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
      return message.reply({ embeds: [warn("Invalid Value", "Provide a number of seconds between **0** and **21600** (6 hours).\n**Usage:** `,slowmode <seconds>`\n> Use `0` to disable slowmode.")] });
    }
    await message.channel.setRateLimitPerUser(seconds, `Set by ${message.author.tag}`);
    return message.reply("👌");
  },
};
