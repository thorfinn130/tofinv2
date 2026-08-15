const { EmbedBuilder } = require("discord.js");

const MAX_HISTORY = 100; // how many deleted messages to remember per channel

// Stored in module scope — shared across all command calls
const snipeCache = new Map(); // channelId → [{ content, author, attachments, deletedAt }, ...] (newest first)

function storeDelete(message) {
  if (message.author?.bot) return;
  if (!message.content && !message.attachments.size) return;

  const entry = {
    content:     message.content || null,
    author:      message.author,
    attachments: [...message.attachments.values()].map((a) => a.url),
    deletedAt:   Date.now(),
  };

  const history = snipeCache.get(message.channel.id) || [];
  history.unshift(entry); // newest at the front
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  snipeCache.set(message.channel.id, history);
}

module.exports = {
  name: "snipe",
  aliases: ["s"],
  storeDelete,
  async run(message, args) {
    const history = snipeCache.get(message.channel.id) || [];

    if (!history.length) {
      return message.reply({ content: "nothing to snipe in this channel rn" });
    }

    // ,snipe 2 -> the 2nd most recently deleted message (1-indexed, like a normal person would expect)
    let index = 1;
    if (args[0]) {
      const parsed = parseInt(args[0], 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return message.reply({ content: `❌ Give a number between 1 and ${Math.min(history.length, MAX_HISTORY)}.` });
      }
      index = parsed;
    }

    if (index > history.length) {
      return message.reply({ content: `❌ I've only got ${history.length} deleted message${history.length === 1 ? "" : "s"} for this channel.` });
    }

    const data = history[index - 1];
    const ago = Math.round((Date.now() - data.deletedAt) / 1000);
    const timeStr = ago < 60 ? `${ago}s ago` : ago < 3600 ? `${Math.floor(ago / 60)}m ago` : `${Math.floor(ago / 3600)}h ago`;

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setAuthor({ name: data.author.tag ?? data.author.username, iconURL: data.author.displayAvatarURL() })
      .setDescription(data.content || "*[no text — attachment only]*")
      .setFooter({ text: `Deleted ${timeStr}  ·  #${index} of ${history.length}  ·  Sniped by ${message.author.username}` })
      .setTimestamp();

    if (data.attachments[0]) embed.setImage(data.attachments[0]);

    return message.reply({ embeds: [embed] });
  },
};
