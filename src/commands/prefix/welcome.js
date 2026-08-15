const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, ChannelType,
} = require("discord.js");
const {
  getTemplate, listTemplates, deleteTemplate, createBlankTemplate,
  getGuildConfig, setGuildConfig, disableWelcomer,
  setLeaveConfig, disableLeaveMessages,
  buildPreviewEmbed, buildBuilderEmbed, buildLivePreviewEmbed,
  resolveVars, resolveGifUrl,
} = require("../../services/welcomer");
const { success, info, danger, warn } = require("../../util/embed");

const isAdmin = (message) =>
  message.member.permissions.has(PermissionFlagsBits.Administrator);

// ── Builder button rows ───────────────────────────────────────────────────────

function builderRows(userId, templateName) {
  const key = `${userId}:${templateName}`;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wlc_content:${key}`).setLabel("Message").setStyle(ButtonStyle.Secondary).setEmoji("📨"),
      new ButtonBuilder().setCustomId(`wlc_title:${key}`).setLabel("Title").setStyle(ButtonStyle.Secondary).setEmoji("📝"),
      new ButtonBuilder().setCustomId(`wlc_desc:${key}`).setLabel("Description").setStyle(ButtonStyle.Secondary).setEmoji("📄"),
      new ButtonBuilder().setCustomId(`wlc_author:${key}`).setLabel("Author").setStyle(ButtonStyle.Secondary).setEmoji("👤"),
      new ButtonBuilder().setCustomId(`wlc_footer:${key}`).setLabel("Footer").setStyle(ButtonStyle.Secondary).setEmoji("📋"),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wlc_color:${key}`).setLabel("Color").setStyle(ButtonStyle.Secondary).setEmoji("🎨"),
      new ButtonBuilder().setCustomId(`wlc_thumb:${key}`).setLabel("Thumbnail").setStyle(ButtonStyle.Secondary).setEmoji("🖼️"),
      new ButtonBuilder().setCustomId(`wlc_image:${key}`).setLabel("Banner / GIF").setStyle(ButtonStyle.Secondary).setEmoji("🌄"),
      new ButtonBuilder().setCustomId(`wlc_fields:${key}`).setLabel("Fields").setStyle(ButtonStyle.Secondary).setEmoji("🔧"),
      new ButtonBuilder().setCustomId(`wlc_test:${key}`).setLabel("Test Send").setStyle(ButtonStyle.Success).setEmoji("📤"),
    ),
  ];
}

// ── Command ───────────────────────────────────────────────────────────────────

