const { PermissionFlagsBits } = require("discord.js");
const { danger, warn, info } = require("../../util/embed");

module.exports = {
  name: "mrole",
  aliases: ["tmrole"],
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Manage Roles)")] });
    }

    const role = message.mentions.roles.first();
    if (!role) {
      return message.reply({ embeds: [warn("Missing Role", "You need to mention a role.\n**Usage:** `,mrole @role`\n**Example:** `,mrole @Members`")] });
    }

    await message.guild.members.fetch();
    const members = message.guild.members.cache.filter((m) => !m.user.bot);

    if (members.size === 0) {
      return message.reply({ embeds: [info("No Members", "There are no human members in this server.")] });
    }

    let given = 0;
    let skipped = 0;

    for (const [, member] of members) {
      if (member.roles.cache.has(role.id)) {
        skipped++;
        continue;
      }
      try {
        await member.roles.add(role, `tmrole by ${message.author.tag}`);
        given++;
      } catch {}
    }

    return message.reply("👌");
  },
};
