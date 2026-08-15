const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { danger, warn } = require("../../util/embed");
const { colors } = require("../../config");

module.exports = {
  name: "announce",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Manage Messages)")] });
    }
    const channel = message.mentions.channels.first();
    if (!channel) {
      return message.reply({ embeds: [warn("Missing Channel", "Mention a channel to send the announcement to.\n**Usage:** `,announce #channel <message>`\n**Example:** `,announce #announcements Server maintenance tonight!`")] });
    }
    const text = args.slice(1).join(" ");
    if (!text) {
      return message.reply({ embeds: [warn("Missing Message", "Provide the announcement text.\n**Usage:** `,announce #channel <message>`")] });
    }
    const embed = new EmbedBuilder()
      .setTitle("📢  Announcement")
      .setDescription(text)
      .setColor(colors.primary)
      .setFooter({ text: `Posted by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();
    await channel.send({ embeds: [embed] });
    await message.reply({ embeds: [{ title: "✅  Done!", description: `Announcement sent to ${channel}.`, color: colors.success }] });
  },
};
