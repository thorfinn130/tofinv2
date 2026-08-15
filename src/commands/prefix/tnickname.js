const { PermissionFlagsBits } = require("discord.js");
const { success, danger, warn } = require("../../util/embed");

module.exports = {
  name: "tnickname",
  aliases: ["tnick"],
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Manage Nicknames)")] });
    }
    const member = message.mentions.members.first();
    if (!member) {
      return message.reply({ embeds: [warn("Missing User", "You need to mention a user.\n**Usage:** `,tnickname @user <new nickname>`\n**Example:** `,tnickname @John CoolName`\n> Leave out the nickname to reset it.")] });
    }
    const nickname = args.slice(1).join(" ") || null;
    try {
      await member.setNickname(nickname, `Changed by ${message.author.tag}`);
      return message.reply({
        embeds: [success("Done!", nickname ? `${member}'s nickname set to **${nickname}**` : `${member}'s nickname has been reset`)],
      });
    } catch (e) {
      if (e.code === 50013) {
        return message.reply({ embeds: [danger("Bot Missing Permission", "Permission: (Manage Nicknames)\n\nGo to your Discord server → **Roles** → give the bot's role **Manage Nicknames** permission, or make sure the bot's role is above the target user.")] });
      }
      throw e;
    }
  },
};
