const { PermissionFlagsBits } = require("discord.js");
const { danger, warn } = require("../../util/embed");
const { resolveMember, resolveRole, formatAmbiguous } = require("../../util/resolve");

// Suppress both the reply-ping and any inline @mention ping, while still
// rendering a real, clickable mention chip in the confirmation text.
const SILENT = { users: [], repliedUser: false };

module.exports = {
  name: "r",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: **Manage Roles**")] });
    }
    if (!args.length) {
      return message.reply({ embeds: [warn("Usage", "**Usage:** `,r <user> <role>`\nWorks with a mention, username, nickname, or even a close typo of either.")] });
    }

    // If there's a real mention, use it directly and treat everything else
    // as the role query (supports multi-word role names this way).
    const mentioned = message.mentions.members.first();
    let userQuery, roleQuery;
    if (mentioned) {
      userQuery = `<@${mentioned.id}>`;
      roleQuery = args.filter((a) => !a.includes(mentioned.id)).join(" ").trim();
    } else {
      // No mention — first token is the user, the rest is the role.
      [userQuery, ...args] = args;
      roleQuery = args.join(" ").trim();
    }

    if (!roleQuery) {
      return message.reply({ embeds: [warn("Usage", "**Usage:** `,r <user> <role>`\nYou need to give a role after the user.")] });
    }

    const userResult = resolveMember(message.guild, userQuery);
    if (userResult.status === "not_found") {
      return message.reply({ embeds: [warn("User Not Found", `Couldn't find anyone matching \`${userQuery}\`.`)] });
    }
    if (userResult.status === "ambiguous") {
      return message.reply({ content: formatAmbiguous(userResult, "member"), allowedMentions: SILENT });
    }
    const target = userResult.match;

    const roleResult = resolveRole(message.guild, roleQuery);
    if (roleResult.status === "not_found") {
      return message.reply({ embeds: [warn("Role Not Found", `Couldn't find a role matching \`${roleQuery}\`.`)] });
    }
    if (roleResult.status === "ambiguous") {
      return message.reply({ content: formatAmbiguous(roleResult, "role"), allowedMentions: SILENT });
    }
    const role = roleResult.match;

    if (role.position >= message.guild.members.me.roles.highest.position) {
      return message.reply({ embeds: [danger("Role Too High", "That role is above or equal to my highest role. I can't assign it.")] });
    }

    const hasRole = target.roles.cache.has(role.id);
    if (hasRole) {
      await target.roles.remove(role);
      return message.reply({ content: `✓ Removed role \`${role.name}\` from <@${target.id}>`, allowedMentions: SILENT });
    } else {
      await target.roles.add(role);
      return message.reply({ content: `✓ Added role \`${role.name}\` to <@${target.id}>`, allowedMentions: SILENT });
    }
  },
};
