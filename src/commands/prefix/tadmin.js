const { isBotOwner } = require("../../services/botOwner");
const {
  adminSetLevel, adminAddXp, setXpRate, setXpCooldown, resetUser,
} = require("../../services/leveling");
const { success, danger, warn, info } = require("../../util/embed");

function fmt(n) { return n.toLocaleString(); }

module.exports = {
  name: "tadmin",
  run(message, args) {
    if (!isBotOwner(message.author.id)) return;

    const sub = args[0]?.toLowerCase();

    if (sub === "level") {
      const target = message.mentions.users.first();
      const level = parseInt(args[2]);
      if (!target || isNaN(level)) return message.reply({ embeds: [warn("Usage", "`,tadmin level @user <level>`")] });
      const u = adminSetLevel(message.guild.id, target.id, level);
      return message.reply({ embeds: [success("Level Set", `**${target.username}** is now **Level ${u.level}**`)] });
    }

    if (sub === "addxp") {
      const target = message.mentions.users.first();
      const amount = parseInt(args[2]);
      if (!target || isNaN(amount)) return message.reply({ embeds: [warn("Usage", "`,tadmin addxp @user <amount>`")] });
      const { u, leveled } = adminAddXp(message.guild.id, target.id, amount);
      return message.reply({ embeds: [success("XP Added", `**${target.username}** now has **${fmt(u.xp)} XP** at **Level ${u.level}**${leveled ? " (leveled up!)" : ""}`)] });
    }

    if (sub === "resetlevel") {
      const target = message.mentions.users.first();
      if (!target) return message.reply({ embeds: [warn("Usage", "`,tadmin resetlevel @user`")] });
      resetUser(message.guild.id, target.id);
      return message.reply({ embeds: [success("Level Reset", `**${target.username}**'s level and XP have been reset.`)] });
    }

    if (sub === "xprate") {
      const rate = parseInt(args[1]);
      if (isNaN(rate)) return message.reply({ embeds: [warn("Usage", "`,tadmin xprate <amount>` — XP given per message")] });
      const set = setXpRate(message.guild.id, rate);
      return message.reply({ embeds: [success("XP Rate Set", `Members now earn **${set} XP** per message.`)] });
    }

    if (sub === "xpcooldown") {
      const seconds = parseInt(args[1]);
      if (isNaN(seconds)) return message.reply({ embeds: [warn("Usage", "`,tadmin xpcooldown <seconds>`")] });
      setXpCooldown(message.guild.id, seconds);
      return message.reply({ embeds: [success("XP Cooldown Set", `Members can now earn XP once every **${seconds}s**.`)] });
    }

    return message.reply({ embeds: [info("tadmin", "**Subcommands:**\n`level @user <level>`\n`addxp @user <amount>`\n`resetlevel @user`\n`xprate <amount>`\n`xpcooldown <seconds>`\n\nUse `,ttthelp` to see all other admin commands.")] });
  },
};
