const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { read, write } = require("../storage");

const STORE = "giveaways";

function _read()   { return read(STORE, { active: {}, config: {} }); }
function _write(d) { write(STORE, d); }

// ── CRUD ──────────────────────────────────────────────────────────────────────
function saveGiveaway(gw) {
  const d = _read();
  d.active[gw.messageId] = gw;
  _write(d);
}

function getGiveaway(messageId) {
  return _read().active[messageId] ?? null;
}

function removeGiveaway(messageId) {
  const d = _read();
  delete d.active[messageId];
  _write(d);
}

function getAllActive() {
  return Object.values(_read().active);
}

// ── Guild Config ──────────────────────────────────────────────────────────────
function getConfig(guildId) {
  return _read().config[guildId] ?? { managerRoles: [], creatorRoles: [] };
}

function setConfig(guildId, cfg) {
  const d = _read();
  d.config[guildId] = cfg;
  _write(d);
}

function hasManagerRole(member) {
  if (member.permissions.has("ManageGuild")) return true;
  const cfg = getConfig(member.guild.id);
  return cfg.managerRoles.some((id) => member.roles.cache.has(id));
}

function hasCreatorRole(member) {
  if (hasManagerRole(member)) return true;
  const cfg = getConfig(member.guild.id);
  return cfg.creatorRoles.some((id) => member.roles.cache.has(id));
}

// ── Embed & Buttons ───────────────────────────────────────────────────────────
const DEFAULT_COLOR     = 0x5865f2;
const DEFAULT_END_COLOR = 0xed4245;

function buildEmbed(gw, ended = false) {
  const color = ended ? (gw.endColor ?? DEFAULT_END_COLOR) : (gw.color ?? DEFAULT_COLOR);
  const entries = gw.entries?.length ?? 0;

  const winnerLine = ended && gw.winnerIds?.length
    ? `\n🏆 **Winner${gw.winnerIds.length > 1 ? "s" : ""}:** ${gw.winnerIds.map((id) => `<@${id}>`).join(", ")}`
    : "";

  const requirements = [];
  if (gw.requiredRoleId) requirements.push(`**Required Role:** <@&${gw.requiredRoleId}>`);
  const reqLine = requirements.length ? `\n${requirements.join("\n")}` : "";

  const lines = ended
    ? [
        `🎁 **Prize:** ${gw.prize}${winnerLine}`,
        `👤 **Hosted by:** <@${gw.hostId}>`,
        `🏆 **Winners:** ${gw.winnerCount}`,
        `👥 **Total Entries:** ${entries}`,
        reqLine,
        `\n*This giveaway has ended.*`,
      ]
    : [
        `🎁 **Prize:** ${gw.prize}`,
        `👤 **Hosted by:** <@${gw.hostId}>`,
        `🏆 **Winners:** ${gw.winnerCount}`,
        `👥 **Entries:** ${entries}`,
        reqLine,
        `\n⏰ **Ends:** <t:${Math.floor(gw.endsAt / 1000)}:R> (<t:${Math.floor(gw.endsAt / 1000)}:f>)`,
        `\n*Click **Join** to enter!*`,
      ];

  return new EmbedBuilder()
    .setTitle(ended ? "🏆  Giveaway Ended!" : "🎉  Giveaway!")
    .setDescription(lines.filter(Boolean).join("\n"))
    .setColor(color)
    .setFooter({ text: ended ? "Ended at" : "Ends at" })
    .setTimestamp(ended ? Date.now() : gw.endsAt);
}

function buildButtons(gw, ended = false) {
  if (ended) return [];

  const joinBtn = new ButtonBuilder()
    .setCustomId(`gw_join:${gw.messageId}`)
    .setLabel(`🎉 Join (${gw.entries?.length ?? 0})`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(false);

  const endBtn = new ButtonBuilder()
    .setCustomId(`gw_end:${gw.messageId}`)
    .setLabel("✅ End Early")
    .setStyle(ButtonStyle.Success);

  const cancelBtn = new ButtonBuilder()
    .setCustomId(`gw_cancel:${gw.messageId}`)
    .setLabel("✖ Cancel")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(joinBtn, endBtn, cancelBtn);
  return [row];
}

function buildMessage(gw, ended = false) {
  return {
    embeds:     [buildEmbed(gw, ended)],
    components: buildButtons(gw, ended),
  };
}

// ── Pick Winners (from stored entries array) ──────────────────────────────────
async function pickWinners(gw, guild, excludeIds = []) {
  const pool = (gw.entries ?? []).filter((id) => !excludeIds.includes(id));

  const eligible = [];
  for (const userId of pool) {
    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;

      if (gw.requiredRoleId && !member.roles.cache.has(gw.requiredRoleId)) continue;

      eligible.push(userId);
    } catch {
      eligible.push(userId);
    }
  }

  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  return eligible.slice(0, gw.winnerCount);
}

// ── End a Giveaway ────────────────────────────────────────────────────────────
async function endGiveaway(gw, client) {
  const guild = client.guilds.cache.get(gw.guildId);
  if (!guild) return removeGiveaway(gw.messageId);

  const channel = guild.channels.cache.get(gw.channelId);
  if (!channel) return removeGiveaway(gw.messageId);

  const winnerIds = await pickWinners(gw, guild);
  gw.winnerIds = winnerIds;
  gw.ended     = true;
  saveGiveaway(gw);

  const msg = await channel.messages.fetch(gw.messageId).catch(() => null);
  if (msg) await msg.edit(buildMessage(gw, true)).catch(() => {});

  if (!winnerIds.length) {
    await channel.send({ content: `❌ No valid entries for **${gw.prize}**. No winner selected.` }).catch(() => {});
    return;
  }

  const winMention = winnerIds.map((id) => `<@${id}>`).join(", ");
  const winMsg = gw.winMsg
    ? gw.winMsg.replace("{winners}", winMention).replace("{prize}", gw.prize)
    : `🎉 Congratulations ${winMention}! You won **${gw.prize}**!\n> [Jump to giveaway](https://discord.com/channels/${gw.guildId}/${gw.channelId}/${gw.messageId})`;

  await channel.send({ content: winMsg }).catch(() => {});

  if (gw.winnersRoleId) {
    for (const id of winnerIds) {
      const m = await guild.members.fetch(id).catch(() => null);
      if (m) await m.roles.add(gw.winnersRoleId).catch(() => {});
    }
  }

  if (gw.dmMsg) {
    for (const id of winnerIds) {
      const user = await client.users.fetch(id).catch(() => null);
      if (user) {
        const dm = gw.dmMsg.replace("{prize}", gw.prize).replace("{server}", guild.name);
        user.send(dm).catch(() => {});
      }
    }
  }

  // Keep the ended giveaway around (entries + winners) so ,giveaway reroll still works later.
  // It's excluded from getAllActive's "active" filtering via the `ended` flag, not deletion.
  saveGiveaway(gw);
}

// ── Timer Loop ────────────────────────────────────────────────────────────────
function startLoop(client) {
  setInterval(async () => {
    const now    = Date.now();
    const active = getAllActive().filter((gw) => !gw.ended && gw.endsAt <= now);
    for (const gw of active) {
      await endGiveaway(gw, client).catch((e) => console.error("[giveaway loop]", e));
    }
  }, 15_000);
}

module.exports = {
  saveGiveaway, getGiveaway, removeGiveaway, getAllActive,
  getConfig, setConfig, hasManagerRole, hasCreatorRole,
  buildEmbed, buildButtons, buildMessage,
  pickWinners, endGiveaway, startLoop,
};