const { Client, GatewayIntentBits, Partials, ChannelType, PermissionFlagsBits, REST, Routes, AuditLogEvent } = require("discord.js");
const { token, clientId } = require("./config");
const prefix   = require("./handlers/prefix");
const slash    = require("./handlers/slash");
const buttons  = require("./handlers/buttons");
const antiNuke = require("./services/antiNuke"); // new anti-nuke service
const logging  = require("./services/logging");
const giveaway = require("./services/giveaway");
const { track: trackMessage } = require("./services/messageTracker");
const inviteTracker = require("./services/inviteTracker");
const { addXP, rolesEarnedAt } = require("./services/leveling");
const aiChat = require("./services/aiChat");
const { extractGifUrl, saveGif } = require("./services/gifMemory");
const { storeDelete } = require("./commands/prefix/snipe");
const { getAfk, clearAfk, isAfk } = require("./services/afk");
const { check: automodCheck } = require("./services/automod");
const { getDueReminders, removeById } = require("./services/reminder");
const { handleSocial } = require("./services/socialHandler");
const { resolveAlias } = require("./services/alias");

// ── Crash safety net: log unexpected async errors instead of letting them
//    take the whole process down. This does NOT fix bugs — it just stops a
//    single bad promise rejection somewhere from killing the bot for everyone.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.AutoModerationConfiguration,
    GatewayIntentBits.AutoModerationExecution,
  ],
  partials: [Partials.GuildMember, Partials.User, Partials.Channel, Partials.Message],
  presence: { status: "online" },
});

prefix.loadCommands();
slash.loadCommands();
// antiNuke.register(client); // old anti-nuke (commented out – replaced by new system)
logging.register(client);

// ── Auto‑deploy slash commands on startup ──
async function deployCommands() {
  try {
    slash.loadCommands();
    const body = slash.getAll().map((c) => c.data.toJSON());
    const rest = new REST({ version: "10" }).setToken(token);
    console.log(`🔄 Deploying ${body.length} slash command(s)…`);
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log("✅ Slash commands deployed globally.");
  } catch (err) {
    console.error("❌ Slash deploy failed:", err.message);
  }
}

let BOT_READY_AT = 0;

client.once("clientReady", async () => {
  BOT_READY_AT = Date.now();
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setPresence({
    status: "tofin",
    activities: [
      {
        name: "Listening to music:",
        type: 1,
        url: "https://www.twitch.tv/sstofin",
      },
    ],
  });


  startJailExpiryLoop();
  startReminderLoop();
  giveaway.startLoop(client);
  await inviteTracker.register(client).catch(() => {});
});

// ── Helper for anti‑nuke audit log lookups ──
async function getExecutor(guild, eventType) {
  try {
    const logs = await guild.fetchAuditLogs({ type: eventType, limit: 1 });
    const entry = logs.entries.first();
    return entry?.executor?.id || null;
  } catch { return null; }
}

