const { EmbedBuilder } = require("discord.js");
const { getUser, setUser, getGuild, setGuild } = require("../storage");
const https = require("https");

// ── Resolve Tenor / Giphy page URLs → direct media URLs for embed.setImage ───
// Discord embeds need a direct image URL; page URLs (tenor.com/view/…) don't work.
async function resolveGifUrl(url) {
  if (!url) return url;

  // Already a direct media URL — works fine in embeds
  if (/\.(gif|png|jpe?g|webp)(\?.*)?$/i.test(url)) return url;
  if (url.includes("media.tenor.com") || url.includes("media.giphy.com") ||
      url.includes("i.imgur.com") || url.includes("cdn.discordapp.com")) return url;

  // Tenor page URL: https://tenor.com/view/some-slug-GIFID
  const tenorMatch = url.match(/tenor\.com\/view\/[^/?#]+-(\d+)/i);
  if (tenorMatch) {
    try {
      const data = await new Promise((resolve, reject) => {
        https.get(
          `https://api.tenor.com/v1/gifs?ids=${tenorMatch[1]}&key=LIVDSRZULELA&media_filter=minimal`,
          { headers: { "User-Agent": "TofinBot/1.0" } },
          (res) => {
            let d = "";
            res.on("data", c => (d += c));
            res.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
          }
        ).on("error", reject);
      });
      const mediaUrl = data.results?.[0]?.media?.[0]?.gif?.url;
      if (mediaUrl) return mediaUrl;
    } catch { /* fall through and return original */ }
  }

  // Giphy page URL: https://giphy.com/gifs/something-GIFID
  const giphyMatch = url.match(/giphy\.com\/gifs\/(?:[^/]+-)?([A-Za-z0-9]+)\/?(?:[?#].*)?$/i);
  if (giphyMatch) {
    return `https://media.giphy.com/media/${giphyMatch[1]}/giphy.gif`;
  }

  return url; // unknown format — pass through unchanged
}

const TPL_STORE  = "welcome_templates";
const GUILD_STORE = "welcome_guilds";

// ── Template CRUD ─────────────────────────────────────────────────────────────

function getTemplate(userId, name) {
  return getUser(TPL_STORE, userId, {})[name] ?? null;
}

function listTemplates(userId) {
  return Object.values(getUser(TPL_STORE, userId, {}));
}

function saveTemplate(userId, name, data) {
  const all = getUser(TPL_STORE, userId, {});
  all[name] = { name, ...data, updatedAt: Date.now() };
  setUser(TPL_STORE, userId, all);
  return all[name];
}

function deleteTemplate(userId, name) {
  const all = getUser(TPL_STORE, userId, {});
  if (!all[name]) return false;
  delete all[name];
  setUser(TPL_STORE, userId, all);
  return true;
}

function createBlankTemplate(userId, name) {
  return saveTemplate(userId, name, {
    content:     "🎉 Welcome, {user}!",
    title:       "Welcome to {server_name}!",
    description: "Hey {user_display}, glad you're here! 🎉\n\n✦ Check out the rules\n✦ Grab some roles\n✦ Introduce yourself!",
    author:      null,
    footer:      "You are member #{server_membercount}",
    color:       "#5865F2",
    thumbnail:   "{user_avatar}",
    image:       null,
    fields:      null,
    createdAt:   Date.now(),
  });
}

// ── Guild config ──────────────────────────────────────────────────────────────

function getGuildConfig(guildId) {
  return getGuild(GUILD_STORE, guildId, null);
}

function setGuildConfig(guildId, config) {
  setGuild(GUILD_STORE, guildId, config);
}

function disableWelcomer(guildId) {
  const cfg = getGuildConfig(guildId) ?? {};
  setGuildConfig(guildId, { ...cfg, enabled: false });
}

function setLeaveConfig(guildId, changes) {
  const cfg = getGuildConfig(guildId) ?? {};
  setGuildConfig(guildId, { ...cfg, ...changes });
}

function disableLeaveMessages(guildId) {
  const cfg = getGuildConfig(guildId) ?? {};
  setGuildConfig(guildId, { ...cfg, leaveEnabled: false });
}

// ── Variable resolution ───────────────────────────────────────────────────────

function resolveVars(str, member) {
  if (!str) return str;
  const guild = member.guild;
  return str
    .replace(/\{user\}/g,               `<@${member.id}>`)
    .replace(/\{user_name\}/g,          member.user.username)
    .replace(/\{user_display\}/g,       member.displayName ?? member.user.username)
    .replace(/\{user_tag\}/g,           member.user.tag ?? member.user.username)
    .replace(/\{user_avatar\}/g,        member.user.displayAvatarURL({ size: 256 }))
    .replace(/\{server_name\}/g,        guild.name)
    .replace(/\{server_icon\}/g,        guild.iconURL({ size: 256 }) ?? "")
    .replace(/\{server_membercount\}/g, guild.memberCount.toString());
}

function resolveUrl(str, member) {
  if (!str) return null;
  const resolved = resolveVars(str, member);
  return resolved || null;
}

// ── Build embed from template + live member ────────────────────────────────────

function buildWelcomeEmbed(template, member) {
  const r  = (s) => (s ? resolveVars(s, member) : null);
  const ru = (s) => resolveUrl(s, member);

  const colorHex = parseColor(template.color);
  const embed = new EmbedBuilder().setColor(colorHex);

  if (template.title)       embed.setTitle(r(template.title));
  if (template.description) embed.setDescription(r(template.description));

  const thumb = ru(template.thumbnail);
  if (thumb) embed.setThumbnail(thumb);

  const img = ru(template.image);
  if (img) embed.setImage(img);

  if (template.footer) {
    const footerText = r(template.footer);
    if (footerText) embed.setFooter({ text: footerText });
  }

  if (template.author?.name) {
    const authorName = r(template.author.name);
    if (authorName) {
      const iconURL = ru(template.author.iconUrl);
      embed.setAuthor({ name: authorName, ...(iconURL ? { iconURL } : {}) });
    }
  }

  if (template.fields?.length) {
    embed.addFields(
      template.fields.slice(0, 3).map((f) => ({
        name:   r(f.name)  || "\u200b",
        value:  r(f.value) || "\u200b",
        inline: !!f.inline,
      }))
    );
  }

  const content = template.content ? r(template.content) : null;
  return { embed, content };
}

// ── Build preview embed using a real member ───────────────────────────────────

function buildPreviewEmbed(template, member) {
  const guild       = member.guild ?? member;
  const isReal      = !!member.user;
  const username    = isReal ? member.user.username  : "ExampleUser";
  const displayName = isReal ? (member.displayName ?? member.user.username) : "ExampleUser";
  const avatarUrl   = isReal
    ? member.user.displayAvatarURL({ size: 256 })
    : (guild.iconURL?.({ size: 256 }) ?? "");
  const memberCount = guild.memberCount?.toString() ?? "1";

  const r = (s) => s
    ?.replace(/\{user\}/g,               isReal ? `<@${member.id}>` : `@${username}`)
    .replace(/\{user_name\}/g,          username)
    .replace(/\{user_display\}/g,       displayName)
    .replace(/\{user_tag\}/g,           isReal ? (member.user.tag ?? username) : `${username}#0000`)
    .replace(/\{user_avatar\}/g,        avatarUrl)
    .replace(/\{server_name\}/g,        guild.name)
    .replace(/\{server_icon\}/g,        guild.iconURL?.({ size: 256 }) ?? "")
    .replace(/\{server_membercount\}/g, memberCount) ?? null;

  const colorHex = parseColor(template.color);
  const embed = new EmbedBuilder().setColor(colorHex);

  if (template.title)       embed.setTitle(r(template.title));
  if (template.description) embed.setDescription(r(template.description));

  const thumb = r(template.thumbnail);
  if (thumb) embed.setThumbnail(thumb);

  const img = r(template.image);
  if (img) embed.setImage(img);

  if (template.footer)      embed.setFooter({ text: r(template.footer) });

  if (template.author?.name) {
    const iconURL = r(template.author.iconUrl) || undefined;
    embed.setAuthor({ name: r(template.author.name), ...(iconURL ? { iconURL } : {}) });
  }

  if (template.fields?.length) {
    embed.addFields(
      template.fields.slice(0, 3).map((f) => ({
        name:   r(f.name)  || "\u200b",
        value:  r(f.value) || "\u200b",
        inline: !!f.inline,
      }))
    );
  }

  const content = template.content ? r(template.content) : null;
  return { embed, content };
}

// ── Builder control-panel embed ───────────────────────────────────────────────
// Shown as the FIRST embed in the builder message.

function buildBuilderEmbed(tpl) {
  const short = (s, len = 48) =>
    s ? `\`${s.slice(0, len)}${s.length > len ? "…" : ""}\`` : "_not set_";
  const check = (s) => (s ? "✅" : "⬜");

  const fieldsVal = tpl.fields?.length
    ? tpl.fields.map((f) => `\`${(f.name || "").slice(0, 18)}\``).join(", ")
    : "_not set_";

  const colorVal = tpl.color
    ? parseInt(tpl.color.replace("#", ""), 16) || 0x5865F2
    : 0x5865F2;

  return new EmbedBuilder()
    .setTitle(`✏️  Welcome Builder — "${tpl.name}"`)
    .setDescription(
      "Click any button below to edit that field.\n" +
      "**The preview updates automatically after each save ↓**\n\u200b"
    )
    .addFields(
      { name: `${check(tpl.content)} 📨 Message`,     value: short(tpl.content),        inline: true  },
      { name: `${check(tpl.title)} 📝 Title`,         value: short(tpl.title),          inline: true  },
      { name: `${check(tpl.footer)} 📋 Footer`,       value: short(tpl.footer),         inline: true  },
      { name: `${check(tpl.description)} 📄 Description`, value: short(tpl.description, 70), inline: false },
      { name: `${check(tpl.author?.name)} 👤 Author`, value: short(tpl.author?.name),   inline: true  },
      { name: `${check(tpl.color)} 🎨 Color`,         value: tpl.color ? `\`${tpl.color}\`` : "_not set_", inline: true },
      { name: `${check(tpl.thumbnail)} 🖼️ Thumbnail`, value: short(tpl.thumbnail),      inline: true  },
      { name: `${check(tpl.image)} 🌄 Banner / GIF`,  value: short(tpl.image),          inline: true  },
      { name: `${check(tpl.fields?.length)} 🔧 Fields`, value: fieldsVal,               inline: true  },
      { name: "\u200b",                                value: "\u200b",                  inline: true  },
      {
        name: "📌 Variables",
        value:
          "`{user}` `{user_name}` `{user_display}` `{user_avatar}`\n" +
          "`{server_name}` `{server_icon}` `{server_membercount}`",
        inline: false,
      },
    )
    .setColor(colorVal)
    .setFooter({ text: "✅ = set  •  ⬜ = not set  •  Saves automatically on submit" })
    .setTimestamp();
}

// ── Live preview embed ────────────────────────────────────────────────────────
// Shown as the SECOND embed in the builder message.
// Uses the builder's real profile so they see exactly what the welcome looks like.

function buildLivePreviewEmbed(tpl, member) {
  const { embed, content } = buildPreviewEmbed(tpl, member);
  const existing = embed.data?.footer?.text;
  embed.setFooter({
    text: existing
      ? `${existing}  •  👁️ Live Preview`
      : "👁️ Live Preview — using your profile as example",
  });
  return { embed, content };
}

// ── Color parser ──────────────────────────────────────────────────────────────

function parseColor(color) {
  if (!color) return 0x5865F2;
  const hex = color.replace("#", "");
  const val = parseInt(hex, 16);
  return isNaN(val) ? 0x5865F2 : val;
}

module.exports = {
  getTemplate, listTemplates, saveTemplate, deleteTemplate, createBlankTemplate,
  getGuildConfig, setGuildConfig, disableWelcomer,
  setLeaveConfig, disableLeaveMessages,
  resolveVars, resolveGifUrl, buildWelcomeEmbed, buildPreviewEmbed,
  buildBuilderEmbed, buildLivePreviewEmbed,
  parseColor,
};
