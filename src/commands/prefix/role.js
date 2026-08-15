const { PermissionFlagsBits, PermissionsBitField } = require("discord.js");
const { success, danger, warn, info } = require("../../util/embed");
const { EmbedBuilder } = require("discord.js");

const VOICE_PERMS = [
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.Stream,
  PermissionFlagsBits.UseVAD,
  PermissionFlagsBits.PrioritySpeaker,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
  PermissionFlagsBits.MoveMembers,
];

// Get ALL permissions (including Administrator, all channel & guild perms)
const ALL_PERMS = Object.values(PermissionFlagsBits);

const PRESETS = {
  trialmod_perm: {
    label: "Trial Mod",
    color: 0x3498DB,
    perms: [
      PermissionFlagsBits.ManageNicknames,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageMessages,
      ...VOICE_PERMS,
    ],
  },
  mod_perm: {
    label: "Mod",
    color: 0x2ECC71,
    perms: [
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.ManageNicknames,
      ...VOICE_PERMS,
    ],
  },
  admin_perm: {
    label: "Admin",
    color: 0xE67E22,
    perms: [
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.ManageNicknames,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageGuildExpressions,
      PermissionFlagsBits.ManageWebhooks,
      ...VOICE_PERMS,
    ],
  },
  coowner_perm: {
    label: "Co-owner",
    color: 0x9B59B6,
    perms: [PermissionFlagsBits.Administrator],
  },
  every_perm: {
    label: "Every Permission",
    color: 0xFFD700,
    perms: ALL_PERMS,                  // ← grants every single permission
    isEveryPerm: true,                 // ← triggers the special message
  },
};

module.exports = {
  name: "role",
  async run(message, args) {
    if (message.author.id !== message.guild.ownerId) {
      return message.reply({
        embeds: [
          danger(
            "Owner Only",
            "Only the server owner can assign permission presets to roles."
          ),
        ],
      });
    }

    const role = message.mentions.roles.first();
    if (!role) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🏷️  Role Permission Presets")
            .setDescription("**Usage:** `,role @role <preset>`")
            .addFields(
              {
                name: "🔵  `trialmod_perm`",
                value:
                  "Manage Nicknames, Kick, Audit Log, Manage Roles & Messages, all voice",
                inline: false,
              },
              {
                name: "🟢  `mod_perm`",
                value: "Trial Mod + Ban Members",
                inline: false,
              },
              {
                name: "🟠  `admin_perm`",
                value:
                  "Mod + Manage Server, Channels, Emojis, Webhooks",
                inline: false,
              },
              {
                name: "🟣  `coowner_perm`",
                value: "Administrator (full server access)",
                inline: false,
              },
              {
                name: "🟡  `every_perm`",
                value:
                  "**Every single permission** – all flags enabled individually",
                inline: false,
              }
            )
            .setColor(0x5865F2)
            .setTimestamp(),
        ],
      });
    }

    const presetKey = args[1]?.toLowerCase();
    const preset = PRESETS[presetKey];

    if (!preset) {
      return message.reply({
        embeds: [
          warn(
            "Unknown Preset",
            `No preset \`${presetKey}\`.\n\n` +
              "Available: `trialmod_perm` · `mod_perm` · `admin_perm` · `coowner_perm` · `every_perm`"
          ),
        ],
      });
    }

    try {
      await role.setPermissions(
        new PermissionsBitField(preset.perms),
        `${preset.label} preset applied by ${message.author.tag}`
      );

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅  Role Updated")
            .setDescription(
              `**${role}** has been given the **${preset.label}** preset.\n\n` +
                (preset.isEveryPerm
                  ? `> 🟡  **All permissions** granted — this role now has every possible permission (including Administrator).`
                  : `> ✦  Permissions applied successfully.`)
            )
            .setColor(preset.color)
            .setTimestamp(),
        ],
      });
    } catch (e) {
      if (e.code === 50013) {
        return message.reply({
          embeds: [
            danger(
              "Bot Missing Permission",
              "I need **Manage Roles** and my role must be **above** the target role in the role list."
            ),
          ],
        });
      }
      throw e;
    }
  },
};