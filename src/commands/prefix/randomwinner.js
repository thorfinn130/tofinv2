const { PermissionFlagsBits } = require("discord.js");
const { rich, warn, danger } = require("../../util/embed");
const { colors } = require("../../config");

module.exports = {
  name: "randomwinner",
  aliases: ["rw"],
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Manage Messages)")] });
    }
    const role = message.mentions.roles.first();
    if (!role) {
      return message.reply({ embeds: [warn("Missing Role", "Mention a role to pick a winner from.\n**Usage:** `,randomwinner @role`\n**Example:** `,randomwinner @Giveaway`")] });
    }
    await message.guild.members.fetch();
    const eligible = message.guild.members.cache.filter(
      (m) => !m.user.bot && m.roles.cache.has(role.id)
    );
    if (!eligible.size) {
      return message.reply({ embeds: [warn("No Eligible Members", `No human members with the **${role.name}** role were found.`)] });
    }
    const winner = eligible.random();
    const embed = rich({
      title: "🏆  Winner Selected!",
      description: `${winner} has been chosen from **${eligible.size}** eligible member${eligible.size !== 1 ? "s" : ""} in **${role.name}**!\n\nCongratulations! 🎉`,
      color: colors.success,
      thumbnail: winner.user.displayAvatarURL({ size: 256 }),
      fields: [
        { name: "👤  Winner", value: `${winner.user.tag}`, inline: true },
        { name: "🏷️  Role", value: role.name, inline: true },
        { name: "🎟️  Pool Size", value: `${eligible.size}`, inline: true },
      ],
      footer: `Drawn by ${message.author.tag}`,
    });
    return message.reply({ embeds: [embed] });
  },
};
