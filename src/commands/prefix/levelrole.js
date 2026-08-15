const { PermissionFlagsBits } = require("discord.js");
const { getLevelRoles, addLevelRole, removeLevelRole } = require("../../services/leveling");
const { success, danger, warn, rich, info } = require("../../util/embed");
const { colors } = require("../../config");

module.exports = {
  name: "levelrole",
  aliases: ["levelroles", "lvlrole"],
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Manage Roles)")] });
    }

    const sub = args[0]?.toLowerCase();

    if (sub === "add") {
      const level = parseInt(args[1]);
      const role = message.mentions.roles.first();
      if (!level || !role) {
        return message.reply({ embeds: [warn("Usage", "`,levelrole add <level> @role`\n**Example:** `,levelrole add 10 @Regular`")] });
      }
      if (role.managed || role.id === message.guild.id) {
        return message.reply({ embeds: [danger("Invalid Role", "That role can't be assigned automatically.")] });
      }
      addLevelRole(message.guild.id, level, role.id);
      return message.reply({ embeds: [success("Level Role Added", `Members will now receive ${role} upon reaching **Level ${level}**.`)] });
    }

    if (sub === "remove") {
      const level = parseInt(args[1]);
      if (!level) return message.reply({ embeds: [warn("Usage", "`,levelrole remove <level>`")] });
      removeLevelRole(message.guild.id, level);
      return message.reply({ embeds: [success("Level Role Removed", `Removed the reward role for **Level ${level}**.`)] });
    }

    const roles = getLevelRoles(message.guild.id);
    if (!roles.length) {
      return message.reply({ embeds: [info("Level Roles", "No level-up role rewards configured yet.\nUse `,levelrole add <level> @role` to add one.")] });
    }
    const lines = roles.map((r) => `**Level ${r.level}** → <@&${r.roleId}>`).join("\n");
    return message.reply({ embeds: [rich({ title: "🏷️  Level Roles", description: lines, color: colors.primary, footer: "Roles stack — members keep every role they've earned." })] });
  },
};
