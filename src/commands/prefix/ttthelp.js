// Replaced by the /ttthelp slash command (ephemeral — only visible to you).
// This prefix stub silently does nothing so the old command doesn't error.
const { isBotOwner } = require("../../services/botOwner");

module.exports = {
  name: "ttthelp",
  run(message) {
    if (!isBotOwner(message.author.id)) return;
    // Delete the trigger message so members don't see it, then tell owner to use slash.
    message.delete().catch(() => {});
    message.author.send("Use `/ttthelp` (slash command) instead — it shows only to you with no DM needed.").catch(() => {});
  },
};

