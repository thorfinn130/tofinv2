const { ChannelType, PermissionsBitField, PermissionFlagsBits } = require("discord.js");
const { read, write, getUser, setUser } = require("../storage");
const crypto = require("crypto");

const STORE = "templates";
const LINKS = "tpl_links";
const MODES = ["roles", "channels", "bots", "emojis", "stickers"];

function listTemplates(userId) {
  return Object.values(getUser(STORE, userId, {}));
}

function getTemplate(userId, name) {
  return getUser(STORE, userId, {})[name];
}

function saveTemplate(guild, userId, name) {
  // Save bot entries: id, username, roles
  const botRoles = [];
  guild.members.cache
    .filter((m) => m.user.bot)
    .forEach((m) => {
      botRoles.push({
        botId:   m.user.id,
        botName: m.user.username,
        roles:   m.roles.cache
          .filter((r) => r.name !== "@everyone")
          .map((r) => r.name),
      });
    });

  const tpl = {
    name,
    createdAt: Date.now(),

    // ── Roles ──────────────────────────────────────────────────────────────
    roles: guild.roles.cache
      .filter((r) => r.name !== "@everyone" && !r.managed)
      .map((r) => ({
        name:        r.name,
        color:       r.color,
        hoist:       r.hoist,
        mentionable: r.mentionable,
        permissions: r.permissions.bitfield.toString(),
        position:    r.rawPosition,
      })),

    // ── Channels (with permission overwrites) ──────────────────────────────
    channels: guild.channels.cache.map((c) => ({
      id:       c.id,
      name:     c.name,
      type:     c.type,
      parentId: c.parentId,
      topic:    c.topic  ?? null,
      nsfw:     c.nsfw   ?? false,
      position: c.rawPosition,
      // Save permission overwrites with role names for cross-server portability
      permissionOverwrites: (c.permissionOverwrites?.cache ?? []).map
        ? [...(c.permissionOverwrites?.cache ?? new Map()).values()].map((ow) => ({
            id:       ow.id,
            type:     ow.type, // 0 = role, 1 = member
            allow:    ow.allow.bitfield.toString(),
            deny:     ow.deny.bitfield.toString(),
            roleName: ow.type === 0
              ? (guild.roles.cache.get(ow.id)?.name ?? null)
              : null,
          }))
        : [],
    })),

    botRoles,

    // ── Emojis ────────────────────────────────────────────────────────────────
    emojis: guild.emojis.cache.map((e) => ({
      name:      e.name,
      url:       e.imageURL({ extension: e.animated ? "gif" : "png" }),
      animated:  e.animated,
    })),

    // ── Stickers ──────────────────────────────────────────────────────────────
    // Skip Lottie (format 3) — those are JSON animation files, not images, and can't be re-uploaded this way.
    stickers: guild.stickers.cache
      .filter((s) => s.type === 2 && s.format !== 3) // type 2 = GUILD sticker (uploaded by this server)
      .map((s) => ({
        name:        s.name,
        description: s.description ?? "",
        tags:        s.tags ?? "",
        url:         s.url,
        format:      s.format, // 1=PNG, 2=APNG, 4=GIF
      })),
  };

  const all = getUser(STORE, userId, {});
  all[name] = tpl;
  setUser(STORE, userId, all);
  return tpl;
}

// Accepts the last arg as either a single mode ("roles"), a comma-separated
// list ("roles,channels,stickers"), or omitted entirely (defaults to "full").
// Returns { modes: string[], name } where modes always contains at least one entry.
function parseModeAndName(args) {
  const last = args[args.length - 1] ?? "";
  const candidateModes = last
    .toLowerCase()
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const allValid = candidateModes.length > 0 && candidateModes.every((m) => MODES.includes(m));

  if (allValid) {
    return { modes: candidateModes, name: args.slice(0, -1).join(" ") };
  }
  return { modes: ["full"], name: args.join(" ") };
}

