// src/commands/prefix/antinuke.js
const {
  getConfig, updateModule, toggleModule, toggleAllModules,
  addWhitelist, removeWhitelist, setConfig, diagnose, unlockGuild, isLockedDown,
} = require('../../services/antiNuke');
const {
  EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType,
} = require('discord.js');
const { danger, warn, info, success } = require('../../util/embed');
const { colors } = require('../../config');

const MODULES = [
  'channelCreate', 'channelDelete', 'roleCreate', 'roleDelete', 'webhookCreate', 'botAdd',
  'memberKick', 'memberBan', 'messageSpam', 'mentionSpam', 'permissionEscalation',
  'emojiDelete', 'prune', 'overwriteAbuse', 'guildUpdate',
];

const MODULE_LABELS = {
  channelCreate: 'Mass channel creation', channelDelete: 'Mass channel deletion',
  roleCreate: 'Mass role creation', roleDelete: 'Mass role deletion',
  webhookCreate: 'Webhook spam', botAdd: 'Dangerous / mass bot adds',
  memberKick: 'Mass member kicks', memberBan: 'Mass member bans',
  messageSpam: 'Message spam', mentionSpam: 'Mention spam',
  permissionEscalation: 'Permission escalation', emojiDelete: 'Mass emoji deletion',
  prune: 'Member pruning', overwriteAbuse: 'Channel lockdown abuse',
  guildUpdate: 'Server identity spam',
};

// Always-on, non-toggleable — shown for transparency, not configurable like the modules above.
const ALWAYS_ON = [
  'Bot self-protection (role stripped or deleted)',
  'Ownership-transfer alerting',
];

// ────────────────────────────── Embeds & components ──────────────────────────────

function buildConfigEmbed(guild, cfg) {
  const embed = new EmbedBuilder()
    .setTitle('🛡️ Anti-Nuke Configuration')
    .setColor(colors.primary)
    .setDescription(
      `**Status:** ${cfg.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
      `**Lockdown:** ${isLockedDown(guild.id) ? '🔒 Active — run `,antinuke unlock` to lift it' : 'Not active'}`
    )
    .addFields(
      { name: 'Staff Channel', value: cfg.staffChannelId ? `<#${cfg.staffChannelId}>` : 'Not set', inline: true },
      { name: 'Whitelisted Users', value: cfg.whitelist.users.length ? cfg.whitelist.users.map((u) => `<@${u}>`).join(', ') : 'None', inline: false },
      { name: 'Whitelisted Roles', value: cfg.whitelist.roles.length ? cfg.whitelist.roles.map((r) => `<@&${r}>`).join(', ') : 'None', inline: false },
    );

  const modulesList = MODULES.map((name) => {
    const mod = cfg.modules[name];
    if (!mod) return null;
    return `${mod.enabled ? '✅' : '❌'} **${MODULE_LABELS[name] ?? name}** — ${mod.threshold} in ${mod.timeframe}ms → \`${mod.action}\``;
  }).filter(Boolean).join('\n');
  embed.addFields({ name: `Configurable Protections (${MODULES.length})`, value: modulesList.slice(0, 1024) || 'None' });
  embed.addFields({ name: 'Always Active', value: ALWAYS_ON.map((x) => `🔒 ${x}`).join('\n') });
  embed.setFooter({ text: 'New here? Try the Setup Wizard below.' });
  return embed;
}

function buildConfigButtons(enabled) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('an_toggle').setLabel(enabled ? 'Disable' : 'Enable').setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('an_setup_open').setLabel('🧙 Setup Wizard').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('an_check').setLabel('🩺 Run Check').setStyle(ButtonStyle.Secondary),
  )];
}

function buildSetupIntroEmbed(guild) {
  return new EmbedBuilder()
    .setTitle('🛡️ Anti-Nuke Setup')
    .setColor(colors.primary)
    .setDescription(
      `Let's get **${guild.name}** protected — takes under a minute.\n\n` +
      `Quick Setup will:\n` +
      `• Turn on every protection with sensible defaults\n` +
      `• Ask which channel should get alerts (optional)\n` +
      `• Ask which trusted roles should be exempt (optional)\n\n` +
      `You can fine-tune anything afterward with \`,antinuke module\`.`
    );
}

function buildSetupIntroComponents() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('an_setup_start').setLabel('🚀 Start Quick Setup').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('an_setup_info').setLabel('📖 What does this protect?').setStyle(ButtonStyle.Secondary),
  )];
}

