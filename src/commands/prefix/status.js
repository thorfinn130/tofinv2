const { PermissionFlagsBits } = require("discord.js");
const { addRule, removeRule, listRules } = require("../../services/statusRoles");
const { success, danger, warn, info, rich } = require("../../util/embed");
const { colors } = require("../../config");

module.exports = {
  name: "status",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Manage Roles)")] });
    }

    // ,status list — show all active rules in this server
    if (args[0]?.toLowerCase() === "list") {
      const rules = listRules(message.guild.id);
      if (!rules.length) {
        return message.reply({ embeds: [info("Status Roles", "No status-role rules set up yet.")] });
      }
      const lines = rules.map((r) => `<@&${r.roleId}> — contains \`${r.matchText}\``).join("\n");
      return message.reply({ embeds: [rich({ title: "📡  Status Roles", description: lines, color: colors.primary })] });
    }

    // ,status remove @role — stop tracking that role
    if (args[0]?.toLowerCase() === "remove") {
      const role = message.mentions.roles.first();
      if (!role) {
        return message.reply({ embeds: [warn("Missing Role", "**Usage:** `,status remove @role`")] });
      }
      const removed = removeRule(message.guild.id, role.id);
      if (!removed) {
        return message.reply({ embeds: [warn("Not Found", "No rule exists for that role.")] });
      }

      // Strip the role from everyone who has it, since the auto-assignment is gone
      await message.guild.members.fetch();
      const holders = message.guild.members.cache.filter((m) => m.roles.cache.has(role.id));
      for (const [, m] of holders) {
        await m.roles.remove(role.id).catch(() => {});
      }

      return message.reply({ embeds: [success("Removed", `**${role.name}** is no longer a status-triggered role. Removed it from **${holders.size}** member(s) who had it.`)] });
    }

    // ,status @role {text} — set up the rule
    const role = message.mentions.roles.first();
    if (!role) {
      return message.reply({
        embeds: [warn(
          "Missing Role",
          "**Usage:** `,status @role <text>`\n**Example:** `,status @Angelo Fan /angelo`\n\nAnyone whose Discord custom status contains that text will automatically get the role. Removing it from their status removes the role too."
        )],
      });
    }

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply({ embeds: [danger("Bot Missing Permission", "Permission: (Manage Roles)\n\nGive the bot's role **Manage Roles** permission.")] });
    }

    if (role.position >= message.guild.members.me.roles.highest.position) {
      return message.reply({ embeds: [danger("Role Too High", "That role is higher than or equal to my own highest role — I can't assign it. Move my role above it in Server Settings → Roles.")] });
    }

    // Everything after the role mention is the match text
    const mentionPattern = /<@&\d+>/;
    const matchText = message.content.split(/\s+/).slice(1).join(" ").replace(mentionPattern, "").trim();

    if (!matchText) {
      return message.reply({ embeds: [warn("Missing Text", "**Usage:** `,status @role <text>`\nYou need to include the text to match against people's custom status.")] });
    }

    addRule({ guildId: message.guild.id, roleId: role.id, matchText, createdBy: message.author.id });

    return message.reply({
      embeds: [success(
        "Status Role Set",
        `Anyone whose custom status contains **${matchText}** will now automatically get **${role.name}**.\nRemoving it from their status removes the role too.`
      )],
    });
  },
};
