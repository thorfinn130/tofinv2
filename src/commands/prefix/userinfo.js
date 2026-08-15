const { rich } = require("../../util/embed");
const { getWarnings } = require("../../services/moderation");
const { colors } = require("../../config");

module.exports = {
  name: "userinfo",
  aliases: ["ui"],
  async run(message, args) {
    const user = message.mentions.users.first() ?? message.author;
    const member = message.guild.members.cache.get(user.id);
    const warnings = getWarnings(message.guild.id, user.id);

    const roles = member?.roles.cache
      .filter((r) => r.name !== "@everyone")
      .sort((a, b) => b.position - a.position)
      .map((r) => r.toString())
      .slice(0, 10)
      .join(", ") || "_None_";

    const joined = member?.joinedAt
      ? `<t:${Math.floor(member.joinedAt / 1000)}:D> (<t:${Math.floor(member.joinedAt / 1000)}:R>)`
      : "_Unknown_";
    const created = `<t:${Math.floor(user.createdTimestamp / 1000)}:D> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)`;

    const embed = rich({
      title: `👤  ${user.tag}`,
      color: member?.displayColor || colors.primary,
      thumbnail: user.displayAvatarURL({ size: 256 }),
      fields: [
        { name: "🪪  User ID", value: user.id, inline: true },
        { name: "🤖  Bot", value: user.bot ? "Yes" : "No", inline: true },
        { name: "⚠️  Warnings", value: `${warnings.length}`, inline: true },
        { name: "📅  Account Created", value: created, inline: false },
        { name: "📥  Joined Server", value: joined, inline: false },
        { name: `🏷️  Roles (${member?.roles.cache.size - 1 || 0})`, value: roles, inline: false },
      ],
      footer: `Requested by ${message.author.tag}`,
    });

    return message.reply({ embeds: [embed] });
  },
};
