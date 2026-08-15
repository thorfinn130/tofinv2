const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getUser, getLeaderboard } = require("../../services/messageTracker");
const { bar } = require("../../util/embed");

module.exports = {
  name: "messages",
  aliases: ["msgs", "msgcount"],
  async run(message, args) {
    const sub = args[0]?.toLowerCase();

    // ,messages top [daily|weekly|monthly|total]
    if (sub === "top" || sub === "leaderboard" || sub === "lb") {
      const period = ["daily","weekly","monthly","total"].includes(args[1]?.toLowerCase()) ? args[1].toLowerCase() : "total";
      const lb = getLeaderboard(message.guild.id, period, 10);

      if (!lb.length) {
        return message.reply({ content: "No message data yet for this server." });
      }

      const periodLabel = { daily: "Today", weekly: "This Week", monthly: "This Month", total: "All Time" }[period];
      const maxCount = lb[0]?.count || 1;

      const desc = lb.map((entry, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
        const pctBar = bar(entry.count, maxCount, 10);
        return `${medal} <@${entry.userId}>\n\`${pctBar}\` **${entry.count.toLocaleString()}** msgs`;
      }).join("\n\n");

      const periodRow = new ActionRowBuilder().addComponents(
        ["daily","weekly","monthly","total"].map((p) =>
          new ButtonBuilder()
            .setCustomId(`msgs_lb:${message.author.id}:${p}`)
            .setLabel(p.charAt(0).toUpperCase() + p.slice(1))
            .setStyle(period === p ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(true)
        )
      );

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`💬  Message Leaderboard — ${periodLabel}`)
            .setDescription(desc || "*No data*")
            .setColor(0x5865f2)
            .setFooter({ text: `${message.guild.name} · Use ,messages top daily/weekly/monthly/total` })
            .setTimestamp(),
        ],
        components: [periodRow],
      });
    }

    // ,messages [@user]
    const user   = message.mentions.users.first() ?? message.author;
    const member = message.guild.members.cache.get(user.id);
    const data   = getUser(message.guild.id, user.id);

    const maxVal = Math.max(data.daily.count, data.weekly.count, data.monthly.count, data.total, 1);

    const makeBar = (v) => `\`${bar(v, maxVal, 14)}\` **${v.toLocaleString()}**`;

    const embed = new EmbedBuilder()
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ size: 64 }) })
      .setTitle("💬  Message Statistics")
      .setColor(member?.displayColor || 0x5865f2)
      .addFields(
        { name: "📅  Today",      value: makeBar(data.daily.count),   inline: false },
        { name: "📆  This Week",  value: makeBar(data.weekly.count),  inline: false },
        { name: "🗓️  This Month", value: makeBar(data.monthly.count), inline: false },
        { name: "♾️  All Time",   value: makeBar(data.total),         inline: false },
      )
      .setFooter({ text: `Tracked since bot joined · ${message.guild.name}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("View Leaderboard")
        .setCustomId(`msgs_view_lb:${message.author.id}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🏆")
        .setDisabled(true),
    );

    return message.reply({ embeds: [embed], components: [row] });
  },
};