function buildProtectionsInfoEmbed() {
  const lines = MODULES.map((name) => `• **${MODULE_LABELS[name]}**`).join('\n');
  return new EmbedBuilder()
    .setTitle('📖 What Anti-Nuke Protects Against')
    .setColor(colors.primary)
    .setDescription(`${lines}\n\n**Always on, regardless of settings:**\n${ALWAYS_ON.map((x) => `• ${x}`).join('\n')}\n\n_Honest limit: if the real owner's account itself is compromised, no bot can fully stop that — only alert on it._`);
}

function buildBackButton() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('an_setup_back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
  )];
}

function buildSetupChannelStepEmbed() {
  return new EmbedBuilder()
    .setTitle('✅ Step 1/2 — Staff Alert Channel')
    .setColor(colors.success)
    .setDescription('Defaults are on. Pick a channel for anti-nuke alerts, or skip — the server owner always gets DM alerts either way.');
}

function buildSetupChannelStepComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('an_setup_channel_select').setPlaceholder('Select a staff alert channel').addChannelTypes(ChannelType.GuildText),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('an_setup_skip_channel').setLabel('Skip').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildSetupRoleStepEmbed() {
  return new EmbedBuilder()
    .setTitle('Step 2/2 — Whitelist Trusted Roles')
    .setColor(colors.success)
    .setDescription('Pick roles that should never be auto-actioned (co-owners, senior staff), or skip — you can always add more later with `,antinuke whitelist`.');
}

function buildSetupRoleStepComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('an_setup_role_select').setPlaceholder('Select trusted roles').setMaxValues(5),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('an_setup_finish').setLabel('Finish').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildSetupSummaryEmbed(guild, cfg) {
  return new EmbedBuilder()
    .setTitle('✅ Anti-Nuke Is Now Protecting This Server')
    .setColor(colors.success)
    .setDescription(
      `**${MODULES.length}** protections active, plus always-on bot self-protection and ownership-transfer alerts.\n\n` +
      `**Staff channel:** ${cfg.staffChannelId ? `<#${cfg.staffChannelId}>` : 'Not set — DMs only'}\n` +
      `**Whitelisted roles:** ${cfg.whitelist.roles.length ? cfg.whitelist.roles.map((r) => `<@&${r}>`).join(', ') : 'None'}\n\n` +
      `⚠️ **One more thing that actually matters:** make sure my role is positioned near the *top* of your role list — I can't fully act against anyone whose role outranks mine. Run \`,antinuke check\` any time to verify.`
    );
}

function buildLockdownConfirmEmbed() {
  return new EmbedBuilder()
    .setTitle('🔒 Emergency Lockdown')
    .setColor(colors.danger)
    .setDescription(
      "This denies **@everyone** Send Messages / Connect / Add Reactions across every channel I can manage — people can still read, but not post or join voice. It works even if I can't ban the specific attacker, since it only needs my own channel permissions.\n\n" +
      "It does **not** stop someone who already has Administrator/Manage Channels from continuing to delete things — for that, remove their role or kick them directly in Server Settings.\n\n" +
      "Run `,antinuke unlock` any time to restore everything exactly as it was."
    );
}

function buildLockdownConfirmComponents() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('an_lockdown_confirm').setLabel('🔒 Confirm Lockdown').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('an_lockdown_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  )];
}

// ────────────────────────────────── Command ──────────────────────────────────