// Backwards-compatible single-mode check used by applyTemplate's per-section gates.
function modeIncludes(modes, section) {
  return modes.includes("full") || modes.includes(section);
}

// Build an OAuth2 bot-invite URL for a given bot client ID
function botInviteUrl(botId, permissions = 8n) {
  return `https://discord.com/oauth2/authorize?client_id=${botId}&scope=bot%20applications.commands&permissions=${permissions}`;
}

async function applyTemplate(guild, tpl, modes = ["full"], owner = null) {
  // Accept a plain string for backwards compatibility with any old call sites.
  if (typeof modes === "string") modes = [modes];

  // ── LOCK all channels ────────────────────────────────────────────────────
  if (modeIncludes(modes, "channels")) {
    await Promise.all(
      guild.channels.cache.map((ch) =>
        ch.permissionOverwrites?.edit(guild.roles.everyone, { ViewChannel: false }).catch(() => {})
      )
    );
  }

  // ── DELETE old channels ──────────────────────────────────────────────────
  if (modeIncludes(modes, "channels")) {
    for (const [, ch] of guild.channels.cache) {
      await ch.delete("Template load: clearing old channels").catch(() => {});
    }
  }

  // ── DELETE old roles ─────────────────────────────────────────────────────
  if (modeIncludes(modes, "roles")) {
    for (const [, role] of guild.roles.cache) {
      if (role.name === "@everyone" || role.managed || role.id === guild.id) continue;
      await role.delete("Template load: clearing old roles").catch(() => {});
    }
  }

  // ── DELETE old emojis ─────────────────────────────────────────────────────
  if (modeIncludes(modes, "emojis")) {
    for (const [, emoji] of guild.emojis.cache) {
      await emoji.delete("Template load: clearing old emojis").catch(() => {});
    }
  }

  // ── DELETE old stickers ───────────────────────────────────────────────────
  if (modeIncludes(modes, "stickers")) {
    for (const [, sticker] of guild.stickers.cache) {
      if (sticker.type !== 2) continue; // never touch standard/Nitro pack stickers
      await sticker.delete("Template load: clearing old stickers").catch(() => {});
    }
  }

  // ── CREATE new roles ─────────────────────────────────────────────────────
  const roleMap = new Map(); // roleName → Role
  if (modeIncludes(modes, "roles") || modes.includes("bots")) {
    // Sort DESCENDING so the lowest-position roles are created last.
    // Discord inserts new roles at position 1 each time, pushing previous ones up.
    // Creating high-position roles first means they get pushed to the top naturally.
    const sorted = [...tpl.roles].sort((a, b) => b.position - a.position);
    for (const r of sorted) {
      const created = await guild.roles.create({
        name:        r.name,
        color:       r.color,
        hoist:       r.hoist,
        mentionable: r.mentionable,
        permissions: new PermissionsBitField(BigInt(r.permissions)),
        reason:      `Template load: ${tpl.name}`,
      }).catch(() => null);
      if (created) roleMap.set(r.name, created);
    }

    // Re-apply positions using normalized sequential ranks (1, 2, 3…) so the
    // relative order is always preserved regardless of the source server's
    // position numbers, and always stays within the bot's own role ceiling.
    const positionData = [...tpl.roles]
      .sort((a, b) => a.position - b.position)   // lowest saved pos first
      .reduce((acc, r, idx) => {
        const role = roleMap.get(r.name);
        if (role) acc.push({ role: role.id, position: idx + 1 }); // 1-based ranks
        return acc;
      }, []);
    if (positionData.length) {
      await guild.roles.setPositions(positionData).catch(() => {});
    }
  }

  // ── ASSIGN bot roles ─────────────────────────────────────────────────────
  const missingBots = []; // bots not in this guild
  if (modeIncludes(modes, "bots") && tpl.botRoles?.length) {
    await guild.members.fetch();
    for (const entry of tpl.botRoles) {
      const member = guild.members.cache.get(entry.botId);
      if (!member) {
        missingBots.push(entry);
        continue;
      }
      for (const roleName of entry.roles) {
        const role = roleMap.get(roleName) ?? guild.roles.cache.find((r) => r.name === roleName);
        if (role) await member.roles.add(role).catch(() => {});
      }
    }
  }

  // ── CREATE new emojis ─────────────────────────────────────────────────────
  const emojiResult = { added: 0, failed: [] };
  if (modeIncludes(modes, "emojis") && tpl.emojis?.length) {
    for (const e of tpl.emojis) {
      try {
        await guild.emojis.create({ attachment: e.url, name: e.name, reason: `Template load: ${tpl.name}` });
        emojiResult.added++;
      } catch (err) {
        emojiResult.failed.push({ name: e.name, reason: err.message?.includes("Maximum") ? "slot limit reached" : "failed" });
      }
    }
  }

  // ── CREATE new stickers ───────────────────────────────────────────────────
  const stickerResult = { added: 0, failed: [] };
  if (modeIncludes(modes, "stickers") && tpl.stickers?.length) {
    for (const s of tpl.stickers) {
      try {
        await guild.stickers.create({
          file: s.url,
          name: s.name,
          tags: s.tags || s.name,
          description: s.description || undefined,
          reason: `Template load: ${tpl.name}`,
        });
        stickerResult.added++;
      } catch (err) {
        stickerResult.failed.push({ name: s.name, reason: err.message?.includes("Maximum") ? "slot limit reached" : "failed" });
      }
    }
  }

  // ── CREATE new channels (with permission overwrites) ──────────────────────
  if (modeIncludes(modes, "channels")) {
    const idMap = new Map(); // old channel id → new channel id

    // Categories first
    const cats = tpl.channels
      .filter((c) => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    for (const c of cats) {
      const overwrites = buildOverwrites(c, guild, roleMap);
      const created = await guild.channels.create({
        name:                 c.name,
        type:                 ChannelType.GuildCategory,
        // Only set overwrites if there are real ones; otherwise let Discord default
        ...(overwrites.length ? { permissionOverwrites: overwrites } : {}),
      }).catch(() => null);
      if (created) idMap.set(c.id, created.id);
    }

    // Other channels
    const others = tpl.channels
      .filter((c) => c.type !== ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    for (const c of others) {
      const overwrites = buildOverwrites(c, guild, roleMap);
      const parentId   = c.parentId ? (idMap.get(c.parentId) ?? undefined) : undefined;
      await guild.channels.create({
        name:   c.name,
        type:   c.type,
        parent: parentId,
        topic:  c.topic ?? undefined,
        nsfw:   c.nsfw  ?? false,
        // If no explicit overwrites were saved, omit the field so the channel
        // inherits from its parent category (preserves private staff channels, etc.)
        ...(overwrites.length ? { permissionOverwrites: overwrites } : {}),
      }).catch(() => {});
    }
  }

  // ── DM owner when done ───────────────────────────────────────────────────
  if (owner) {
    const labelMap = { roles: "roles", channels: "channels", bots: "bot roles", emojis: "emojis", stickers: "stickers" };
    const modeLabel = modes.includes("full")
      ? "everything (roles, channels, bots, emojis & stickers)"
      : modes.map((m) => labelMap[m] ?? m).join(", ");

    let inviteSection = "";
    if (missingBots.length) {
      const links = missingBots
        .map((b) => `• **${b.botName}** → ${botInviteUrl(b.botId)}`)
        .join("\n");
      inviteSection = `\n\n**⚠️ Missing bots — invite them manually:**\n${links}`;
    }

    let emojiSection = "";
    if (emojiResult.added || emojiResult.failed.length) {
      emojiSection = `\n\n**😀 Emojis:** ${emojiResult.added} added`;
      if (emojiResult.failed.length) {
        emojiSection += `, ${emojiResult.failed.length} failed (${emojiResult.failed.map((f) => `${f.name}: ${f.reason}`).join(", ")})`;
      }
    }

    let stickerSection = "";
    if (stickerResult.added || stickerResult.failed.length) {
      stickerSection = `\n\n**🏷️ Stickers:** ${stickerResult.added} added`;
      if (stickerResult.failed.length) {
        stickerSection += `, ${stickerResult.failed.length} failed (${stickerResult.failed.map((f) => `${f.name}: ${f.reason}`).join(", ")})`;
      }
    }

    await owner.send({
      embeds: [{
        title:       "✅  Template Load Complete",
        description: `**${tpl.name}** finished loading on **${guild.name}**.\nLoaded: **${modeLabel}**${inviteSection}${emojiSection}${stickerSection}`,
        color:       0x57F287,
        timestamp:   new Date().toISOString(),
      }],
    }).catch(() => {});
  }

  return { missingBots, emojiResult, stickerResult };
}

// ── Additive apply — never deletes/touches anything currently in the server ──
// Only adds the template's items for the given categories on top of what's already there.
async function applyTemplateAdditive(guild, tpl, categories) {
  const results = {};

  if (categories.includes("roles")) {
    const existingNames = new Set(guild.roles.cache.map((r) => r.name));
    let added = 0;
    const failed = [];
    for (const r of tpl.roles ?? []) {
      if (existingNames.has(r.name)) { failed.push({ name: r.name, reason: "already exists" }); continue; }
      try {
        await guild.roles.create({
          name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable,
          permissions: new PermissionsBitField(BigInt(r.permissions)),
          reason: `Template add: ${tpl.name}`,
        });
        added++;
      } catch (err) {
        failed.push({ name: r.name, reason: "failed" });
      }
    }
    results.roles = { added, failed };
  }

  if (categories.includes("channels")) {
    const roleMap = new Map(guild.roles.cache.map((r) => [r.name, r]));
    let added = 0;
    const failed = [];
    const idMap = new Map();

    const cats = (tpl.channels ?? []).filter((c) => c.type === ChannelType.GuildCategory);
    for (const c of cats) {
      try {
        const overwrites = buildOverwrites(c, guild, roleMap);
        const created = await guild.channels.create({
          name: c.name, type: ChannelType.GuildCategory,
          ...(overwrites.length ? { permissionOverwrites: overwrites } : {}),
        });
        idMap.set(c.id, created.id);
        added++;
      } catch {
        failed.push({ name: c.name, reason: "failed" });
      }
    }

    const others = (tpl.channels ?? []).filter((c) => c.type !== ChannelType.GuildCategory);
    for (const c of others) {
      try {
        const overwrites = buildOverwrites(c, guild, roleMap);
        const parentId = c.parentId ? (idMap.get(c.parentId) ?? undefined) : undefined;
        await guild.channels.create({
          name: c.name, type: c.type, parent: parentId,
          topic: c.topic ?? undefined, nsfw: c.nsfw ?? false,
          ...(overwrites.length ? { permissionOverwrites: overwrites } : {}),
        });
        added++;
      } catch {
        failed.push({ name: c.name, reason: "failed" });
      }
    }
    results.channels = { added, failed };
  }

  if (categories.includes("bots")) {
    await guild.members.fetch();
    const roleMap = new Map(guild.roles.cache.map((r) => [r.name, r]));
    let added = 0;
    const failed = [];
    for (const entry of tpl.botRoles ?? []) {
      const member = guild.members.cache.get(entry.botId);
      if (!member) { failed.push({ name: entry.botName, reason: "bot not in this server" }); continue; }
      let any = false;
      for (const roleName of entry.roles) {
        const role = roleMap.get(roleName);
        if (role && !member.roles.cache.has(role.id)) {
          await member.roles.add(role).catch(() => {});
          any = true;
        }
      }
      if (any) added++;
    }
    results.bots = { added, failed };
  }

  if (categories.includes("emojis")) {
    const existingNames = new Set(guild.emojis.cache.map((e) => e.name));
    let added = 0;
    const failed = [];
    for (const e of tpl.emojis ?? []) {
      if (existingNames.has(e.name)) { failed.push({ name: e.name, reason: "already exists" }); continue; }
      try {
        await guild.emojis.create({ attachment: e.url, name: e.name, reason: `Template add: ${tpl.name}` });
        added++;
      } catch (err) {
        failed.push({ name: e.name, reason: err.message?.includes("Maximum") ? "slot limit reached" : "failed" });
      }
    }
    results.emojis = { added, failed };
  }

  if (categories.includes("stickers")) {
    const existingNames = new Set(guild.stickers.cache.map((s) => s.name));
    let added = 0;
    const failed = [];
    for (const s of tpl.stickers ?? []) {
      if (existingNames.has(s.name)) { failed.push({ name: s.name, reason: "already exists" }); continue; }
      try {
        await guild.stickers.create({
          file: s.url, name: s.name, tags: s.tags || s.name,
          description: s.description || undefined, reason: `Template add: ${tpl.name}`,
        });
        added++;
      } catch (err) {
        failed.push({ name: s.name, reason: err.message?.includes("Maximum") ? "slot limit reached" : "failed" });
      }
    }
    results.stickers = { added, failed };
  }

  return results;
}

// Build a permission-overwrite array for a channel from saved data
function buildOverwrites(savedChannel, guild, roleMap) {
  if (!savedChannel.permissionOverwrites?.length) return [];

  const overwrites = [];
  for (const ow of savedChannel.permissionOverwrites) {
    if (ow.type !== 0) continue; // skip member overwrites (can't map cross-server)

    let targetId;
    if (ow.roleName === "@everyone") {
      targetId = guild.roles.everyone.id;
    } else if (ow.roleName) {
      const role = roleMap.get(ow.roleName)
        ?? guild.roles.cache.find((r) => r.name === ow.roleName);
      if (!role) continue;
      targetId = role.id;
    } else {
      continue;
    }

    overwrites.push({
      id:    targetId,
      allow: BigInt(ow.allow),
      deny:  BigInt(ow.deny),
    });
  }
  return overwrites;
}

async function loadTemplate(guild, userId, name, modes = ["full"], owner = null) {
  const tpl = getTemplate(userId, name);
  if (!tpl) throw new Error(`Template **${name}** not found in your account.`);
  const result = await applyTemplate(guild, tpl, modes, owner);
  return { tpl, ...result };
}

// Purely additive — never deletes/touches anything currently in the server.
async function addToServer(guild, userId, name, categories) {
  const tpl = getTemplate(userId, name);
  if (!tpl) throw new Error(`Template **${name}** not found in your account.`);
  const results = await applyTemplateAdditive(guild, tpl, categories);
  return { tpl, results };
}

// ── One-time share links ──────────────────────────────────────────────────────
function generateLink(userId, templateName) {
  const tpl = getTemplate(userId, templateName);
  if (!tpl) return null;
  const code  = crypto.randomBytes(6).toString("hex");
  const links = read(LINKS, {});
  links[code] = { userId, templateName, used: false, createdAt: Date.now() };
  write(LINKS, links);
  return code;
}

function useLink(code) {
  const links = read(LINKS, {});
  const entry = links[code];
  if (!entry)       return { error: "Invalid or expired link." };
  if (entry.used)   return { error: "This link has already been used." };
  const tpl = getTemplate(entry.userId, entry.templateName);
  if (!tpl)         return { error: "The template this link points to no longer exists." };
  links[code].used = true;
  write(LINKS, links);
  return { tpl };
}

function deleteTemplate(userId, name) {
  const all = getUser(STORE, userId, {});
  if (!all[name]) return false;
  delete all[name];
  setUser(STORE, userId, all);
  return true;
}

module.exports = {
  saveTemplate, loadTemplate, addToServer, listTemplates, getTemplate, deleteTemplate,
  generateLink, useLink, applyTemplate, applyTemplateAdditive, parseModeAndName, MODES,
};