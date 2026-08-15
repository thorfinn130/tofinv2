const { EmbedBuilder } = require("discord.js");
const { danger } = require("../../util/embed");

const OWNER_IDS = (process.env.OWNER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

module.exports = {
  name: "ssl",
  async run(message, args) {
    // Bot owner only
    const isOwner = OWNER_IDS.includes(message.author.id)
      || message.author.id === process.env.OWNER_ID;

    if (!isOwner) {
      return message.reply({ embeds: [danger("Owner Only", "This command is restricted to the bot owner.")] });
    }

    const guilds = message.client.guilds.cache;
    const total  = guilds.size;

    const chunkSize = 15;
    const pages = [];
    const arr   = [...guilds.values()];

    for (let i = 0; i < arr.length; i += chunkSize) {
      pages.push(arr.slice(i, i + chunkSize));
    }

    const pageNum = Math.max(0, (parseInt(args[0]) || 1) - 1);
    const page    = pages[pageNum] ?? pages[0];

    const lines = page.map((g) => {
      const owner    = g.ownerId ? `<@${g.ownerId}>` : "Unknown";
      const members  = g.memberCount ?? "?";
      return `**${g.name}** (${g.id})\nOwner: ${owner} · Members: ${members}`;
    }).join("\n\n");

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`🌐  Server List — Page ${pageNum + 1}/${pages.length}`)
          .setDescription(lines || "No servers.")
          .setColor(0x5865f2)
          .setFooter({ text: `Total: ${total} server${total !== 1 ? "s" : ""} · Page ${pageNum + 1}/${pages.length} · Use ,ssl <page> for more` })
          .setTimestamp(),
      ],
    });
  },
};
