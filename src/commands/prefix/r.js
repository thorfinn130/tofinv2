const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { danger, warn, success } = require("../../util/embed");

module.exports = {
  name: "r",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: **Manage Roles**")] });
    }

    const target = message.mentions.members.first();

    if (!target) return message.reply({ embeds: [warn("Usage", "**Usage:** `,r @user <role name>`\nMention the user first, then type the role name (no need to @mention the role).")] });

    // Remove the user mention from args, whatever's left is the role name
    const roleNameRaw = args
      .filter(a => !a.includes(target.id))
      .join(" ")
      .trim();

    if (!roleNameRaw) return message.reply({ embeds: [warn("Usage", "**Usage:** `,r @user <role name>`\nYou need to type the role name after mentioning the user.")] });

    const roleNameLower = roleNameRaw.toLowerCase();
    const role =
      message.guild.roles.cache.find(r => r.name.toLowerCase() === roleNameLower) ||
      message.guild.roles.cache.find(r => r.name.toLowerCase().includes(roleNameLower));

    if (!role) return message.reply({ embeds: [warn("Role Not Found", `No role found matching **${roleNameRaw}**.`)] });

    if (role.position >= message.guild.members.me.roles.highest.position) {
      return message.reply({ embeds: [danger("Role Too High", "That role is above or equal to my highest role. I can't assign it.")] });
    }

    const hasRole = target.roles.cache.has(role.id);
    if (hasRole) {
      await target.roles.remove(role);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅  Role Removed")
            .setDescription(`**${role}** has been removed from ${target}.`)
            .setColor(0xed4245)
            .setFooter({ text: `Done by ${message.author.tag}` })
            .setTimestamp(),
        ],
      });
    } else {
      await target.roles.add(role);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅  Role Given")
            .setDescription(`**${role}** has been given to ${target}.`)
            .setColor(0x57f287)
            .setFooter({ text: `Done by ${message.author.tag}` })
            .setTimestamp(),
        ],
      });
    }
  },
};