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
    // Mass permission-overwrite lockdown — an attacker denies @everyone View/Send across
    // channels instead of deleting them. Same blast radius, no delete event to catch it.
    overwriteAbuse: { threshold: 3, timeframe: 8000, action: 'ban', enabled: true },
    // Rapid server name/icon changes — identity-spam griefing.
    guildUpdate: { threshold: 2, timeframe: 10000, action: 'kick', enabled: true },
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

// ── Does this permission set include anything on the dangerous list? ──
// Used for instant response to bots joining with Administrator etc. — one is already
// enough to nuke a server, no need to wait for a second one like the old botAdd check did.
function hasDangerousPerms(permissions) {
  return DANGEROUS_PERMS.some((p) => permissions.has(p));
}

// ── Detects an EXISTING dangerous role being newly handed to a member ──
// (permissionEscalation only catches a role's own permissions being edited — this catches
// someone just assigning an already-dangerous role to a new person instead.)
function dangerousRoleAssigned(oldRoles, newRoles) {
  for (const [id, role] of newRoles) {
    if (oldRoles.has(id)) continue;
    if (hasDangerousPerms(role.permissions)) return role;
  }
  return null;
}

// ── Detects a "soft nuke": @everyone's View/Send access newly denied on a channel ──
// without anything being deleted. Easy to miss if you only watch for delete events.
function overwriteRemovesAccess(oldOverwrites, newOverwrites, everyoneRoleId) {
  const newOw = newOverwrites.get(everyoneRoleId);
  if (!newOw) return false;
  const oldOw = oldOverwrites.get(everyoneRoleId);
  const wasViewDenied = oldOw ? oldOw.deny.has('ViewChannel') : false;
  const wasSendDenied = oldOw ? oldOw.deny.has('SendMessages') : false;
  return (newOw.deny.has('ViewChannel') && !wasViewDenied) || (newOw.deny.has('SendMessages') && !wasSendDenied);
}

// ── Best-effort role strip when we can't fully ban/kick/timeout someone ──
// (their highest role outranks ours, so Discord rejects those actions outright).
// We can still remove any of THEIR individual roles that we personally outrank —
// role removal only needs us to outrank that one role, not their whole stack.
async function stripWhatWeCan(guild, member, reason) {
  const me = guild.members.me;
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) return false;

  const myTop = me.roles.highest;
  const removable = member.roles.cache.filter(
    (r) => r.id !== guild.id && !r.managed && r.comparePositionTo(myTop) < 0
  );
  if (!removable.size) return false;

  await member.roles.remove(removable, `Anti-nuke: ${reason}`).catch(() => { removable.clear(); });
  return removable.size > 0;
}

// ── Action executor ──
// Checks bannable/kickable/moderatable BEFORE attempting anything — these are free,
// cached, local checks. Skipping them was the actual cause of the lag during a real
// attack: every blocked action was still a full failing REST round-trip, and those
// pile up fast against Discord's rate limit when a burst of events fires at once.
async function executeAction(guild, userId, action, reason) {
  if (!userId) return false;
  if (userId === guild.ownerId) return false; // Discord blocks acting on the owner anyway
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;
    if (isWhitelisted(guild.id, userId, member)) return false;

    if (action === 'ban') {
      if (member.bannable) {
        await member.ban({ reason: `Anti-nuke: ${reason}` });
        return 'banned';
      }
      return (await stripWhatWeCan(guild, member, reason)) ? 'limited' : false;
    }
    if (action === 'kick') {
      if (member.kickable) {
        await member.kick(`Anti-nuke: ${reason}`);
        return 'kicked';
      }
      return (await stripWhatWeCan(guild, member, reason)) ? 'limited' : false;
    }
    if (action === 'timeout') {
      if (member.moderatable) {
        await member.timeout(5 * 60_000, `Anti-nuke: ${reason}`);
        return 'timed out';
      }
      return (await stripWhatWeCan(guild, member, reason)) ? 'limited' : false;
    }
    if (action === 'strip_roles') {
      return (await stripWhatWeCan(guild, member, reason)) ? 'stripped roles' : false;
    }
  } catch (e) {
    console.error('[AntiNuke] Action failed:', e);
  }
  return false;
}