module.exports = {
  name: 'antinuke',
  aliases: ['tantinuke'],
  MODULES,
  MODULE_LABELS,
  buildConfigEmbed, buildConfigButtons,
  buildSetupIntroEmbed, buildSetupIntroComponents,
  buildProtectionsInfoEmbed, buildBackButton,
  buildSetupChannelStepEmbed, buildSetupChannelStepComponents,
  buildSetupRoleStepEmbed, buildSetupRoleStepComponents,
  buildSetupSummaryEmbed,
  buildLockdownConfirmEmbed, buildLockdownConfirmComponents,

  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ embeds: [danger('Missing Permission', 'You need Administrator to configure anti-nuke.')] });
    }

    const sub = args[0]?.toLowerCase();
    const guildId = message.guild.id;

    if (!sub || sub === 'config' || sub === 'status') {
      const cfg = getConfig(guildId);
      return message.reply({ embeds: [buildConfigEmbed(message.guild, cfg)], components: buildConfigButtons(cfg.enabled) });
    }

    if (sub === 'setup') {
      return message.reply({ embeds: [buildSetupIntroEmbed(message.guild)], components: buildSetupIntroComponents() });
    }

    if (sub === 'check') {
      const report = diagnose(message.guild);
      const embed = new EmbedBuilder()
        .setTitle(report.healthy ? '✅ Anti-Nuke Health Check: All Good' : '⚠️ Anti-Nuke Health Check: Issues Found')
        .setColor(report.healthy ? colors.success : colors.warn)
        .addFields(
          { name: 'Permissions', value: report.permChecks.map((p) => `${p.ok ? '✅' : '❌'} ${p.label}`).join('\n') },
          { name: 'Role Position', value: report.rolePositionOk ? `✅ **${report.myTopRoleName}** outranks every other assignable role.` : `❌ **${report.myTopRoleName}** is below **${report.highestAssignableRoleName}** — anyone with that role can't be fully banned/kicked. Run \`,giveownership\` or drag my role up manually.` },
        );
      if (report.issues.length) embed.addFields({ name: 'Fix these', value: report.issues.map((i) => `• ${i}`).join('\n') });
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'lockdown') {
      return message.reply({ embeds: [buildLockdownConfirmEmbed()], components: buildLockdownConfirmComponents() });
    }

    if (sub === 'unlock') {
      const result = await unlockGuild(message.guild);
      if (!result.wasActive) return message.reply({ embeds: [info('Not Locked Down', "The server isn't currently in lockdown.")] });
      return message.reply({ embeds: [success('Lockdown Lifted', `Restored ${result.restored} channel${result.restored === 1 ? '' : 's'}.${result.failed ? ` (${result.failed} failed — check my permissions there.)` : ''}`)] });
    }

    if (sub === 'enable' || sub === 'disable') {
      toggleAllModules(guildId, sub === 'enable');
      return message.reply(sub === 'enable' ? '✅ Anti-nuke enabled.' : '❌ Anti-nuke disabled.');
    }

    if (sub === 'module') {
      const action = args[1]?.toLowerCase();
      const moduleName = args[2];
      if (!MODULES.includes(moduleName)) {
        return message.reply({ embeds: [warn('Invalid Module', `Available: ${MODULES.join(', ')}`)] });
      }
      if (action === 'enable' || action === 'disable') {
        toggleModule(guildId, moduleName, action === 'enable');
        return message.reply('👌');
      }
      if (action === 'set') {
        const threshold = parseInt(args[3]);
        const timeframe = parseInt(args[4]);
        const actionType = args[5];
        if (!threshold || !timeframe || !['ban', 'kick', 'timeout', 'strip_roles'].includes(actionType)) {
          return message.reply({ embeds: [warn('Invalid Params', 'Usage: `,antinuke module set <module> <threshold> <timeframe> <action>`\nAction: ban, kick, timeout, strip_roles')] });
        }
        updateModule(guildId, moduleName, { threshold, timeframe, action: actionType });
        return message.reply('👌');
      }
      return message.reply({ embeds: [warn('Usage', '`,antinuke module <enable|disable|set> <module> [params]`')] });
    }

    if (sub === 'whitelist') {
      const action = args[1]?.toLowerCase();
      const mentionedUser = message.mentions.users.first();
      const mentionedRole = message.mentions.roles.first();
      const target = mentionedUser || mentionedRole;
      if (!target) return message.reply({ embeds: [warn('Missing Target', 'Mention a user or role to whitelist.')] });
      const type = mentionedUser ? 'user' : 'role';
      if (action === 'add') { addWhitelist(guildId, type, target.id); return message.reply('👌'); }
      if (action === 'remove') { removeWhitelist(guildId, type, target.id); return message.reply('👌'); }
      return message.reply({ embeds: [warn('Usage', '`,antinuke whitelist <add|remove> @user` or `,antinuke whitelist <add|remove> @role`')] });
    }

    if (sub === 'staffchannel') {
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply({ embeds: [warn('Missing Channel', 'Mention a channel for staff alerts.')] });
      const cfg = getConfig(guildId);
      cfg.staffChannelId = channel.id;
      setConfig(guildId, cfg);
      return message.reply('👌');
    }

    if (sub === 'owner') {
      return message.reply({ embeds: [info('Owner Notifications', 'The server owner always receives DM alerts, regardless of this setting.')] });
    }

    return message.reply({ embeds: [warn('Unknown Command', 'Available: `setup`, `check`, `lockdown`, `unlock`, `enable`, `disable`, `config`, `module`, `whitelist`, `staffchannel`')] });
  },
};
