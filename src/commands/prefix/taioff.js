const { setEnabled } = require("../../services/aiChat");

module.exports = {
  name: "taioff",
  async run(message) {
    if (!message.member.permissions.has("ManageGuild")) {
      return message.reply("❌ You need **Manage Server** permission to do that.");
    }
    setEnabled(message.guild.id, false);
    return message.reply("🔴 AI chat is now **OFF** — Tofin won't respond to messages anymore.");
  },
};
