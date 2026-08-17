const { isRealOwner, grantOwner, revokeOwner, listGrantedOwners } = require("../../services/botOwner");
const { success, danger, warn, info, rich } = require("../../util/embed");
const { colors } = require("../../config");

module.exports = {
  name: "grantowner",
  aliases: ["revokeowner"],
  async run(message, args) {
    const calledAs = message.content.slice(1).trim().split(/\s+/)[0].toLowerCase();

    // Only the REAL hardcoded bot owner can ever grant or revoke — not even other granted owners.
    if (!isRealOwner(message.author.id)) {
      return message.reply({ embeds: [danger("Bot Owner Only", "Only the real bot owner can manage this permission.")] });
    }

    // ,grantowner list / ,revokeowner list — show who currently has it
    if (args[0]?.toLowerCase() === "list") {
      const ids = listGrantedOwners();
      if (!ids.length) {
        return message.reply({ embeds: [info("Granted Owners", "No one has been granted bot owner permission.")] });
      }
      const lines = ids.map((id) => `<@${id}>`).join("\n");
      return message.reply({ embeds: [rich({ title: "🔐  Granted Bot Owners", description: lines, color: colors.warn })] });
    }

    const user = message.mentions.users.first();
    if (!user) {
      return message.reply({
        embeds: [warn("Missing User", `**Usage:** \`,${calledAs} @user\`\nOr \`,${calledAs} list\` to see who currently has this permission.`)],
      });
    }

    if (isRealOwner(user.id)) {
      return message.reply({ embeds: [warn("Not Needed", "That's already the real bot owner.")] });
    }

    if (calledAs === "revokeowner") {
      revokeOwner(user.id);
      return message.reply({ embeds: [success("Owner Revoked", `**${user.tag}** no longer has bot owner permission.`)] });
    }

    grantOwner(user.id);
    return message.reply({
      embeds: [success(
        "Owner Granted",
        `**${user.tag}** now has bot owner permission.\nThis gives access to **,admin** and other bot-wide admin tools — **not** \`,restart\`, \`,giveownership\`, or \`,execute\`, which remain Discord-server-owner-only.`
      )],
    });
  },
};
