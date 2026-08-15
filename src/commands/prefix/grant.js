const { isBotOwner } = require("../../services/botOwner");
const { grantAdmin, revokeAdmin, listAdmins } = require("../../services/botAdmins");
const { success, danger, warn, info, rich } = require("../../util/embed");
const { colors } = require("../../config");

module.exports = {
  name: "grant",
  async run(message, args) {
    const sub = args[0]?.toLowerCase();

    if (sub !== "admin") {
      return message.reply({
        embeds: [warn("Usage", "`,grant admin @user` — give someone permission to remove shop templates & server-list entries\n`,grant admin remove @user` — revoke it\n`,grant admin list` — see who currently has it")],
      });
    }

    // Only the real bot owner or granted bot-owners can manage this
    if (!isBotOwner(message.author.id)) {
      return message.reply({ embeds: [danger("Missing Permission", "Only the bot owner can grant this.")] });
    }

    if (args[1]?.toLowerCase() === "list") {
      const admins = listAdmins();
      if (!admins.length) {
        return message.reply({ embeds: [info("Bot Admins", "No one has been granted this permission yet.")] });
      }
      const lines = admins.map((id) => `<@${id}>`).join("\n");
      return message.reply({ embeds: [rich({ title: "🛡️  Bot Admins", description: lines, color: colors.primary })] });
    }

    if (args[1]?.toLowerCase() === "remove") {
      const user = message.mentions.users.first();
      if (!user) {
        return message.reply({ embeds: [warn("Missing User", "**Usage:** `,grant admin remove @user`")] });
      }
      revokeAdmin(user.id);
      return message.reply({ embeds: [success("Revoked", `**${user.tag}** can no longer remove shop templates or server-list entries.`)] });
    }

    const user = message.mentions.users.first();
    if (!user) {
      return message.reply({ embeds: [warn("Missing User", "**Usage:** `,grant admin @user`")] });
    }

    grantAdmin(user.id);
    return message.reply({
      embeds: [success(
        "Admin Granted",
        `**${user.tag}** can now remove any template listing from \`,templateshop\` and any entry from \`,servers\`, to help moderate bot usage.`
      )],
    });
  },
};
