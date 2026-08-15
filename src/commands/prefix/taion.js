const { setEnabled } = require("../../services/aiChat");

module.exports = {
  name: "taion",
  async run(message) {
    if (!message.member.permissions.has("ManageGuild")) {
      return message.reply("❌ You need **Manage Server** permission to do that.");
    }
    setEnabled(message.guild.id, true);
    return message.reply("✅ AI chat is now **ON** — mention me or say **tofin** to chat!");
  },
};
