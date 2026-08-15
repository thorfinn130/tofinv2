const { EmbedBuilder, AuditLogEvent } = require("discord.js");
const { read, write } = require("../storage");

const STORE = "logging";

// ── Event Definitions ─────────────────────────────────────────────────────────
const EVENT_GROUPS = {
  member:  ["member_join", "member_leave", "nickname_change", "role_update"],
  message: ["message_delete", "message_edit", "message_bulk_delete"],
  channel: ["channel_create", "channel_delete", "channel_update",
            "stage_create", "stage_delete", "stage_update",
            "thread_create", "thread_delete", "thread_update"],
  role:    ["role_create", "role_delete", "role_update"],
  voice:   ["voice_join", "voice_leave", "voice_mute", "voice_deaf", "voice_stream"],
  server:  ["server_name", "server_avatar", "server_banner", "vanity_update"],
  other:   ["emoji_update", "sticker_update", "invite_create", "invite_delete", "automod_update"],
};

const ALL_EVENTS = Object.values(EVENT_GROUPS).flat();

// ── Storage Helpers ───────────────────────────────────────────────────────────
function _read()    { return read(STORE, {}); }
function _write(d)  { write(STORE, d); }

function getGuildConfig(guildId) {
  return _read()[guildId] ?? { channels: [], ignored: [] };
}

function saveGuildConfig(guildId, cfg) {
  const all = _read();
  all[guildId] = cfg;
  _write(all);
}

// Add a channel with specific events
function addChannel(guildId, channelId, events) {
  const cfg = getGuildConfig(guildId);
  const existing = cfg.channels.find((c) => c.channelId === channelId);
  if (existing) {
    const merged = [...new Set([...existing.events, ...events])];
    existing.events = merged;
  } else {
    cfg.channels.push({ channelId, events });
  }
  saveGuildConfig(guildId, cfg);
}

// Remove specific events from a channel (removes channel entry if no events left)
function removeChannelEvents(guildId, channelId, events) {
  const cfg = getGuildConfig(guildId);
  const entry = cfg.channels.find((c) => c.channelId === channelId);
  if (!entry) return;
  entry.events = entry.events.filter((e) => !events.includes(e));
  if (!entry.events.length) {
    cfg.channels = cfg.channels.filter((c) => c.channelId !== channelId);
  }
  saveGuildConfig(guildId, cfg);
}

// Add ignored member/channel id
function addIgnored(guildId, id) {
  const cfg = getGuildConfig(guildId);
  if (!cfg.ignored.includes(id)) cfg.ignored.push(id);
  saveGuildConfig(guildId, cfg);
}

function removeIgnored(guildId, id) {
  const cfg = getGuildConfig(guildId);
  cfg.ignored = cfg.ignored.filter((i) => i !== id);
  saveGuildConfig(guildId, cfg);
}

// Parse event args — expands group names and "all"
function parseEvents(args) {
  const events = [];
  for (const arg of args) {
    const lower = arg.toLowerCase();
    if (lower === "all") {
      return ALL_EVENTS.slice();
    }
    if (EVENT_GROUPS[lower]) {
      events.push(...EVENT_GROUPS[lower]);
    } else if (ALL_EVENTS.includes(lower)) {
      events.push(lower);
    }
  }
  return [...new Set(events)];
}

// ── Dispatch Helper ───────────────────────────────────────────────────────────
async function dispatch(guildId, eventName, embed, client, extraContent = null) {
  const cfg = getGuildConfig(guildId);
  if (!cfg.channels.length) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  for (const entry of cfg.channels) {
    if (!entry.events.includes(eventName)) continue;
    const ch = guild.channels.cache.get(entry.channelId);
    if (!ch) continue;

    const me = guild.members.me;
    if (!me?.permissionsIn(ch).has(["SendMessages", "EmbedLinks"])) {
      // Auto-remove broken channels
      cfg.channels = cfg.channels.filter((c) => c.channelId !== entry.channelId);
      saveGuildConfig(guildId, cfg);
      continue;
    }

    const payload = { embeds: [embed] };
    if (extraContent) payload.files = [extraContent];
    ch.send(payload).catch(() => {});
  }
}

function isIgnored(guildId, ...ids) {
  const cfg = getGuildConfig(guildId);
  return ids.some((id) => cfg.ignored.includes(id));
}