// ── Blocked-alert cooldown ──
// If we genuinely can't act (role too low, missing permission), every further event in
// the same burst would otherwise fire its own alert message — that's still a REST call
// per message, and a fast burst can spam a dozen near-identical warnings in a few seconds.
// One clear alert, then a quiet period before repeating it, is enough to inform without adding load.
const blockedAlertCooldowns = new Map();
function shouldAlertBlocked(guildId, eventType, userId) {
  const key = `${guildId}:${eventType}:${userId}`;
  const now = Date.now();
  const last = blockedAlertCooldowns.get(key) || 0;
  if (now - last < 15000) return false;
  blockedAlertCooldowns.set(key, now);
  return true;
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
  if (userId === guild.ownerId) return; // the real owner's own actions never trigger anti-nuke

  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  if (isWhitelisted(guild.id, userId, member)) return;

  const triggered = trackEvent(guild.id, eventType, userId, module);
  if (!triggered) return;

  const actionResult = await executeAction(guild, userId, module.action, `${eventType} nuke detected`);
  const succeeded = ['banned', 'kicked', 'timed out', 'stripped roles'].includes(actionResult);
  const limited = actionResult === 'limited';
  const blocked = !actionResult;

  if (succeeded) {
    clearBucket(guild.id, eventType, userId);
  } else if (!shouldAlertBlocked(guild.id, eventType, userId)) {
    return; // already warned about this exact block recently — stay quiet instead of spamming
  }

  const embed = new EmbedBuilder()
    .setColor(blocked ? 0x992D22 : limited ? 0xE67E22 : 0xED4245)
    .setTitle(blocked ? '🆘 Attack Detected — Action Blocked' : limited ? '⚠️ Anti-Nuke: Partial Response Only' : '🚨 Anti-Nuke Triggered')
    .setDescription(
      `**Event:** ${eventType}\n**User:** <@${userId}> (${userId})\n` +
      `**Action Taken:** ${blocked ? "None — my role is below theirs, or I'm missing a permission" : limited ? "Stripped what roles I could reach, but couldn't fully ban/kick them" : actionResult}\n` +
      `**Threshold:** ${module.threshold} in ${module.timeframe}ms` +
      (blocked || limited ? `\n\n⚠️ **I need my role moved above theirs (or the right permission granted) to fully stop this.** Run \`,antinuke check\` for a full diagnostic.` : '')
    )
    .setTimestamp()
    .setFooter({ text: 'Tofin Anti-Nuke' });

  if (additional) {
    Object.entries(additional).forEach(([k, v]) => {
      embed.addFields({ name: k, value: v, inline: true });
    });
  }

  await notify(guild, config.staffChannelId, embed);
}

// ── Setup diagnostics ──
// Checks the things that actually determine whether anti-nuke can DO anything when it
// matters, rather than just whether it's turned on. Powers `,antinuke check`.
function diagnose(guild) {
  const config = getConfig(guild.id);
  const me = guild.members.me;
  const everyone = guild.roles.everyone;

  const neededPerms = [
    ['BanMembers', 'Ban Members'],
    ['KickMembers', 'Kick Members'],
    ['ManageRoles', 'Manage Roles'],
    ['ManageChannels', 'Manage Channels'],
    ['ModerateMembers', 'Timeout Members'],
    ['ViewAuditLog', 'View Audit Log'],
  ];
  const permChecks = neededPerms.map(([flag, label]) => ({
    label,
    ok: me.permissions.has(PermissionsBitField.Flags[flag]),
  }));

  // Highest role in the server that ISN'T managed (i.e. a real, assignable role) and isn't ours
  const highestAssignable = guild.roles.cache
    .filter((r) => !r.managed && r.id !== everyone.id && r.id !== me.roles.highest.id)
    .sort((a, b) => b.position - a.position)
    .first();

  const rolePositionOk = !highestAssignable || me.roles.highest.comparePositionTo(highestAssignable) > 0;

  const issues = permChecks.filter((p) => !p.ok).map((p) => `Missing **${p.label}**`);
  if (!rolePositionOk) {
    issues.push(`My highest role (**${me.roles.highest.name}**) is below **${highestAssignable.name}** — anyone with that role (or higher) can't be fully banned/kicked/stripped`);
  }
  if (!config.enabled) issues.push('Anti-nuke is currently **disabled** (`,antinuke enable`)');
  if (!config.staffChannelId) issues.push('No staff alert channel set — you\'ll only get DMs (`,antinuke staffchannel #channel`)');

  return {
    enabled: config.enabled,
    permChecks,
    rolePositionOk,
    highestAssignableRoleName: highestAssignable?.name ?? null,
    myTopRoleName: me.roles.highest.name,
    staffChannelId: config.staffChannelId,
    issues,
    healthy: issues.length === 0,
  };
}

