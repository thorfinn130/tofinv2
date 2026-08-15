const { read, write } = require("../storage");

const STORE = "invite_tracker";

// In-memory invite cache per guild: { [guildId]: Map<code, { inviterId, uses }> }
const cache = new Map();

function _read()   { return read(STORE, {}); }
function _write(d) { write(STORE, d); }

function getGuildData(guildId) {
  const all = _read();
  return all[guildId] ?? { members: {}, counts: {} };
}
function saveGuildData(guildId, data) {
  const all = _read();
  all[guildId] = data;
  _write(all);
}

// ── Cache management ──────────────────────────────────────────────────────────
async function cacheGuild(guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map();
    invites.forEach((inv) => map.set(inv.code, { inviterId: inv.inviter?.id ?? null, uses: inv.uses ?? 0 }));
    cache.set(guild.id, map);
  } catch {
    cache.set(guild.id, new Map());
  }
}

async function onInviteCreate(invite) {
  const map = cache.get(invite.guild?.id) ?? new Map();
  map.set(invite.code, { inviterId: invite.inviter?.id ?? null, uses: invite.uses ?? 0 });
  cache.set(invite.guild.id, map);
}

async function onInviteDelete(invite) {
  const map = cache.get(invite.guild?.id);
  if (map) map.delete(invite.code);
}

// Called on guildMemberAdd — returns the inviter's userId or null
async function resolveInviter(member) {
  const guild = member.guild;
  const oldMap = cache.get(guild.id) ?? new Map();

  let newInvites;
  try {
    newInvites = await guild.invites.fetch();
  } catch {
    return null;
  }

  let usedCode = null;
  let inviterId = null;

  for (const inv of newInvites.values()) {
    const cached = oldMap.get(inv.code);
    if (cached && inv.uses > cached.uses) {
      usedCode   = inv.code;
      inviterId  = cached.inviterId;
      break;
    }
    if (!cached && inv.uses > 0) {
      usedCode   = inv.code;
      inviterId  = inv.inviter?.id ?? null;
      break;
    }
  }

  // Rebuild cache with fresh data
  const newMap = new Map();
  newInvites.forEach((inv) => newMap.set(inv.code, { inviterId: inv.inviter?.id ?? null, uses: inv.uses }));
  cache.set(guild.id, newMap);

  if (!inviterId) return null;

  // Persist
  const data = getGuildData(guild.id);
  data.members[member.id] = { invitedBy: inviterId, code: usedCode, at: Date.now() };
  if (!data.counts[inviterId]) data.counts[inviterId] = { regular: 0, left: 0, fake: 0 };
  data.counts[inviterId].regular++;
  saveGuildData(guild.id, data);

  return inviterId;
}

// When a member leaves — deduct from inviter's count
function onMemberLeave(guildId, userId) {
  const data = getGuildData(guildId);
  const entry = data.members[userId];
  if (!entry?.invitedBy) return;
  if (!data.counts[entry.invitedBy]) return;
  data.counts[entry.invitedBy].left = (data.counts[entry.invitedBy].left || 0) + 1;
  saveGuildData(guildId, data);
}

function getInviteStats(guildId, userId) {
  const data = getGuildData(guildId);
  const counts = data.counts[userId] ?? { regular: 0, left: 0, fake: 0 };
  const net = Math.max(0, counts.regular - counts.left);
  // Who invited this user?
  const entry = data.members[userId];
  return { ...counts, net, invitedBy: entry?.invitedBy ?? null, inviteCode: entry?.code ?? null, joinedAt: entry?.at ?? null };
}

// Leaderboard: top inviters in a guild
function getLeaderboard(guildId, limit = 10) {
  const data = getGuildData(guildId);
  return Object.entries(data.counts)
    .map(([userId, c]) => ({ userId, regular: c.regular, left: c.left ?? 0, net: Math.max(0, c.regular - (c.left ?? 0)) }))
    .sort((a, b) => b.net - a.net)
    .slice(0, limit);
}

// ── Historical sync ────────────────────────────────────────────────────────────
// Pulls the live, current "uses" count for every invite in the guild and uses it
// to correct each inviter's credited count. This fixes the "shows 0" bug: event-based
// tracking only counts joins the bot personally witnessed, so anyone invited before
// the bot started tracking is invisible until we read Discord's own running totals.
//
// Safe to run every startup — idempotent. Each inviter's "regular" count is only ever
// raised to match their current summed invite uses, never lowered, so re-running
// never inflates or erases anything event-tracking already correctly counted.
async function syncFromDiscord(guild) {
  let invites;
  try {
    invites = await guild.invites.fetch();
  } catch {
    return { synced: 0 };
  }

  const usesByInviter = {};
  for (const inv of invites.values()) {
    const inviterId = inv.inviter?.id;
    if (!inviterId) continue;
    usesByInviter[inviterId] = (usesByInviter[inviterId] ?? 0) + (inv.uses ?? 0);
  }

  const data = getGuildData(guild.id);
  let synced = 0;

  for (const [inviterId, totalUses] of Object.entries(usesByInviter)) {
    if (!data.counts[inviterId]) data.counts[inviterId] = { regular: 0, left: 0, fake: 0 };
    if (totalUses > data.counts[inviterId].regular) {
      data.counts[inviterId].regular = totalUses;
      synced++;
    }
  }

  saveGuildData(guild.id, data);
  return { synced };
}

async function register(client) {
  // Cache all guilds on ready, then sync historical invite-use counts for each
  for (const guild of client.guilds.cache.values()) {
    await cacheGuild(guild);
    await syncFromDiscord(guild).catch((e) => console.error("[inviteTracker sync]", guild.id, e.message));
  }
  client.on("inviteCreate", (i) => onInviteCreate(i).catch(() => {}));
  client.on("inviteDelete", (i) => onInviteDelete(i).catch(() => {}));
  client.on("guildCreate",  async (g) => {
    await cacheGuild(g);
    await syncFromDiscord(g).catch(() => {});
  });
}

module.exports = { register, resolveInviter, onMemberLeave, getInviteStats, getLeaderboard, syncFromDiscord };