// ── Embed Builders ────────────────────────────────────────────────────────────
const C = {
  join:    0x57f287,
  leave:   0xed4245,
  update:  0x5865f2,
  delete:  0xed4245,
  create:  0x57f287,
  voice:   0xfee75c,
  server:  0x5865f2,
  other:   0xeb459e,
};

function logEmbed(title, description, color) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

// ── Event Handlers ────────────────────────────────────────────────────────────

// MEMBER JOIN
async function onMemberAdd(member, client) {
  if (member.user.bot) return;
  const e = logEmbed(
    "📥  Member Joined",
    `${member} **${member.user.tag}**\nID: \`${member.id}\`\nAccount created: <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
    C.join
  ).setThumbnail(member.user.displayAvatarURL({ size: 64 }));
  await dispatch(member.guild.id, "member_join", e, client);
}

// MEMBER LEAVE
async function onMemberRemove(member, client) {
  if (member.user.bot) return;
  const roles = member.roles.cache.filter((r) => r.id !== member.guild.id).map((r) => `${r}`).join(", ") || "None";
  const e = logEmbed(
    "📤  Member Left",
    `${member} **${member.user.tag}**\nID: \`${member.id}\`\nRoles: ${roles}`,
    C.leave
  ).setThumbnail(member.user.displayAvatarURL({ size: 64 }));
  await dispatch(member.guild.id, "member_leave", e, client);
}

// MEMBER UPDATE (nickname, roles)
async function onMemberUpdate(oldMember, newMember, client) {
  if (newMember.user.bot) return;
  if (isIgnored(newMember.guild.id, newMember.id)) return;

  // Nickname change
  if (oldMember.nickname !== newMember.nickname) {
    const e = logEmbed(
      "✏️  Nickname Changed",
      `${newMember} **${newMember.user.tag}**\n**Before:** ${oldMember.nickname || "*None*"}\n**After:** ${newMember.nickname || "*None*"}`,
      C.update
    );
    await dispatch(newMember.guild.id, "nickname_change", e, client);
  }

  // Role update
  const added   = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
  const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));
  if (added.size || removed.size) {
    const lines = [];
    if (added.size)   lines.push(`**Roles Added:** ${added.map((r) => `${r}`).join(", ")}`);
    if (removed.size) lines.push(`**Roles Removed:** ${removed.map((r) => `${r}`).join(", ")}`);
    const e = logEmbed("🏷️  Member Roles Updated", `${newMember} **${newMember.user.tag}**\n${lines.join("\n")}`, C.update);
    await dispatch(newMember.guild.id, "role_update", e, client);
  }
}

// MESSAGE DELETE
async function onMessageDelete(message, client) {
  if (!message.guild || message.author?.bot) return;
  if (isIgnored(message.guild.id, message.author?.id, message.channelId)) return;

  const content = message.content?.slice(0, 1800) || "*No text content*";
  const e = logEmbed(
    "🗑️  Message Deleted",
    `**Author:** ${message.author ?? "Unknown"} (${message.author?.id ?? "?"})\n**Channel:** ${message.channel}\n**Content:**\n${content}`,
    C.delete
  );
  if (message.attachments?.size) {
    e.addFields({ name: "Attachments", value: message.attachments.map((a) => a.url).join("\n").slice(0, 1024) });
  }
  await dispatch(message.guild.id, "message_delete", e, client);
}

// MESSAGE EDIT
async function onMessageUpdate(oldMsg, newMsg, client) {
  if (!newMsg.guild || newMsg.author?.bot) return;
  if (isIgnored(newMsg.guild.id, newMsg.author?.id, newMsg.channelId)) return;
  if (oldMsg.content === newMsg.content) return;

  const before = oldMsg.content?.slice(0, 800) || "*Unknown*";
  const after  = newMsg.content?.slice(0, 800) || "*Empty*";
  const e = logEmbed(
    "✏️  Message Edited",
    `**Author:** ${newMsg.author} (${newMsg.author.id})\n**Channel:** ${newMsg.channel}\n[Jump to message](${newMsg.url})\n\n**Before:**\n${before}\n\n**After:**\n${after}`,
    C.update
  );
  await dispatch(newMsg.guild.id, "message_edit", e, client);
}

