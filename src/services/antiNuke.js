// src/services/antiNuke.js
const { EmbedBuilder, AuditLogEvent, PermissionsBitField } = require('discord.js');
const { read, write } = require('../storage');

const STORE = 'antinuke';
const DEFAULT_CONFIG = {
  enabled: false,
  modules: {
    channelCreate: { threshold: 5, timeframe: 5000, action: 'ban', enabled: true },
    channelDelete: { threshold: 5, timeframe: 5000, action: 'ban', enabled: true },
    roleCreate: { threshold: 5, timeframe: 5000, action: 'ban', enabled: true },
    roleDelete: { threshold: 5, timeframe: 5000, action: 'ban', enabled: true },
    webhookCreate: { threshold: 3, timeframe: 5000, action: 'ban', enabled: true },
    botAdd: { threshold: 2, timeframe: 10000, action: 'kick', enabled: true },
    memberKick: { threshold: 5, timeframe: 5000, action: 'ban', enabled: true },
    memberBan: { threshold: 5, timeframe: 5000, action: 'ban', enabled: true },
    messageSpam: { threshold: 15, timeframe: 3000, action: 'timeout', enabled: true },
    mentionSpam: { threshold: 10, timeframe: 3000, action: 'timeout', enabled: true },
    permissionEscalation: { threshold: 2, timeframe: 10000, action: 'strip_roles', enabled: true },
    emojiDelete: { threshold: 5, timeframe: 5000, action: 'ban', enabled: true },
    prune: { threshold: 1, timeframe: 5000, action: 'ban', enabled: true },
  },
  whitelist: { users: [], roles: [] },
  staffChannelId: null,
  ownerId: null,
};

// Permissions that are especially dangerous to hand out — used by permissionEscalation
const DANGEROUS_PERMS = [
  'Administrator', 'BanMembers', 'KickMembers', 'ManageGuild',
  'ManageRoles', 'ManageChannels', 'ManageWebhooks', 'MentionEveryone',
];

function _read() { return read(STORE, {}); }
function _write(data) { write(STORE, data); }

function getConfig(guildId) {
  const all = _read();
  if (!all[guildId]) {
    all[guildId] = { ...DEFAULT_CONFIG, modules: { ...DEFAULT_CONFIG.modules }, enabled: false };
    _write(all);
  } else {
    // Backfill any modules added in later versions so upgrades don't silently miss protection
    let changed = false;
    for (const [name, def] of Object.entries(DEFAULT_CONFIG.modules)) {
      if (!all[guildId].modules[name]) {
        all[guildId].modules[name] = { ...def };
        changed = true;
      }
    }
    if (changed) _write(all);
  }
  return all[guildId];
}

function setConfig(guildId, config) {
  const all = _read();
  all[guildId] = config;
  _write(all);
}

function updateModule(guildId, moduleName, changes) {
  const cfg = getConfig(guildId);
  if (!cfg.modules[moduleName]) return null;
  cfg.modules[moduleName] = { ...cfg.modules[moduleName], ...changes };
  setConfig(guildId, cfg);
  return cfg.modules[moduleName];
}

function toggleModule(guildId, moduleName, enabled) {
  const cfg = getConfig(guildId);
  if (!cfg.modules[moduleName]) return null;
  cfg.modules[moduleName].enabled = enabled;
  setConfig(guildId, cfg);
  return cfg.modules[moduleName];
}

function toggleAllModules(guildId, enabled) {
  const cfg = getConfig(guildId);
  cfg.enabled = enabled;
  setConfig(guildId, cfg);
}

function addWhitelist(guildId, type, id) {
  const cfg = getConfig(guildId);
  if (type === 'user' && !cfg.whitelist.users.includes(id)) cfg.whitelist.users.push(id);
  if (type === 'role' && !cfg.whitelist.roles.includes(id)) cfg.whitelist.roles.push(id);
  setConfig(guildId, cfg);
}

function removeWhitelist(guildId, type, id) {
  const cfg = getConfig(guildId);
  if (type === 'user') cfg.whitelist.users = cfg.whitelist.users.filter(u => u !== id);
  if (type === 'role') cfg.whitelist.roles = cfg.whitelist.roles.filter(r => r !== id);
  setConfig(guildId, cfg);
}

function isWhitelisted(guildId, userId, member) {
  const cfg = getConfig(guildId);
  if (cfg.whitelist.users.includes(userId)) return true;
  if (member) {
    const roles = member.roles.cache.map(r => r.id);
    if (roles.some(r => cfg.whitelist.roles.includes(r))) return true;
  }
  return false;
}

