const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");

const KEY_PERMS = [
  ["Administrator",        "👑 Administrator"],
  ["ManageGuild",          "⚙️ Manage Server"],
  ["ManageRoles",          "🏷️ Manage Roles"],
  ["ManageChannels",       "📂 Manage Channels"],
  ["ManageMessages",       "🗑️ Manage Messages"],
  ["ManageNicknames",      "✏️ Manage Nicknames"],
  ["ManageWebhooks",       "🔗 Manage Webhooks"],
  ["ManageEmojisAndStickers","😀 Manage Emojis"],
  ["KickMembers",          "👢 Kick Members"],
  ["BanMembers",           "🔨 Ban Members"],
  ["MentionEveryone",      "📣 Mention Everyone"],
  ["ViewAuditLog",         "📋 View Audit Log"],
  ["ModerateMembers",      "⏱️ Timeout Members"],
];

module.exports = {
  name: "roleinfo",
  aliases: ["ri", "role-info"],
  async run(message, args) {
    const role = message.mentions.roles.first()
      ?? message.guild.roles.cache.find((r) => r.name.toLowerCase() === args.join(" ").toLowerCase())
      ?? message.guild.roles.cache.get(args[0]);

    if (!role) {
      return message.reply({ content: "❌ Please mention a role or provide its name.\n**Usage:** `,roleinfo @role`" });
    }

    await message.guild.members.fetch().catch(() => {});
    const memberCount = message.guild.members.cache.filter((m) => m.roles.cache.has(role.id)).size;

    const keyPerms = KEY_PERMS
      .filter(([flag]) => role.permissions.has(PermissionFlagsBits[flag] ?? 0n))
      .map(([, label]) => label);

    const created = `<t:${Math.floor(role.createdTimestamp / 1000)}:D> (<t:${Math.floor(role.createdTimestamp / 1000)}:R>)`;

    const flags = [
      role.hoist       && "📌 Displayed Separately",
      role.mentionable && "📣 Mentionable",
      role.managed     && "🤖 Managed by Integration",
    ].filter(Boolean);

    const embed = new EmbedBuilder()
      .setTitle(`🏷️  ${role.name}`)
      .setColor(role.color || 0x5865f2)
      .addFields(
        { name: "🪪  Role ID",      value: `\`${role.id}\``,                                   inline: true },
        { name: "🎨  Color",        value: role.hexColor === "#000000" ? "*None*" : `\`${role.hexColor}\``, inline: true },
        { name: "📊  Position",     value: `${role.position} of ${message.guild.roles.cache.size}`,        inline: true },
        { name: "👥  Members",      value: `**${memberCount.toLocaleString()}** member${memberCount !== 1 ? "s" : ""}`, inline: true },
        { name: "📅  Created",      value: created,                                             inline: false },
        { name: "⚙️  Flags",        value: flags.length ? flags.join("\n") : "*None*",          inline: false },
        { name: `🔑  Key Permissions (${keyPerms.length})`, value: keyPerms.length ? keyPerms.join("\n") : "*None*", inline: false },
      )
      .setFooter({ text: `Requested by ${message.author.username}` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