// BULK DELETE
async function onMessageBulkDelete(messages, channel, client) {
  if (!channel.guild) return;
  if (isIgnored(channel.guild.id, channel.id)) return;

  const lines = messages.map((m) => {
    const ts = new Date(m.createdTimestamp).toISOString();
    return `[${ts}] ${m.author?.tag ?? "Unknown"}: ${m.content ?? ""}`;
  }).reverse().join("\n");

  const buf = Buffer.from(lines, "utf8");
  if (buf.length > 8 * 1024 * 1024) return; // skip if > 8 MB

  const e = logEmbed(
    "🧹  Bulk Messages Deleted",
    `**Channel:** ${channel}\n**Count:** ${messages.size} messages`,
    C.delete
  );

  const cfg = getGuildConfig(channel.guild.id);
  for (const entry of cfg.channels) {
    if (!entry.events.includes("message_bulk_delete")) continue;
    const ch = channel.guild.channels.cache.get(entry.channelId);
    if (!ch) continue;
    ch.send({
      embeds: [e],
      files: [{ attachment: buf, name: "deleted_messages.txt" }],
    }).catch(() => {});
  }
}

// CHANNEL CREATE
async function onChannelCreate(channel, client) {
  if (!channel.guild) return;
  const e = logEmbed("📂  Channel Created", `**Name:** ${channel}\n**Type:** ${channel.type}\n**ID:** \`${channel.id}\``, C.create);
  await dispatch(channel.guild.id, "channel_create", e, client);
}

// CHANNEL DELETE
async function onChannelDelete(channel, client) {
  if (!channel.guild) return;
  const e = logEmbed("🗑️  Channel Deleted", `**Name:** #${channel.name}\n**Type:** ${channel.type}\n**ID:** \`${channel.id}\``, C.delete);
  await dispatch(channel.guild.id, "channel_delete", e, client);
}

// CHANNEL UPDATE
async function onChannelUpdate(oldCh, newCh, client) {
  if (!newCh.guild) return;
  const changes = [];
  if (oldCh.name !== newCh.name) changes.push(`**Name:** ${oldCh.name} → ${newCh.name}`);
  if (oldCh.topic !== newCh.topic) changes.push(`**Topic:** ${oldCh.topic || "*None*"} → ${newCh.topic || "*None*"}`);
  if (oldCh.nsfw !== newCh.nsfw) changes.push(`**NSFW:** ${oldCh.nsfw} → ${newCh.nsfw}`);
  if (oldCh.rateLimitPerUser !== newCh.rateLimitPerUser) changes.push(`**Slowmode:** ${oldCh.rateLimitPerUser}s → ${newCh.rateLimitPerUser}s`);
  if (!changes.length) return;
  const e = logEmbed("⚙️  Channel Updated", `${newCh}\n${changes.join("\n")}`, C.update);
  await dispatch(newCh.guild.id, "channel_update", e, client);
}

// STAGE INSTANCE EVENTS
async function onStageCreate(stage, client) {
  const e = logEmbed("🎙️  Stage Started", `**Topic:** ${stage.topic}\n**Channel ID:** \`${stage.channelId}\``, C.create);
  await dispatch(stage.guild.id, "stage_create", e, client);
}
async function onStageDelete(stage, client) {
  const e = logEmbed("🎙️  Stage Ended", `**Topic:** ${stage.topic}\n**Channel ID:** \`${stage.channelId}\``, C.delete);
  await dispatch(stage.guild.id, "stage_delete", e, client);
}
async function onStageUpdate(oldStage, newStage, client) {
  const e = logEmbed("🎙️  Stage Updated", `**Topic:** ${oldStage.topic} → ${newStage.topic}`, C.update);
  await dispatch(newStage.guild.id, "stage_update", e, client);
}

