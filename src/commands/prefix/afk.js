const { EmbedBuilder } = require("discord.js");
const { setAfk, clearAfk, isAfk } = require("../../services/afk");
const { warn, success } = require("../../util/embed");

module.exports = {
  name: "afk",
  async run(message, args) {
    const guildId = message.guild.id;
    const userId  = message.author.id;

    if (isAfk(guildId, userId)) {
      clearAfk(guildId, userId);
      return message.reply({
        embeds: [success("Welcome Back!", "Your AFK status has been removed.")],
      });
    }

    const reason = args.join(" ").trim().slice(0, 25) || "AFK";

    setAfk(guildId, userId, reason);

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("💤  AFK Set")
          .setDescription(`You are now AFK.\n**Status:** ${reason}`)
          .setColor(0x5865f2)
          .setFooter({ text: "You'll be removed from AFK when you next send a message." })
          .setTimestamp(),
      ],
    });
  },
};