// ── Emergency lockdown ──
// Denies @everyone Send/Connect/AddReactions across every channel we're actually allowed
// to edit overwrites on — without touching ViewChannel, so people can still read pinned
// updates. This works independently of role hierarchy against any specific attacker (it
// only needs OUR OWN Manage Roles permission on the channel), so it still helps even in
// the exact situation where we can't ban/kick someone directly.
function overwriteToEditOptions(allowStr, denyStr) {
  const allow = new PermissionsBitField(BigInt(allowStr));
  const deny = new PermissionsBitField(BigInt(denyStr));
  const options = {};
  for (const flag of Object.keys(PermissionsBitField.Flags)) {
    if (allow.has(flag)) options[flag] = true;
    else if (deny.has(flag)) options[flag] = false;
    else options[flag] = null;
  }
  return options;
}

async function lockdownGuild(guild) {
  const { setGuild } = require('../storage');
  const me = guild.members.me;
  const everyoneId = guild.id;
  const snapshot = {};
  let locked = 0, failed = 0;

  const channels = guild.channels.cache.filter((c) => c.permissionOverwrites);
  for (const [, channel] of channels) {
    const perms = channel.permissionsFor(me);
    if (!perms?.has(PermissionsBitField.Flags.ManageRoles)) { failed++; continue; }
    try {
      const existing = channel.permissionOverwrites.cache.get(everyoneId);
      snapshot[channel.id] = existing
        ? { allow: existing.allow.bitfield.toString(), deny: existing.deny.bitfield.toString() }
        : null;
      await channel.permissionOverwrites.edit(everyoneId, {
        SendMessages: false,
        Connect: false,
        AddReactions: false,
      }, { reason: 'Anti-nuke: emergency lockdown' });
      locked++;
    } catch (e) {
      failed++;
    }
  }

  setGuild('antinuke_lockdown', guild.id, { active: true, snapshot, at: Date.now() });
  return { locked, failed };
}

async function unlockGuild(guild) {
  const { getGuild, setGuild } = require('../storage');
  const state = getGuild('antinuke_lockdown', guild.id, null);
  if (!state || !state.active) return { restored: 0, failed: 0, wasActive: false };

  const everyoneId = guild.id;
  let restored = 0, failed = 0;

  for (const [channelId, prev] of Object.entries(state.snapshot)) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) continue;
    try {
      if (prev === null) {
        await channel.permissionOverwrites.delete(everyoneId, 'Anti-nuke: lockdown lifted');
      } else {
        await channel.permissionOverwrites.edit(
          everyoneId,
          overwriteToEditOptions(prev.allow, prev.deny),
          { reason: 'Anti-nuke: lockdown lifted' },
        );
      }
      restored++;
    } catch (e) {
      failed++;
    }
  }

  setGuild('antinuke_lockdown', guild.id, { active: false, snapshot: {}, at: Date.now() });
  return { restored, failed, wasActive: true };
}

function isLockedDown(guildId) {
  const { getGuild } = require('../storage');
  return !!getGuild('antinuke_lockdown', guildId, null)?.active;
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
  hasDangerousPerms,
  dangerousRoleAssigned,
  overwriteRemovesAccess,
  notify,
  diagnose,
  lockdownGuild,
  unlockGuild,
  isLockedDown,
  DANGEROUS_PERMS,
};