// THREAD EVENTS
async function onThreadCreate(thread, client) {
  const e = logEmbed("🧵  Thread Created", `**Name:** ${thread.name}\n**Parent:** ${thread.parent}\n**ID:** \`${thread.id}\``, C.create);
  await dispatch(thread.guild.id, "thread_create", e, client);
}
async function onThreadDelete(thread, client) {
  const e = logEmbed("🧵  Thread Deleted", `**Name:** ${thread.name}\n**Parent:** ${thread.parent?.name ?? "Unknown"}\n**ID:** \`${thread.id}\``, C.delete);
  await dispatch(thread.guild.id, "thread_delete", e, client);
}
async function onThreadUpdate(oldThread, newThread, client) {
  const changes = [];
  if (oldThread.name !== newThread.name) changes.push(`**Name:** ${oldThread.name} → ${newThread.name}`);
  if (oldThread.archived !== newThread.archived) changes.push(`**Archived:** ${oldThread.archived} → ${newThread.archived}`);
  if (oldThread.locked !== newThread.locked) changes.push(`**Locked:** ${oldThread.locked} → ${newThread.locked}`);
  if (!changes.length) return;
  const e = logEmbed("🧵  Thread Updated", `**Thread:** ${newThread.name}\n${changes.join("\n")}`, C.update);
  await dispatch(newThread.guild.id, "thread_update", e, client);
}

// ROLE EVENTS
async function onRoleCreate(role, client) {
  const e = logEmbed("🏷️  Role Created", `**Name:** ${role.name}\n**ID:** \`${role.id}\`\n**Color:** \`${role.hexColor}\``, C.create);
  await dispatch(role.guild.id, "role_create", e, client);
}
async function onRoleDelete(role, client) {
  const e = logEmbed("🏷️  Role Deleted", `**Name:** ${role.name}\n**ID:** \`${role.id}\``, C.delete);
  await dispatch(role.guild.id, "role_delete", e, client);
}
async function onRoleUpdate(oldRole, newRole, client) {
  const changes = [];
  if (oldRole.name !== newRole.name) changes.push(`**Name:** ${oldRole.name} → ${newRole.name}`);
  if (oldRole.color !== newRole.color) changes.push(`**Color:** \`${oldRole.hexColor}\` → \`${newRole.hexColor}\``);
  if (oldRole.hoist !== newRole.hoist) changes.push(`**Hoisted:** ${oldRole.hoist} → ${newRole.hoist}`);
  if (oldRole.mentionable !== newRole.mentionable) changes.push(`**Mentionable:** ${oldRole.mentionable} → ${newRole.mentionable}`);
  const oldPerms = oldRole.permissions.bitfield;
  const newPerms = newRole.permissions.bitfield;
  if (oldPerms !== newPerms) changes.push(`**Permissions changed**`);
  if (!changes.length) return;
  const e = logEmbed("🏷️  Role Updated", `**Role:** ${newRole.name}\n${changes.join("\n")}`, C.update);
  await dispatch(newRole.guild.id, "role_update", e, client);
}

// VOICE STATE UPDATE (joins, leaves, mute, deaf, stream)
async function onVoiceUpdate(oldState, newState, client) {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;
  if (isIgnored(member.guild.id, member.id)) return;

  const guildId = member.guild.id;

  // Join
  if (!oldState.channelId && newState.channelId) {
    const e = logEmbed("🔊  Voice Joined", `${member} joined **${newState.channel?.name}**`, C.voice);
    return dispatch(guildId, "voice_join", e, client);
  }

  // Leave
  if (oldState.channelId && !newState.channelId) {
    const e = logEmbed("🔇  Voice Left", `${member} left **${oldState.channel?.name}**`, C.voice);
    return dispatch(guildId, "voice_leave", e, client);
  }

  // Mute/Unmute
  if (oldState.selfMute !== newState.selfMute || oldState.serverMute !== newState.serverMute) {
    const isMuted = newState.selfMute || newState.serverMute;
    const label = newState.serverMute ? "Server-muted" : (isMuted ? "Self-muted" : "Unmuted");
    const e = logEmbed("🎤  Voice Mute State", `${member} — **${label}** in **${newState.channel?.name}**`, C.voice);
    return dispatch(guildId, "voice_mute", e, client);
  }

  // Deafen
  if (oldState.selfDeaf !== newState.selfDeaf || oldState.serverDeaf !== newState.serverDeaf) {
    const isDeaf = newState.selfDeaf || newState.serverDeaf;
    const label = newState.serverDeaf ? "Server-deafened" : (isDeaf ? "Self-deafened" : "Undeafened");
    const e = logEmbed("🔕  Voice Deaf State", `${member} — **${label}** in **${newState.channel?.name}**`, C.voice);
    return dispatch(guildId, "voice_deaf", e, client);
  }

  // Stream start/stop
  if (oldState.streaming !== newState.streaming) {
    const label = newState.streaming ? "started streaming" : "stopped streaming";
    const e = logEmbed("📡  Voice Stream", `${member} **${label}** in **${newState.channel?.name}**`, C.voice);
    return dispatch(guildId, "voice_stream", e, client);
  }
}