client.on("messageCreate", async (m) => {
  if (m.author.bot) return;

  if (m.createdTimestamp < BOT_READY_AT) return;

  if (!m.guild) {
    aiChat.chat(m).catch(() => {});
    return;
  }

  // ── Automod ──
  try {
    const result = automodCheck(m.guild.id, m);
    if (result) {
      await m.delete().catch(() => {});

      if (result.action === "mute") {
        await m.member?.timeout(10 * 60_000, `Automod: ${result.reason}`).catch(() => {});
      }
      if (result.action === "warn") {
        try {
          const { addWarning } = require("./services/moderation");
          addWarning(m.guild.id, m.author.id, `Automod: ${result.reason}`, "Automod");
        } catch {}
      }

      const warnMsg = await m.channel.send({
        content: `⚠️ ${m.author}, your message was removed for **${result.reason}**.`,
      }).catch(() => null);
      if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);

      try {
        const { getConfig } = require("./services/automod");
        const cfg = getConfig(m.guild.id);
        if (cfg.logChannelId) {
          const logChannel = m.guild.channels.cache.get(cfg.logChannelId);
          if (logChannel) {
            const { EmbedBuilder } = require("discord.js");
            await logChannel.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle("🛡️ Automod Action")
                  .setColor(0xED4245)
                  .setDescription(`**User:** ${m.author} (${m.author.id})\n**Channel:** ${m.channel}\n**Rule:** ${result.rule}\n**Action:** ${result.action}\n**Reason:** ${result.reason}`)
                  .setTimestamp(),
              ],
            }).catch(() => {});
          }
        }
      } catch {}

      return;
    }
  } catch (e) {
    console.error("[automod]", e);
  }

  // ── AFK ──
  try {
    if (isAfk(m.guild.id, m.author.id)) {
      const { EmbedBuilder } = require("discord.js");
      clearAfk(m.guild.id, m.author.id);
      m.channel.send({
        embeds: [
          new EmbedBuilder()
            .setDescription(`👋 Welcome back, ${m.author}! Your AFK status has been removed.`)
            .setColor(0x57f287),
        ],
      }).then((msg) => setTimeout(() => msg.delete().catch(() => {}), 6000)).catch(() => {});
    }
  } catch {}

  try {
    if (m.mentions.users.size) {
      const { EmbedBuilder } = require("discord.js");
      for (const [userId, user] of m.mentions.users) {
        if (userId === m.author.id) continue;
        const afkData = getAfk(m.guild.id, userId);
        if (!afkData) continue;
        const since = Math.floor(afkData.since / 1000);
        m.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("💤  User is AFK")
              .setDescription(`${user} is currently AFK.`)
              .addFields(
                { name: "Status", value: afkData.reason, inline: true },
                { name: "Since",  value: `<t:${since}:R>`, inline: true },
              )
              .setColor(0x5865f2)
              .setThumbnail(user.displayAvatarURL()),
          ],
        }).catch(() => {});
        break;
      }
    }
  } catch {}

  // ── Message Spam Detection (Anti‑Nuke) ──
  try {
    const config = antiNuke.getConfig(m.guild.id);
    if (config.enabled && config.modules.messageSpam?.enabled) {
      const userId = m.author.id;
      if (antiNuke.checkMessageSpam(m.guild.id, userId, config.modules.messageSpam)) {
        const member = await m.guild.members.fetch(userId).catch(() => null);
        if (member && !antiNuke.isWhitelisted(m.guild.id, userId, member)) {
          await antiNuke.executeAction(m.guild, userId, config.modules.messageSpam.action, 'Message spam detected');
        }
      }
    }
    // ── Mention Spam Detection (Anti‑Nuke) ──
    if (config.enabled && config.modules.mentionSpam?.enabled) {
      const userId = m.author.id;
      const mentionCount = m.mentions.users.size + m.mentions.roles.size;
      if (mentionCount && antiNuke.checkMentionSpam(m.guild.id, userId, mentionCount, config.modules.mentionSpam)) {
        const member = await m.guild.members.fetch(userId).catch(() => null);
        if (member && !antiNuke.isWhitelisted(m.guild.id, userId, member)) {
          await antiNuke.executeAction(m.guild, userId, config.modules.mentionSpam.action, 'Mention spam detected');
        }
      }
    }
  } catch (e) {
    console.error('[AntiNuke] Spam check failed:', e);
  }

  // Social media auto‑downloader
  handleSocial(m).catch(() => {});

  const gifUrl = extractGifUrl(m);
  if (gifUrl) saveGif(m.guild.id, gifUrl);

  trackMessage(m.guild.id, m.author.id);

  const { isLevelingEnabled } = require("./commands/prefix/leveltoggle");
  if (isLevelingEnabled(m.guild.id)) {
    const result = addXP(m.guild.id, m.author.id);
    if (result?.leveled) {
      m.channel.send({
        content: `🎉 ${m.author} leveled up to **Level ${result.level}**!`,
      }).catch(() => {});

      // Apply any level-role rewards the member has newly earned
      try {
        const roleIds = rolesEarnedAt(m.guild.id, result.level);
        if (roleIds.length) {
          const member = m.member ?? await m.guild.members.fetch(m.author.id).catch(() => null);
          if (member) {
            const toAdd = roleIds.filter((id) => !member.roles.cache.has(id) && m.guild.roles.cache.has(id));
            if (toAdd.length) await member.roles.add(toAdd, "Level role reward").catch(() => {});
          }
        }
      } catch (e) {
        console.error("[levelRoles]", e);
      }
    }
  }

  // ── Alias resolution ──
  const PREFIX = ",";
  if (m.content.startsWith(PREFIX)) {
    const args = m.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args[0]?.toLowerCase();
    if (commandName) {
      const expansion = resolveAlias(m.guild.id, commandName);
      if (expansion) {
        const rest = args.slice(1);
        const newContent = PREFIX + expansion + (rest.length ? ' ' + rest.join(' ') : '');
        m.content = newContent;
      }
    }
  }

  prefix.handle(m);
  aiChat.chat(m).catch(() => {});
});

