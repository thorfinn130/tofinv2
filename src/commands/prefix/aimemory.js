const { EmbedBuilder } = require("discord.js");
const { PermissionFlagsBits } = require("discord.js");
const { getHistory } = require("../../services/aiChat");

module.exports = {
  name: "aimemory",
  aliases: ["aihist", "aihistory"],
  async run(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply({ content: "❌ You need Manage Messages to do that." });
    }

    const hist = getHistory(message.channel.id);

    if (!hist.length) {
      return message.reply({ content: "🧠 no memory for this channel yet — i haven't said anything here" });
    }

    const lines = hist.map((m, i) => {
      const who = m.role === "assistant" ? "**Tofin**" : "**User**";
      const text = m.content.length > 120 ? m.content.slice(0, 120) + "…" : m.content;
      return `\`${i + 1}.\` ${who}: ${text}`;
    });

    const embed = new EmbedBuilder()
      .setTitle("🧠  Channel Memory")
      .setDescription(lines.join("\n\n"))
      .setFooter({ text: `${hist.length} message(s) stored · use ,aiclear to wipe` })
      .setColor(0x5865f2)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