// GUILD UPDATE (server-level changes)
async function onGuildUpdate(oldGuild, newGuild, client) {
  const changes = [];
  if (oldGuild.name !== newGuild.name) changes.push(`**Name:** ${oldGuild.name} → ${newGuild.name}`);
  if (oldGuild.icon !== newGuild.icon) changes.push(`**Icon:** changed`);
  if (oldGuild.banner !== newGuild.banner) changes.push(`**Banner:** changed`);
  if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) changes.push(`**Vanity URL:** ${oldGuild.vanityURLCode ?? "None"} → ${newGuild.vanityURLCode ?? "None"}`);
  if (!changes.length) return;

  const eventMap = {
    "**Name:** ": "server_name",
    "**Icon:** ": "server_avatar",
    "**Banner:** ": "server_banner",
    "**Vanity URL:** ": "vanity_update",
  };

  for (const [prefix, eventName] of Object.entries(eventMap)) {
    const relevant = changes.filter((c) => c.startsWith(prefix));
    if (!relevant.length) continue;
    const e = logEmbed("🏠  Server Updated", relevant.join("\n"), C.server);
    await dispatch(newGuild.id, eventName, e, client);
  }
}

// EMOJI UPDATE
async function onEmojiCreate(emoji, client) {
  const e = logEmbed("😀  Emoji Created", `**Name:** :${emoji.name}:\n**ID:** \`${emoji.id}\``, C.other);
  await dispatch(emoji.guild.id, "emoji_update", e, client);
}
async function onEmojiDelete(emoji, client) {
  const e = logEmbed("😀  Emoji Deleted", `**Name:** ${emoji.name}\n**ID:** \`${emoji.id}\``, C.other);
  await dispatch(emoji.guild.id, "emoji_update", e, client);
}
async function onEmojiUpdate(oldEmoji, newEmoji, client) {
  const e = logEmbed("😀  Emoji Updated", `**Name:** ${oldEmoji.name} → ${newEmoji.name}`, C.other);
  await dispatch(newEmoji.guild.id, "emoji_update", e, client);
}

// STICKER UPDATE
async function onStickerCreate(sticker, client) {
  const e = logEmbed("🎭  Sticker Created", `**Name:** ${sticker.name}\n**ID:** \`${sticker.id}\``, C.other);
  await dispatch(sticker.guildId, "sticker_update", e, client);
}
async function onStickerDelete(sticker, client) {
  const e = logEmbed("🎭  Sticker Deleted", `**Name:** ${sticker.name}\n**ID:** \`${sticker.id}\``, C.other);
  await dispatch(sticker.guildId, "sticker_update", e, client);
}
async function onStickerUpdate(oldSticker, newSticker, client) {
  const e = logEmbed("🎭  Sticker Updated", `**Name:** ${oldSticker.name} → ${newSticker.name}`, C.other);
  await dispatch(newSticker.guildId, "sticker_update", e, client);
}

// INVITE EVENTS
async function onInviteCreate(invite, client) {
  const e = logEmbed(
    "🔗  Invite Created",
    `**Code:** ${invite.code}\n**Channel:** ${invite.channel}\n**Inviter:** ${invite.inviter ?? "Unknown"}\n**Max Uses:** ${invite.maxUses || "Unlimited"}\n**Expires:** ${invite.expiresAt ? `<t:${Math.floor(invite.expiresTimestamp / 1000)}:R>` : "Never"}`,
    C.create
  );
  await dispatch(invite.guild.id, "invite_create", e, client);
}
async function onInviteDelete(invite, client) {
  const e = logEmbed("🔗  Invite Deleted", `**Code:** ${invite.code}\n**Channel:** ${invite.channel}`, C.delete);
  await dispatch(invite.guild.id, "invite_delete", e, client);
}

