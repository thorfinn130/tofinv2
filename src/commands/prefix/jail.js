const { PermissionFlagsBits } = require("discord.js");
const { getConfig, setConfig, getActiveJail, setActiveJail, clearActiveJail } = require("../../services/jail");
const { danger, warn, info, rich } = require("../../util/embed");
const { parseDuration, formatDuration } = require("../../util/time");
const { colors } = require("../../config");

module.exports = {
  name: "jail",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Administrator)")] });
    }

    const sub = args[0]?.toLowerCase();

    // ,jail channel #channel — set jail channel
    if (sub === "channel") {
      const channel = message.mentions.channels.first();
      if (!channel) {
        return message.reply({ embeds: [warn("Missing Channel", "**Usage:** `,jail channel #channel`")] });
      }
      setConfig(message.guild.id, { jailChannelId: channel.id });
      return message.reply("👌");
    }

    // ,jail role @role — set jailed role
    if (sub === "role") {
      const role = message.mentions.roles.first();
      if (!role) {
        return message.reply({ embeds: [warn("Missing Role", "**Usage:** `,jail role @role`")] });
      }
      if (role.position >= message.guild.members.me.roles.highest.position) {
        return message.reply({ embeds: [danger("Role Too High", "That role is higher than or equal to my own highest role. Move my role above it first.")] });
      }
      setConfig(message.guild.id, { jailRoleId: role.id });
      return message.reply("👌");
    }

    // ,jail config — show current setup
    if (sub === "config") {
      const cfg = getConfig(message.guild.id);
      if (!cfg) {
        return message.reply({ embeds: [info("Not Set Up", "Run `,setup` first to configure the moderation system.")] });
      }
      return message.reply({
        embeds: [rich({
          title: "⚙️  Jail Configuration",
          description: [
            `**Jail Role:** ${cfg.jailRoleId ? `<@&${cfg.jailRoleId}>` : "_not set_"}`,
            `**Jail Channel:** ${cfg.jailChannelId ? `<#${cfg.jailChannelId}>` : "_not set_"}`,
            `**Logs Channel:** ${cfg.logsChannelId ? `<#${cfg.logsChannelId}>` : "_not set_"}`,
            `**Mute Role:** ${cfg.muteRoleId ? `<@&${cfg.muteRoleId}>` : "_not set_"}`,
          ].join("\n"),
          color: colors.primary,
        })],
      });
    }

    // ,jail @user [duration] [reason] — the main action
    const target = message.mentions.members.first();
    if (!target) {
      return message.reply({
        embeds: [warn(
          "Missing User",
          "**Usage:** `,jail @user [duration] [reason]`\n**Example:** `,jail @Spammer 1h spamming`\nLeave duration out for an indefinite jail (until `,unjail`)."
        )],
      });
    }

    const cfg = getConfig(message.guild.id);
    if (!cfg?.jailRoleId || !cfg?.jailChannelId) {
      return message.reply({ embeds: [danger("Not Set Up", "Run `,setup` first to configure the jail system.")] });
    }

    const jailedRole = message.guild.roles.cache.get(cfg.jailRoleId);
    const jailChannel = message.guild.channels.cache.get(cfg.jailChannelId);
    if (!jailedRole || !jailChannel) {
      return message.reply({ embeds: [danger("Misconfigured", "The configured jail role or channel no longer exists. Run `,setup` again or reconfigure with `,jail role` / `,jail channel`.")] });
    }

    if (jailedRole.position >= message.guild.members.me.roles.highest.position) {
      return message.reply({ embeds: [danger("Role Hierarchy Issue", "My role needs to be above the jailed role to assign it. Move my role up in Server Settings → Roles.")] });
    }

    if (!target.moderatable) {
      return message.reply({ embeds: [danger("Can't Jail", "I can't manage that member — they may have a higher role than me, or be the server owner.")] });
    }

    if (getActiveJail(message.guild.id, target.id)) {
      return message.reply({ embeds: [warn("Already Jailed", `**${target.user.tag}** is already jailed.`)] });
    }

    // Parse optional duration + reason from remaining args
    const rest = message.content.split(/\s+/).slice(2); // drop ",jail" and the mention
    let durationMs = null;
    let reasonStart = 0;
    if (rest[0] && parseDuration(rest[0])) {
      durationMs = parseDuration(rest[0]);
      reasonStart = 1;
    }
    const reason = rest.slice(reasonStart).join(" ") || "No reason provided";

    // Snapshot their current roles so we can restore on unjail
    const roleSnapshot = target.roles.cache.filter((r) => r.id !== message.guild.id).map((r) => r.id);

    await target.roles.set([jailedRole.id]).catch(() => {});

    setActiveJail(message.guild.id, target.id, {
      jailedAt: Date.now(),
      expiresAt: durationMs ? Date.now() + durationMs : null,
      reason,
      roleSnapshot,
    });

    await jailChannel.send({ content: `${target} was jailed.\n**Reason:** ${reason}` }).catch(() => {});

    if (cfg.logsChannelId) {
      const logsChannel = message.guild.channels.cache.get(cfg.logsChannelId);
      logsChannel?.send({
        embeds: [rich({
          title: "🔒  Member Jailed",
          description: `**User:** ${target.user.tag} (${target.id})\n**By:** ${message.author.tag}\n**Reason:** ${reason}\n**Duration:** ${durationMs ? formatDuration(durationMs) : "Indefinite"}`,
          color: colors.danger,
        })],
      }).catch(() => {});
    }

    return message.reply("👌");
  },
};