// ── Event tracking ──
const eventBuckets = new Map();

function trackEvent(guildId, eventType, userId, config) {
  const key = `${guildId}:${eventType}:${userId}`;
  const now = Date.now();
  const bucket = eventBuckets.get(key) || [];
  const filtered = bucket.filter(t => now - t < config.timeframe);
  filtered.push(now);
  eventBuckets.set(key, filtered);
  return filtered.length >= config.threshold;
}

function clearBucket(guildId, eventType, userId) {
  const key = `${guildId}:${eventType}:${userId}`;
  eventBuckets.delete(key);
}

// ── Message spam detection ──
const messageSpamBuckets = new Map();

function checkMessageSpam(guildId, userId, config) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const bucket = messageSpamBuckets.get(key) || [];
  const filtered = bucket.filter(t => now - t < config.timeframe);
  filtered.push(now);
  messageSpamBuckets.set(key, filtered);
  return filtered.length >= config.threshold;
}

// ── Mention spam detection (tracks mentions-per-window, not messages-per-window) ──
const mentionSpamBuckets = new Map();

function checkMentionSpam(guildId, userId, mentionCount, config) {
  if (!mentionCount) return false;
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const bucket = mentionSpamBuckets.get(key) || [];
  const filtered = bucket.filter(t => now - t < config.timeframe);
  for (let i = 0; i < mentionCount; i++) filtered.push(now);
  mentionSpamBuckets.set(key, filtered);
  return filtered.length >= config.threshold;
}

// ── Permission escalation check ──
// Returns true if `newPerms` grants any dangerous permission that `oldPerms` didn't have.
function grantedDangerousPerm(oldPerms, newPerms) {
  return DANGEROUS_PERMS.some((p) => !oldPerms.has(p) && newPerms.has(p));
}

// ── Action executor ──
async function executeAction(guild, userId, action, reason) {
  if (!userId) return false;
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;
    if (isWhitelisted(guild.id, userId, member)) return false;
    const me = guild.members.me;
    if (!me.permissions.has(PermissionsBitField.Flags.BanMembers)) return false;
    if (action === 'ban') {
      await member.ban({ reason: `Anti-nuke: ${reason}` });
      return 'banned';
    } else if (action === 'kick') {
      await member.kick(`Anti-nuke: ${reason}`);
      return 'kicked';
    } else if (action === 'timeout') {
      await member.timeout(5 * 60_000, `Anti-nuke: ${reason}`);
      return 'timed out';
    } else if (action === 'strip_roles') {
      await member.roles.set([], `Anti-nuke: ${reason}`);
      return 'stripped roles';
    }
  } catch (e) {
    console.error('[AntiNuke] Action failed:', e);
  }
  return false;
}

// ── Notification ──
async function notify(guild, staffChannelId, embed) {
  if (staffChannelId) {
    const channel = guild.channels.cache.get(staffChannelId);
    if (channel) {
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  }
  try {
    const owner = await guild.fetchOwner();
    if (owner) {
      await owner.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (e) {}
}

// ── Main handler ──
async function handleEvent(guild, eventType, userId, additional = {}) {
  if (!guild) return;
  const config = getConfig(guild.id);
  if (!config.enabled) return;
  const module = config.modules[eventType];
  if (!module || !module.enabled) return;
  if (!userId) return;

  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  if (isWhitelisted(guild.id, userId, member)) return;

  const triggered = trackEvent(guild.id, eventType, userId, module);
  if (!triggered) return;

  const actionResult = await executeAction(guild, userId, module.action, `${eventType} nuke detected`);
  if (!actionResult) return;

  clearBucket(guild.id, eventType, userId);

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('🚨 Anti-Nuke Triggered')
    .setDescription(`**Event:** ${eventType}\n**User:** <@${userId}> (${userId})\n**Action Taken:** ${actionResult}\n**Threshold:** ${module.threshold} in ${module.timeframe}ms`)
    .setTimestamp()
    .setFooter({ text: 'Tofin Anti-Nuke' });

  if (additional) {
    Object.entries(additional).forEach(([k, v]) => {
      embed.addFields({ name: k, value: v, inline: true });
    });
  }

  await notify(guild, config.staffChannelId, embed);
}

module.exports = {
  getConfig,
  setConfig,
  updateModule,
  toggleModule,
  toggleAllModules,
  addWhitelist,
  removeWhitelist,
  isWhitelisted,
  handleEvent,
  trackEvent,
  executeAction,
  checkMessageSpam,
  checkMentionSpam,
  grantedDangerousPerm,
  DANGEROUS_PERMS,
};