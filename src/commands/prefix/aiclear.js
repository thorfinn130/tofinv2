const { PermissionFlagsBits } = require("discord.js");
const { clearHistory } = require("../../services/aiChat");

module.exports = {
  name: "aiclear",
  aliases: ["clearai", "aiforget"],
  async run(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply({ content: "❌ You need Manage Messages to do that." });
    }
    clearHistory(message.channel.id);
    return message.reply({ content: "🧹 cleared my memory for this channel — fresh start" });
  },
};