client.on("messageDelete", (m) => storeDelete(m));

client.on("presenceUpdate", async (oldPresence, newPresence) => {
  try {
    const { getAllRules } = require("./services/statusRoles");
    const member = newPresence?.member;
    if (!member || member.user.bot) return;

    const rules = getAllRules().filter((r) => r.guildId === member.guild.id);
    if (!rules.length) return;

    const customStatus = newPresence.activities?.find((a) => a.type === 4)?.state || "";

    for (const rule of rules) {
      const matches = customStatus.toLowerCase().includes(rule.matchText.toLowerCase());
      const hasRole = member.roles.cache.has(rule.roleId);

      if (matches && !hasRole) {
        await member.roles.add(rule.roleId).catch(() => {});
      } else if (!matches && hasRole) {
        await member.roles.remove(rule.roleId).catch(() => {});
      }
    }
  } catch (e) {
    console.error("[presenceUpdate statusRoles]", e);
  }
});

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    const { isTrigger, getTriggerLimit, registerTemp, isTempChannel, removeTemp } = require("./services/joinToCreate");

    if (newState.channelId && newState.channelId !== oldState.channelId) {
      const guild = newState.guild;
      if (isTrigger(guild.id, newState.channelId)) {
        const triggerChannel = newState.channel;
        const member = newState.member;
        const configuredLimit = getTriggerLimit(guild.id, newState.channelId);

        const created = await guild.channels.create({
          name: `${member.user.username}'s channel`,
          type: triggerChannel.type,
          parent: triggerChannel.parentId,
          userLimit: configuredLimit ?? 0,
          permissionOverwrites: [
            {
              id: member.id,
              allow: [
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.MoveMembers,
                PermissionFlagsBits.MuteMembers,
                PermissionFlagsBits.DeafenMembers,
              ],
            },
          ],
        });

        registerTemp(created.id, guild.id, member.id);
        await member.voice.setChannel(created).catch(() => {});
      }
    }

    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      const leftChannel = oldState.channel;
      if (leftChannel && isTempChannel(leftChannel.id) && leftChannel.members.size === 0) {
        removeTemp(leftChannel.id);
        await leftChannel.delete().catch(() => {});
      }
    }
  } catch (e) {
    console.error("[voiceStateUpdate joinToCreate]", e);
  }
});

client.on("interactionCreate", async (i) => {
  if (i.isButton() || i.isStringSelectMenu()) return buttons.handle(i);
  if (i.isModalSubmit()) return buttons.handleModal(i);
  slash.handle(i);
});

// ── NEW ANTI‑NUKE EVENT HANDLERS ──
client.on('channelCreate', async (channel) => {
  const guild = channel.guild;
  const executorId = await getExecutor(guild, AuditLogEvent.ChannelCreate);
  if (executorId) {
    await antiNuke.handleEvent(guild, 'channelCreate', executorId);
  }
});

client.on('channelDelete', async (channel) => {
  const guild = channel.guild;
  const executorId = await getExecutor(guild, AuditLogEvent.ChannelDelete);
  if (executorId) {
    await antiNuke.handleEvent(guild, 'channelDelete', executorId);
  }
});

client.on('roleCreate', async (role) => {
  const guild = role.guild;
  const executorId = await getExecutor(guild, AuditLogEvent.RoleCreate);
  if (executorId) {
    await antiNuke.handleEvent(guild, 'roleCreate', executorId);
  }
});

client.on('roleDelete', async (role) => {
  const guild = role.guild;
  const executorId = await getExecutor(guild, AuditLogEvent.RoleDelete);
  if (executorId) {
    await antiNuke.handleEvent(guild, 'roleDelete', executorId);
  }
});

client.on('webhookCreate', async (webhook) => {
  const guild = webhook.guild;
  const executorId = await getExecutor(guild, AuditLogEvent.WebhookCreate);
  if (executorId) {
    await antiNuke.handleEvent(guild, 'webhookCreate', executorId);
  }
});

