const { EmbedBuilder } = require("discord.js");
const { parseDuration, formatDuration } = require("../../util/time");
const { danger, warn, success, rich } = require("../../util/embed");
const { colors } = require("../../config");
const { PermissionFlagsBits } = require("discord.js");

module.exports = {
  name: "giveaway",
  aliases: ["gw"],
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Manage Messages)")] });
    }
    const ms = parseDuration(args[0]);
    if (!ms) {
      return message.reply({ embeds: [warn("Missing Duration", "Provide a duration and prize.\n**Usage:** `,giveaway <duration> <prize>`\n**Example:** `,giveaway 1h Nitro Classic`")] });
    }
    const prize = args.slice(1).join(" ");
    if (!prize) {
      return message.reply({ embeds: [warn("Missing Prize", "Provide a prize.\n**Usage:** `,giveaway <duration> <prize>`")] });
    }

    const endsAt = Date.now() + ms;
    const embed = new EmbedBuilder()
      .setTitle("🎉  Giveaway!")
      .setDescription(`**Prize:** ${prize}\n\nReact with 🎉 to enter!\n\n**Ends:** <t:${Math.floor(endsAt / 1000)}:R>`)
      .setColor(colors.primary)
      .setFooter({ text: `Hosted by ${message.author.tag} • Ends at` })
      .setTimestamp(endsAt);

    await message.delete().catch(() => {});
    const gwMsg = await message.channel.send({ embeds: [embed] });
    await gwMsg.react("🎉");

    setTimeout(async () => {
      await gwMsg.fetch().catch(() => null);
      const reaction = gwMsg.reactions.cache.get("🎉");
      if (!reaction) return;
      const users = await reaction.users.fetch();
      const entries = users.filter((u) => !u.bot);
      if (!entries.size) {
        return message.channel.send({ embeds: [warn("Giveaway Ended", `No valid entries for **${prize}**. No winner selected.`)] });
      }
      const winner = entries.random();
      const endEmbed = new EmbedBuilder()
        .setTitle("🏆  Giveaway Ended!")
        .setDescription(`**Prize:** ${prize}\n**Winner:** ${winner}\n\nCongratulations! 🎉`)
        .setColor(colors.success)
        .setFooter({ text: `Hosted by ${message.author.tag}` })
        .setTimestamp();
      await gwMsg.edit({ embeds: [endEmbed] });
      await message.channel.send({ content: `🎉 Congratulations ${winner}! You won **${prize}**!` });
    }, ms);
  },
};
