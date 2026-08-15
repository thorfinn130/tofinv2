// src/commands/prefix/tantinuke.js
const {
  getConfig, updateModule, toggleModule, toggleAllModules,
  addWhitelist, removeWhitelist, setConfig,
} = require('../../services/antiNuke');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { success, danger, warn, info } = require('../../util/embed');

const MODULES = ['channelCreate', 'channelDelete', 'roleCreate', 'roleDelete', 'webhookCreate', 'botAdd', 'memberKick', 'memberBan', 'messageSpam', 'mentionSpam', 'permissionEscalation', 'emojiDelete', 'prune'];

module.exports = {
  name: 'tantinuke',
  aliases: ['antinuke'],
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ embeds: [danger('Missing Permission', 'You need Administrator to configure anti-nuke.')] });
    }

    const sub = args[0]?.toLowerCase();
    const guildId = message.guild.id;

    // ── show config ──
    if (!sub || sub === 'config' || sub === 'status') {
      const cfg = getConfig(guildId);
      const embed = new EmbedBuilder()
        .setTitle('🛡️ Anti-Nuke Configuration')
        .setColor(0x5865F2)
        .setDescription(`**Anti-Nuke is currently ${cfg.enabled ? '✅ ENABLED' : '❌ DISABLED'}`)
        .addFields(
          { name: 'Staff Channel', value: cfg.staffChannelId ? `<#${cfg.staffChannelId}>` : 'Not set', inline: true },
          { name: 'Whitelisted Users', value: cfg.whitelist.users.map(u => `<@${u}>`).join(', ') || 'None', inline: false },
          { name: 'Whitelisted Roles', value: cfg.whitelist.roles.map(r => `<@&${r}>`).join(', ') || 'None', inline: false },
        );

      const modulesList = Object.entries(cfg.modules).map(([name, mod]) =>
        `**${name}** — ${mod.enabled ? '✅' : '❌'} | ${mod.threshold} in ${mod.timeframe}ms → ${mod.action}`
      ).join('\n');
      embed.addFields({ name: 'Modules', value: modulesList.slice(0, 1024) || 'None' });
      return message.reply({ embeds: [embed] });
    }

    // ── enable / disable ──
    if (sub === 'enable' || sub === 'disable') {
      const enabled = sub === 'enable';
      toggleAllModules(guildId, enabled);
      return message.reply({ embeds: [success(`Anti-Nuke ${enabled ? 'Enabled' : 'Disabled'}`, `All modules are now ${enabled ? 'active' : 'inactive'}.`)] });
    }

    // ── module enable/disable ──
    if (sub === 'module') {
      const action = args[1]?.toLowerCase();
      const moduleName = args[2];
      if (!MODULES.includes(moduleName)) {
        return message.reply({ embeds: [warn('Invalid Module', `Available: ${MODULES.join(', ')}`)] });
      }
      if (action === 'enable' || action === 'disable') {
        const enabled = action === 'enable';
        toggleModule(guildId, moduleName, enabled);
        return message.reply({ embeds: [success(`${moduleName} ${enabled ? 'enabled' : 'disabled'}`, `Module is now ${enabled ? 'active' : 'inactive'}.`)] });
      }
      if (action === 'set') {
        const threshold = parseInt(args[3]);
        const timeframe = parseInt(args[4]);
        const actionType = args[5];
        if (!threshold || !timeframe || !['ban','kick','timeout','strip_roles'].includes(actionType)) {
          return message.reply({ embeds: [warn('Invalid Params', 'Usage: `,tantinuke module set <module> <threshold> <timeframe> <action>`\nAction: ban, kick, timeout, strip_roles')] });
        }
        const updated = updateModule(guildId, moduleName, { threshold, timeframe, action: actionType });
        return message.reply({ embeds: [success('Module Updated', `**${moduleName}** → threshold: ${updated.threshold}, timeframe: ${updated.timeframe}ms, action: ${updated.action}`)] });
      }
      return message.reply({ embeds: [warn('Usage', '`,tantinuke module <enable|disable|set> <module> [params]`')] });
    }

    // ── whitelist ──
    if (sub === 'whitelist') {
      const action = args[1]?.toLowerCase();
      const target = message.mentions.users.first() || message.mentions.roles.first();
      if (!target) return message.reply({ embeds: [warn('Missing Target', 'Mention a user or role to whitelist.')] });
      const type = target.id === message.mentions.users.first()?.id ? 'user' : 'role';
      const id = target.id;
      if (action === 'add') {
        addWhitelist(guildId, type, id);
        return message.reply({ embeds: [success('Whitelisted', `${target} added to whitelist.`)] });
      } else if (action === 'remove') {
        removeWhitelist(guildId, type, id);
        return message.reply({ embeds: [success('Removed', `${target} removed from whitelist.`)] });
      } else {
        return message.reply({ embeds: [warn('Usage', '`,tantinuke whitelist <add|remove> @user` or `,tantinuke whitelist <add|remove> @role`')] });
      }
    }

    // ── staff channel ──
    if (sub === 'staffchannel') {
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply({ embeds: [warn('Missing Channel', 'Mention a channel for staff alerts.')] });
      const cfg = getConfig(guildId);
      cfg.staffChannelId = channel.id;
      setConfig(guildId, cfg);
      return message.reply({ embeds: [success('Staff Channel Set', `Alerts will be sent to ${channel}.`)] });
    }

    // ── owner (optional) ──
    if (sub === 'owner') {
      // We auto-detect owner for DMs, no config needed.
      return message.reply({ embeds: [info('Owner Notifications', 'The server owner will always receive DM alerts.')] });
    }

    return message.reply({ embeds: [warn('Unknown Command', 'Available: `enable`, `disable`, `config`, `module`, `whitelist`, `staffchannel`')] });
  },
};