// ── Permission escalation: someone grants a role dangerous permissions ──
client.on('roleUpdate', async (oldRole, newRole) => {
  try {
    const guild = newRole.guild;
    if (!antiNuke.grantedDangerousPerm(oldRole.permissions, newRole.permissions)) return;
    const executorId = await getExecutor(guild, AuditLogEvent.RoleUpdate);
    if (executorId) {
      await antiNuke.handleEvent(guild, 'permissionEscalation', executorId, {
        Role: `${newRole.name} (${newRole.id})`,
      });
    }
  } catch (e) {
    console.error('[AntiNuke] roleUpdate check failed:', e);
  }
});

// ── Mass emoji deletion ──
client.on('emojiDelete', async (emoji) => {
  const guild = emoji.guild;
  const executorId = await getExecutor(guild, AuditLogEvent.EmojiDelete);
  if (executorId) {
    await antiNuke.handleEvent(guild, 'emojiDelete', executorId);
  }
});

// De-dupe guard: a single prune audit-log entry can be seen once per removed member
const handledPruneEntries = new Set();

client.on('guildMemberRemove', async (member) => {
  // Existing invite tracker
  inviteTracker.onMemberLeave(member.guild.id, member.id);

  // ── Welcomer: goodbye message ──
  try {
    const { getGuildConfig, getTemplate, buildWelcomeEmbed, resolveVars, resolveGifUrl } = require("./services/welcomer");
    const cfg = getGuildConfig(member.guild.id);
    if (cfg?.leaveEnabled && cfg?.leaveChannelId && cfg?.leaveTemplateName && cfg?.leaveTemplateOwner) {
      const tpl = getTemplate(cfg.leaveTemplateOwner, cfg.leaveTemplateName);
      const channel = member.guild.channels.cache.get(cfg.leaveChannelId);
      if (tpl && channel) {
        const [resolvedImage, resolvedThumb] = await Promise.all([
          resolveGifUrl(tpl.image     ? resolveVars(tpl.image,     member) : null),
          resolveGifUrl(tpl.thumbnail ? resolveVars(tpl.thumbnail, member) : null),
        ]);
        const tplResolved = { ...tpl, image: resolvedImage, thumbnail: resolvedThumb };
        const { embed, content } = buildWelcomeEmbed(tplResolved, member);
        const sent = await channel.send({ content: content ?? undefined, embeds: [embed] });
        if (cfg.deleteAfterMs) setTimeout(() => sent.delete().catch(() => {}), cfg.deleteAfterMs);
      }
    }
  } catch (e) {
    console.error("[guildMemberRemove welcomer]", e);
  }

  // Anti-nuke: detect kicks
  const guild = member.guild;
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
  const entry = logs.entries.first();
  if (entry && entry.target?.id === member.id) {
    const executorId = entry.executor?.id;
    if (executorId) {
      await antiNuke.handleEvent(guild, 'memberKick', executorId);
    }
  }

  // Anti-nuke: detect mass member prune (bulk-kick of inactive members)
  try {
    const pruneLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberPrune, limit: 1 });
    const pruneEntry = pruneLogs.entries.first();
    if (pruneEntry && Date.now() - pruneEntry.createdTimestamp < 10_000 && !handledPruneEntries.has(pruneEntry.id)) {
      handledPruneEntries.add(pruneEntry.id);
      setTimeout(() => handledPruneEntries.delete(pruneEntry.id), 60_000);
      const executorId = pruneEntry.executor?.id;
      if (executorId) {
        await antiNuke.handleEvent(guild, 'prune', executorId, {
          Removed: `${pruneEntry.extra?.removed ?? '?'} members`,
        });
      }
    }
  } catch (e) {
    console.error('[AntiNuke] prune check failed:', e);
  }
});

client.on('guildBanAdd', async (ban) => {
  const guild = ban.guild;
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
  const entry = logs.entries.first();
  if (entry && entry.target?.id === ban.user.id) {
    const executorId = entry.executor?.id;
    if (executorId) {
      await antiNuke.handleEvent(guild, 'memberBan', executorId);
    }
  }
});

