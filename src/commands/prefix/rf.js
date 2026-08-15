const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { danger, warn, success } = require("../../util/embed");

module.exports = {
  name: "rf",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: **Manage Roles**")] });
    }

    const role = message.mentions.roles.first();
    if (!role) return message.reply({ embeds: [warn("Usage", "**Usage:** `,rf @role`\nMention the role you want to delete.")] });

    if (role.position >= message.guild.members.me.roles.highest.position) {
      return message.reply({ embeds: [danger("Role Too High", "That role is above or equal to my highest role. I can't delete it.")] });
    }
    if (role.managed) {
      return message.reply({ embeds: [danger("Managed Role", "That role is managed by an integration and cannot be deleted.")] });
    }

    const roleName = role.name;
    await role.delete(`Deleted by ${message.author.tag}`);

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🗑️  Role Deleted")
          .setDescription(`The role **${roleName}** has been permanently deleted.`)
          .setColor(0xed4245)
          .setFooter({ text: `Done by ${message.author.tag}` })
          .setTimestamp(),
      ],
    });
  },
};
