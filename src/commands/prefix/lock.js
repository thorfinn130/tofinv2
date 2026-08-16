const { PermissionFlagsBits } = require("discord.js");
const { danger } = require("../../util/embed");

module.exports = {
  name: "lock",
  aliases: ["unlock"],

  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply({
        embeds: [
          danger(
            "Missing Permission",
            "You need the **Manage Channels** permission to use this command."
          ),
        ],
      });
    }

    const invoked = message.content
      .trim()
      .slice(1)
      .split(/\s+/)[0]
      .toLowerCase();

    const locking = invoked === "lock";

    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      {
        SendMessages: locking ? false : null,
        SendMessagesInThreads: locking ? false : null,
        CreatePublicThreads: locking ? false : null,
        CreatePrivateThreads: locking ? false : null,
      },
      {
        reason: `${locking ? "Locked" : "Unlocked"} by ${message.author.tag}`,
      }
    );

    return message.reply("👌");
  },
};