client.on("guildMemberAdd", async (member) => {
  // Existing: invite tracker, autorole, welcomer
  inviteTracker.resolveInviter(member).catch(() => {});

  try {
    const { getRoles } = require("./services/autorole");
    const roleIds = getRoles(member.guild.id);
    for (const roleId of roleIds) {
      const role = member.guild.roles.cache.get(roleId);
      if (role) await member.roles.add(role).catch(() => {});
    }
  } catch (e) {
    console.error("[guildMemberAdd autorole]", e);
  }

  try {
    const { getGuildConfig, getTemplate, buildWelcomeEmbed, resolveVars, resolveGifUrl } = require("./services/welcomer");
    const cfg = getGuildConfig(member.guild.id);
    if (!cfg?.enabled || !cfg?.channelId || !cfg?.templateName || !cfg?.templateOwner) return;
    const tpl = getTemplate(cfg.templateOwner, cfg.templateName);
    if (!tpl) return;
    const channel = member.guild.channels.cache.get(cfg.channelId);
    if (!channel) return;
    const [resolvedImage, resolvedThumb] = await Promise.all([
      resolveGifUrl(tpl.image    ? resolveVars(tpl.image,     member) : null),
      resolveGifUrl(tpl.thumbnail? resolveVars(tpl.thumbnail, member) : null),
    ]);
    const tplResolved = { ...tpl, image: resolvedImage, thumbnail: resolvedThumb };
    const { embed, content } = buildWelcomeEmbed(tplResolved, member);
    const sent = await channel.send({ content: content ?? undefined, embeds: [embed] });
    if (cfg.deleteAfterMs) setTimeout(() => sent.delete().catch(() => {}), cfg.deleteAfterMs);

    if (cfg.dmEnabled) {
      await member.send({ content: content ?? undefined, embeds: [embed] }).catch(() => {});
    }
  } catch (e) {
    console.error("[guildMemberAdd welcomer]", e);
  }

  // ── Anti‑nuke: detect bot additions ──
  if (member.user.bot) {
    const executorId = await getExecutor(member.guild, AuditLogEvent.BotAdd);
    if (executorId) {
      await antiNuke.handleEvent(member.guild, 'botAdd', executorId);
    }
  }
});



function startJailExpiryLoop() {
  const CHECK_INTERVAL = 30_000;
  setInterval(async () => {
    try {
      const { getAllActiveAcrossGuilds, clearActiveJail } = require("./services/jail");
      const now = Date.now();
      const active = getAllActiveAcrossGuilds();
      for (const entry of active) {
        if (!entry.expiresAt || entry.expiresAt > now) continue;
        try {
          const guild = client.guilds.cache.get(entry.guildId);
          if (!guild) { clearActiveJail(entry.guildId, entry.userId); continue; }
          const member = await guild.members.fetch(entry.userId).catch(() => null);
          if (member) {
            const rolesToRestore = (entry.roleSnapshot || []).filter((id) => guild.roles.cache.has(id));
            await member.roles.set(rolesToRestore).catch(() => {});
          }
          clearActiveJail(entry.guildId, entry.userId);
        } catch (e) {
          console.error("[jailExpiry entry]", e);
        }
      }
    } catch (e) {
      console.error("[jailExpiry]", e);
    }
  }, CHECK_INTERVAL);
}

function startReminderLoop() {
  const CHECK_INTERVAL = 30_000;
  setInterval(async () => {
    try {
      const due = getDueReminders();
      for (const r of due) {
        removeById(r.id);
        try {
          const guild   = client.guilds.cache.get(r.guildId);
          const channel = guild?.channels.cache.get(r.channelId);
          if (!channel) continue;
          const { EmbedBuilder } = require("discord.js");
          const { formatDuration } = require("./util/time");
          const elapsed = Date.now() - (r.createdAt ?? 0);
          await channel.send({
            content: `<@${r.userId}>`,
            embeds: [
              new EmbedBuilder()
                .setTitle("⏰  Reminder")
                .setDescription(`<@${r.userId}>, here is your reminder!`)
                .addFields(
                  { name: "📝 Message", value: r.text, inline: false },
                  { name: "⏱️ Time Elapsed", value: formatDuration(elapsed), inline: true },
                )
                .setColor(0x5865f2)
                .setFooter({ text: `Reminder #${r.id}` })
                .setTimestamp(),
            ],
          });
        } catch {}
      }
    } catch (e) {
      console.error("[reminderLoop]", e);
    }
  }, CHECK_INTERVAL);
}

deployCommands().catch(() => {});
client.login(token);