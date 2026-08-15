const { PermissionFlagsBits } = require("discord.js");
const { success, danger, warn, info } = require("../../util/embed");

module.exports = {
  name: "execute",
  async run(message, args) {
    if (message.author.id !== message.guild.ownerId) {
      return message.reply({ embeds: [danger("Owner Only", "Only the **server owner** can use this command.")] });
    }

    const role = message.mentions.roles.first();
    if (!role) {
      return message.reply({ embeds: [warn("Missing Role", "You need to mention a role.\n**Usage:** `,execute @role`\n**Example:** `,execute @Spammer`")] });
    }

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply({ embeds: [danger("Bot Missing Permission", "Permission: (Kick Members)\n\nGo to your Discord server → **Roles** → give the bot's role **Kick Members** permission.")] });
    }

    await message.guild.members.fetch();
    const members = message.guild.members.cache.filter((m) => m.roles.cache.has(role.id));

    if (members.size === 0) {
      return message.reply({ embeds: [info("No Members", `No one currently has the **${role.name}** role.`)] });
    }

    let kicked = 0;
    let failed = 0;

    for (const [, member] of members) {
      // never try to kick someone the bot can't touch (higher/equal role, or the kicker themself if not kickable)
      if (!member.kickable) {
        failed++;
        continue;
      }
      try {
        await member.kick(`,execute by ${message.author.tag} — had role ${role.name}`);
        kicked++;
      } catch {
        failed++;
      }
    }

    return message.reply({
      embeds: [success("Done!", `Removed everyone with **${role.name}**\nKicked: **${kicked}** · Failed/skipped: **${failed}**`)],
    });
  },
};
