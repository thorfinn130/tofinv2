const { PermissionFlagsBits } = require("discord.js");
const { success, danger, warn, info } = require("../../util/embed");

module.exports = {
  name: "tbrole",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Manage Roles)")] });
    }

    const role = message.mentions.roles.first();
    if (!role) {
      return message.reply({ embeds: [warn("Missing Role", "You need to mention a role.\n**Usage:** `,tbrole @role`\n**Example:** `,tbrole @Bots`")] });
    }

    await message.guild.members.fetch();
    const bots = message.guild.members.cache.filter((m) => m.user.bot);

    if (bots.size === 0) {
      return message.reply({ embeds: [info("No Bots", "There are no bots in this server.")] });
    }

    let given = 0;
    let skipped = 0;

    for (const [, bot] of bots) {
      if (bot.roles.cache.has(role.id)) {
        skipped++;
        continue;
      }
      try {
        await bot.roles.add(role, `tbrole by ${message.author.tag}`);
        given++;
      } catch {}
    }

    return message.reply({
      embeds: [success("Done!", `**${role.name}** assigned to bots\nGiven: **${given}** · Skipped (already had it): **${skipped}**`)],
    });
  },
};
