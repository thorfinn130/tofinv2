const { PermissionFlagsBits } = require("discord.js");
const { getRoles, addRole, removeRole } = require("../../services/autorole");
const { success, danger, warn, info } = require("../../util/embed");

module.exports = {
  name: "autorole",
  aliases: ["autoroles"],
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Manage Roles)")] });
    }

    const sub = args[0]?.toLowerCase();

    if (sub === "list") {
      const roleIds = getRoles(message.guild.id);
      if (!roleIds.length) {
        return message.reply({ embeds: [info("Autoroles", "No autoroles set up yet.\n**Usage:** `,autorole add @role`")] });
      }
      const lines = roleIds.map((id) => `<@&${id}>`).join("\n");
      return message.reply({ embeds: [info(`📋  Autoroles (${roleIds.length})`, lines)] });
    }

    if (sub === "remove") {
      const role = message.mentions.roles.first();
      if (!role) {
        return message.reply({ embeds: [warn("Missing Role", "**Usage:** `,autorole remove @role`")] });
      }
      const removed = removeRole(message.guild.id, role.id);
      if (!removed) {
        return message.reply({ embeds: [warn("Not Found", `**${role.name}** isn't currently an autorole.`)] });
      }
      return message.reply({ embeds: [success("Removed", `**${role.name}** will no longer be given automatically.`)] });
    }

    if (sub === "add") {
      const roles = message.mentions.roles;
      if (!roles.size) {
        return message.reply({
          embeds: [warn("Missing Role", "**Usage:** `,autorole add @role`\nMention multiple roles to add several at once: `,autorole add @role1 @role2`")],
        });
      }

      if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return message.reply({ embeds: [danger("Bot Missing Permission", "Permission: (Manage Roles)")] });
      }

      const tooHigh = [];
      const added = [];
      const already = [];

      for (const role of roles.values()) {
        if (role.position >= message.guild.members.me.roles.highest.position) {
          tooHigh.push(role.name);
          continue;
        }
        const wasAdded = addRole(message.guild.id, role.id);
        if (wasAdded) added.push(role.name); else already.push(role.name);
      }

      const lines = [];
      if (added.length) lines.push(`✅ Added: **${added.join(", ")}**`);
      if (already.length) lines.push(`ℹ️ Already set: **${already.join(", ")}**`);
      if (tooHigh.length) lines.push(`⚠️ Skipped (higher than my role): **${tooHigh.join(", ")}**`);

      return message.reply({
        embeds: [success("Autorole Updated", lines.join("\n") || "Nothing changed.")],
      });
    }

    return message.reply({
      embeds: [info(
        "Autorole Usage",
        "`,autorole add @role` — give this role to every new member automatically (supports multiple: `@role1 @role2`)\n`,autorole remove @role` — stop giving it automatically\n`,autorole list` — see all current autoroles"
      )],
    });
  },
};