module.exports = {
  name: "welcome",
  aliases: ["welcomer", "wlc"],
  async run(message, args) {
    const sub = args[0]?.toLowerCase();

    // ── create ────────────────────────────────────────────────────────────────
    if (sub === "create") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      const name = args.slice(1).join(" ");
      if (!name) return message.reply({ embeds: [warn("Missing Name", "Usage: `,welcome create <name>`")] });
      if (getTemplate(message.author.id, name)) {
        return message.reply({ embeds: [warn("Already Exists", `Template **${name}** already exists.\nUse \`,welcome edit ${name}\` to edit it.`)] });
      }
      const tpl = createBlankTemplate(message.author.id, name);
      const { embed: previewEmbed } = buildLivePreviewEmbed(tpl, message.member);
      return message.reply({
        embeds: [buildBuilderEmbed(tpl), previewEmbed],
        components: builderRows(message.author.id, name),
      });
    }

    // ── edit ──────────────────────────────────────────────────────────────────
    if (sub === "edit") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      const name = args.slice(1).join(" ");
      if (!name) return message.reply({ embeds: [warn("Missing Name", "Usage: `,welcome edit <name>`")] });
      const tpl = getTemplate(message.author.id, name);
      if (!tpl) return message.reply({ embeds: [danger("Not Found", `No template named **${name}**.\nCreate one with \`,welcome create ${name}\`.`)] });
      const { embed: previewEmbed } = buildLivePreviewEmbed(tpl, message.member);
      return message.reply({
        embeds: [buildBuilderEmbed(tpl), previewEmbed],
        components: builderRows(message.author.id, name),
      });
    }

    // ── list ──────────────────────────────────────────────────────────────────
    if (sub === "list") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      const list = listTemplates(message.author.id);
      const desc = list.length
        ? list.map((t) => `• **${t.name}** — saved <t:${Math.floor((t.updatedAt ?? t.createdAt) / 1000)}:R>`).join("\n")
        : "_No welcome templates yet._\n\nCreate one with `,welcome create <name>`.";
      return message.reply({ embeds: [info("🎉 Your Welcome Templates", desc)] });
    }

    // ── delete ────────────────────────────────────────────────────────────────
    if (sub === "delete") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      const name = args.slice(1).join(" ");
      if (!name) return message.reply({ embeds: [warn("Missing Name", "Usage: `,welcome delete <name>`")] });
      const deleted = deleteTemplate(message.author.id, name);
      if (!deleted) return message.reply({ embeds: [danger("Not Found", `No template named **${name}** in your account.`)] });
      return message.reply({ embeds: [success("Deleted!", `Welcome template **${name}** permanently deleted.`)] });
    }

    // ── set channel ───────────────────────────────────────────────────────────
    if (sub === "set" && args[1]?.toLowerCase() === "channel") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      const channel = message.mentions.channels.first()
        ?? message.guild.channels.cache.get(args[2]);
      if (!channel || channel.type !== ChannelType.GuildText) {
        return message.reply({ embeds: [warn("Invalid Channel", "Mention a text channel.\nUsage: `,welcome set channel #channel`")] });
      }
      const cfg = getGuildConfig(message.guild.id) ?? {};
      setGuildConfig(message.guild.id, { ...cfg, channelId: channel.id });
      return message.reply({ embeds: [success("Channel Set!", `Welcome messages will go to ${channel}.`)] });
    }

    // ── set template ──────────────────────────────────────────────────────────
    if (sub === "set" && args[1]?.toLowerCase() === "template") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      const name = args.slice(2).join(" ");
      if (!name) return message.reply({ embeds: [warn("Missing Name", "Usage: `,welcome set template <name>`")] });
      const tpl = getTemplate(message.author.id, name);
      if (!tpl) return message.reply({ embeds: [danger("Not Found", `No template named **${name}** in your account.`)] });
      const cfg = getGuildConfig(message.guild.id) ?? {};
      setGuildConfig(message.guild.id, { ...cfg, templateOwner: message.author.id, templateName: name, enabled: true });
      return message.reply({ embeds: [success("Template Set!", `Server now uses **${name}** for welcome messages. Welcomer is **enabled** ✅`)] });
    }

    // ── set leavechannel ──────────────────────────────────────────────────────
    if (sub === "set" && args[1]?.toLowerCase() === "leavechannel") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      const channel = message.mentions.channels.first()
        ?? message.guild.channels.cache.get(args[2]);
      if (!channel || channel.type !== ChannelType.GuildText) {
        return message.reply({ embeds: [warn("Invalid Channel", "Mention a text channel.\nUsage: `,welcome set leavechannel #channel`")] });
      }
      setLeaveConfig(message.guild.id, { leaveChannelId: channel.id });
      return message.reply({ embeds: [success("Leave Channel Set!", `Goodbye messages will go to ${channel}.`)] });
    }

    // ── set leavetemplate ─────────────────────────────────────────────────────
    if (sub === "set" && args[1]?.toLowerCase() === "leavetemplate") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      const name = args.slice(2).join(" ");
      if (!name) return message.reply({ embeds: [warn("Missing Name", "Usage: `,welcome set leavetemplate <name>`\n(Uses the same templates as `,welcome create`.)")] });
      const tpl = getTemplate(message.author.id, name);
      if (!tpl) return message.reply({ embeds: [danger("Not Found", `No template named **${name}** in your account.`)] });
      setLeaveConfig(message.guild.id, { leaveTemplateOwner: message.author.id, leaveTemplateName: name, leaveEnabled: true });
      return message.reply({ embeds: [success("Leave Template Set!", `Server now uses **${name}** for goodbye messages. Leave messages are **enabled** ✅`)] });
    }

    // ── leave enable/disable ──────────────────────────────────────────────────
    if (sub === "leaveenable") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      const cfg = getGuildConfig(message.guild.id);
      if (!cfg?.leaveTemplateName) return message.reply({ embeds: [warn("No Template", "Set one first: `,welcome set leavetemplate <name>`")] });
      if (!cfg?.leaveChannelId)    return message.reply({ embeds: [warn("No Channel",  "Set one first: `,welcome set leavechannel #channel`")] });
      setLeaveConfig(message.guild.id, { leaveEnabled: true });
      return message.reply({ embeds: [success("Leave Messages Enabled!", "Departing members will trigger a goodbye message.")] });
    }

    if (sub === "leavedisable") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      disableLeaveMessages(message.guild.id);
      return message.reply({ embeds: [success("Leave Messages Disabled", "Goodbye messages paused until re-enabled.")] });
    }

    // ── leave test ────────────────────────────────────────────────────────────
    if (sub === "leavetest") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      const cfg = getGuildConfig(message.guild.id);
      if (!cfg?.leaveTemplateName || !cfg?.leaveTemplateOwner) {
        return message.reply({ embeds: [warn("Not Configured", "Set a leave template first: `,welcome set leavetemplate <name>`")] });
      }
      const tpl = getTemplate(cfg.leaveTemplateOwner, cfg.leaveTemplateName);
      if (!tpl) return message.reply({ embeds: [danger("Template Missing", "The configured leave template no longer exists.")] });
      const { embed, content } = buildPreviewEmbed(tpl, message.member);
      return message.reply({
        content: content ? `${content}\n-# 🧪 Test — using your profile as preview` : `-# 🧪 Test — using your profile as preview`,
        embeds: [embed],
      });
    }

    // ── dm toggle ──────────────────────────────────────────────────────────────
    if (sub === "dm") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      const state = args[1]?.toLowerCase();
      if (!["on", "off"].includes(state)) {
        return message.reply({ embeds: [warn("Usage", "`,welcome dm on` / `,welcome dm off` — also DM new members the welcome message")] });
      }
      setLeaveConfig(message.guild.id, { dmEnabled: state === "on" });
      return message.reply({ embeds: [success("DM Welcome Updated", `New members will ${state === "on" ? "also be DM'd" : "no longer be DM'd"} the welcome message.`)] });
    }

    // ── auto-delete ────────────────────────────────────────────────────────────
    if (sub === "set" && args[1]?.toLowerCase() === "deleteafter") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      const seconds = parseInt(args[2]);
      if (isNaN(seconds) || seconds < 0) {
        return message.reply({ embeds: [warn("Usage", "`,welcome set deleteafter <seconds>` — 0 disables auto-delete")] });
      }
      setLeaveConfig(message.guild.id, { deleteAfterMs: seconds > 0 ? seconds * 1000 : 0 });
      return message.reply({ embeds: [success("Auto-Delete Updated", seconds > 0 ? `Welcome/goodbye messages will auto-delete after **${seconds}s**.` : "Auto-delete disabled — messages stay forever.")] });
    }

    // ── enable ────────────────────────────────────────────────────────────────
    if (sub === "enable") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      const cfg = getGuildConfig(message.guild.id);
      if (!cfg?.templateName) return message.reply({ embeds: [warn("No Template", "Set one first: `,welcome set template <name>`")] });
      if (!cfg?.channelId)    return message.reply({ embeds: [warn("No Channel",  "Set one first: `,welcome set channel #channel`")] });
      setGuildConfig(message.guild.id, { ...cfg, enabled: true });
      return message.reply({ embeds: [success("Welcomer Enabled!", "New members will receive a welcome message.")] });
    }

    // ── disable ───────────────────────────────────────────────────────────────
    if (sub === "disable") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      disableWelcomer(message.guild.id);
      return message.reply({ embeds: [success("Welcomer Disabled", "Welcome messages paused until re-enabled.")] });
    }

    // ── test ──────────────────────────────────────────────────────────────────
    if (sub === "test") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      const cfg = getGuildConfig(message.guild.id);
      if (!cfg?.templateName || !cfg?.templateOwner) {
        return message.reply({ embeds: [warn("Not Configured", "Set a template first: `,welcome set template <name>`")] });
      }
      const tpl = getTemplate(cfg.templateOwner, cfg.templateName);
      if (!tpl) return message.reply({ embeds: [danger("Template Missing", "The configured template no longer exists.")] });
      // Resolve Tenor/Giphy page URLs → direct media URLs so setImage works
      const member = message.member;
      const [resolvedImage, resolvedThumb] = await Promise.all([
        resolveGifUrl(tpl.image     ? resolveVars(tpl.image,     member) : null),
        resolveGifUrl(tpl.thumbnail ? resolveVars(tpl.thumbnail, member) : null),
      ]);
      const tplResolved = { ...tpl, image: resolvedImage, thumbnail: resolvedThumb };
      const { embed, content } = buildPreviewEmbed(tplResolved, member);
      return message.reply({
        content: content
          ? `${content}\n-# 🧪 Test — using your profile as preview`
          : `-# 🧪 Test — using your profile as preview`,
        embeds: [embed],
      });
    }

    // ── info ──────────────────────────────────────────────────────────────────
    if (sub === "info") {
      if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });
      const cfg = getGuildConfig(message.guild.id);
      if (!cfg) {
        return message.reply({ embeds: [info("Welcomer Config", "_Not set up yet._\n\n`,welcome set channel #channel` — set the channel\n`,welcome set template <name>` — pick a template")] });
      }
      const ch  = cfg.channelId    ? `<#${cfg.channelId}>`     : "_not set_";
      const tpl = cfg.templateName ? `**${cfg.templateName}**` : "_not set_";
      const st  = cfg.enabled      ? "✅ Enabled"               : "❌ Disabled";
      const leaveCh  = cfg.leaveChannelId    ? `<#${cfg.leaveChannelId}>`     : "_not set_";
      const leaveTpl = cfg.leaveTemplateName ? `**${cfg.leaveTemplateName}**` : "_not set_";
      const leaveSt  = cfg.leaveEnabled      ? "✅ Enabled"                   : "❌ Disabled";
      const dm = cfg.dmEnabled ? "✅ On" : "❌ Off";
      const del = cfg.deleteAfterMs ? `${cfg.deleteAfterMs / 1000}s` : "Off";
      return message.reply({ embeds: [info("Welcomer Config",
        `**Welcome**\n**Status:** ${st}\n**Channel:** ${ch}\n**Template:** ${tpl}\n**DM Welcome:** ${dm}\n\n` +
        `**Leave / Goodbye**\n**Status:** ${leaveSt}\n**Channel:** ${leaveCh}\n**Template:** ${leaveTpl}\n\n` +
        `**Auto-Delete:** ${del}`
      )] });
    }

    // ── fallback / help ───────────────────────────────────────────────────────
    if (!isAdmin(message)) return message.reply({ embeds: [danger("Missing Permission", "Requires Administrator.")] });

    return message.reply({ embeds: [info("Welcomer — Commands",
      "**Build templates:**\n" +
      "`,welcome create <name>` — create a template (opens live builder)\n" +
      "`,welcome edit <name>` — re-open the builder\n" +
      "`,welcome list` — list all your templates\n" +
      "`,welcome delete <name>` — delete a template\n\n" +
      "**Configure welcome:**\n" +
      "`,welcome set channel #channel` — where to send welcome messages\n" +
      "`,welcome set template <name>` — which template to use\n" +
      "`,welcome enable` / `,welcome disable` — toggle on/off\n" +
      "`,welcome test` — send a full test using your own profile\n" +
      "`,welcome dm on` / `,welcome dm off` — also DM new members\n" +
      "`,welcome set deleteafter <seconds>` — auto-delete after N seconds (0 = never)\n\n" +
      "**Configure goodbye messages:**\n" +
      "`,welcome set leavechannel #channel` — where to send goodbye messages\n" +
      "`,welcome set leavetemplate <name>` — which template to use (reuses your templates)\n" +
      "`,welcome leaveenable` / `,welcome leavedisable` — toggle on/off\n" +
      "`,welcome leavetest` — preview a goodbye message\n\n" +
      "`,welcome info` — show current config\n\n" +
      "**Variables:**\n" +
      "`{user}` — mention/ping the user\n" +
      "`{user_name}` — username  •  `{user_display}` — display name\n" +
      "`{user_avatar}` — avatar URL\n" +
      "`{server_name}` `{server_icon}` `{server_membercount}`\n\n" +
      "**Tips:**\n" +
      "• Use `{user}` in **Message** to ping on join\n" +
      "• **Banner / GIF** supports animated `.gif` URLs\n" +
      "• **Fields** adds up to 3 custom inline fields to the embed\n" +
      "• Hit **📤 Test Send** in the builder to preview in the channel"
    )] });
  },
};