// AUTOMOD
async function onAutoModCreate(rule, client) {
  const e = logEmbed("🛡️  AutoMod Rule Created", `**Name:** ${rule.name}\n**Enabled:** ${rule.enabled}`, C.other);
  await dispatch(rule.guildId, "automod_update", e, client);
}
async function onAutoModDelete(rule, client) {
  const e = logEmbed("🛡️  AutoMod Rule Deleted", `**Name:** ${rule.name}`, C.other);
  await dispatch(rule.guildId, "automod_update", e, client);
}
async function onAutoModUpdate(oldRule, newRule, client) {
  const e = logEmbed("🛡️  AutoMod Rule Updated", `**Name:** ${newRule.name}\n**Enabled:** ${oldRule.enabled} → ${newRule.enabled}`, C.other);
  await dispatch(newRule.guildId, "automod_update", e, client);
}

// ── Register All Events on Client ─────────────────────────────────────────────
function register(client) {
  client.on("guildMemberAdd",            (m)       => onMemberAdd(m, client).catch(() => {}));
  client.on("guildMemberRemove",         (m)       => onMemberRemove(m, client).catch(() => {}));
  client.on("guildMemberUpdate",         (o, n)    => onMemberUpdate(o, n, client).catch(() => {}));
  client.on("messageDelete",             (m)       => onMessageDelete(m, client).catch(() => {}));
  client.on("messageUpdate",             (o, n)    => onMessageUpdate(o, n, client).catch(() => {}));
  client.on("messageDeleteBulk",         (msgs, ch) => onMessageBulkDelete(msgs, ch, client).catch(() => {}));
  client.on("channelCreate",             (ch)      => onChannelCreate(ch, client).catch(() => {}));
  client.on("channelDelete",             (ch)      => onChannelDelete(ch, client).catch(() => {}));
  client.on("channelUpdate",             (o, n)    => onChannelUpdate(o, n, client).catch(() => {}));
  client.on("stageInstanceCreate",       (s)       => onStageCreate(s, client).catch(() => {}));
  client.on("stageInstanceDelete",       (s)       => onStageDelete(s, client).catch(() => {}));
  client.on("stageInstanceUpdate",       (o, n)    => onStageUpdate(o, n, client).catch(() => {}));
  client.on("threadCreate",              (t)       => onThreadCreate(t, client).catch(() => {}));
  client.on("threadDelete",              (t)       => onThreadDelete(t, client).catch(() => {}));
  client.on("threadUpdate",              (o, n)    => onThreadUpdate(o, n, client).catch(() => {}));
  client.on("roleCreate",                (r)       => onRoleCreate(r, client).catch(() => {}));
  client.on("roleDelete",                (r)       => onRoleDelete(r, client).catch(() => {}));
  client.on("roleUpdate",                (o, n)    => onRoleUpdate(o, n, client).catch(() => {}));
  client.on("voiceStateUpdate",          (o, n)    => onVoiceUpdate(o, n, client).catch(() => {}));
  client.on("guildUpdate",               (o, n)    => onGuildUpdate(o, n, client).catch(() => {}));
  client.on("emojiCreate",               (e)       => onEmojiCreate(e, client).catch(() => {}));
  client.on("emojiDelete",               (e)       => onEmojiDelete(e, client).catch(() => {}));
  client.on("emojiUpdate",               (o, n)    => onEmojiUpdate(o, n, client).catch(() => {}));
  client.on("stickerCreate",             (s)       => onStickerCreate(s, client).catch(() => {}));
  client.on("stickerDelete",             (s)       => onStickerDelete(s, client).catch(() => {}));
  client.on("stickerUpdate",             (o, n)    => onStickerUpdate(o, n, client).catch(() => {}));
  client.on("inviteCreate",              (i)       => onInviteCreate(i, client).catch(() => {}));
  client.on("inviteDelete",              (i)       => onInviteDelete(i, client).catch(() => {}));
  client.on("autoModerationRuleCreate",  (r)       => onAutoModCreate(r, client).catch(() => {}));
  client.on("autoModerationRuleDelete",  (r)       => onAutoModDelete(r, client).catch(() => {}));
  client.on("autoModerationRuleUpdate",  (o, n)    => onAutoModUpdate(o, n, client).catch(() => {}));
}

module.exports = {
  register,
  getGuildConfig,
  addChannel,
  removeChannelEvents,
  addIgnored,
  removeIgnored,
  parseEvents,
  ALL_EVENTS,
  EVENT_GROUPS,
};
