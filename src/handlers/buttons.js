const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require("discord.js");
const { getTemplate, saveTemplate, buildPreviewEmbed, buildWelcomeEmbed, buildBuilderEmbed, buildLivePreviewEmbed, resolveVars, resolveGifUrl } = require("../services/welcomer");
const { success: successEmbed, danger: dangerEmbed, warn: warnEmbed } = require("../util/embed");
const { colors } = require("../config");

// ── helpers ──────────────────────────────────────────────────────────────────
function disableAll(row) {
  return new ActionRowBuilder().addComponents(
    row.components.map(b => ButtonBuilder.from(b).setDisabled(true))
  );
}

// ── Help category select ──────────────────────────────────────────────────────
async function handleHelpCat(interaction) {
  const [, userId] = interaction.customId.split(":");
  if (interaction.user.id !== userId) {
    return interaction.reply({ content: "❌ Run `,help` yourself to use the menu!", ephemeral: true });
  }

  const { categoryEmbed, buildMenu } = require("../commands/prefix/help");
  const selected = interaction.values[0];
  const who = { username: interaction.user.username, avatarURL: interaction.client.user.displayAvatarURL() };
  return interaction.update({
    embeds: [categoryEmbed(selected, who)],
    components: [buildMenu(userId, selected)],
  });
}

// ── Command toggle menu (,disable list / ,enable list) ───────────────────────
async function handleDisableCategory(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: "❌ You need **Administrator** to manage command toggles.", ephemeral: true });
  }
  const [, scope, channelToken] = interaction.customId.split(":");
  const channelId = channelToken === "none" ? null : channelToken;
  const categoryKey = interaction.values[0];

  const { buildToggleEmbed, buildToggleMenu } = require("../commands/prefix/disable");
  return interaction.update({
    embeds: [buildToggleEmbed(interaction.guild, categoryKey, scope, channelId)],
    components: buildToggleMenu(interaction.guild.id, categoryKey, scope, channelId),
  });
}

async function handleDisableToggle(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: "❌ You need **Administrator** to manage command toggles.", ephemeral: true });
  }
  const [, categoryKey, scope, channelToken] = interaction.customId.split(":");
  const channelId = channelToken === "none" ? null : channelToken;

  const CATEGORIES = require("../util/commandCategories");
  const { setCategoryState } = require("../services/commandToggle");
  const { buildToggleEmbed, buildToggleMenu } = require("../commands/prefix/disable");

  setCategoryState(interaction.guild.id, CATEGORIES[categoryKey].commands, interaction.values, channelId);

  return interaction.update({
    embeds: [buildToggleEmbed(interaction.guild, categoryKey, scope, channelId)],
    components: buildToggleMenu(interaction.guild.id, categoryKey, scope, channelId),
  });
}

async function handleDisableBack(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: "❌ You need **Administrator** to manage command toggles.", ephemeral: true });
  }
  const [, scope, channelToken] = interaction.customId.split(":");
  const channelId = channelToken === "none" ? null : channelToken;
  const channel = channelId ? interaction.guild.channels.cache.get(channelId) : null;

  const { buildOverviewEmbed, buildCategoryMenu } = require("../commands/prefix/disable");
  return interaction.update({
    embeds: [buildOverviewEmbed(interaction.guild, channel)],
    components: [buildCategoryMenu(scope, channelId)],
  });
}

// ── Server restart confirmation ───────────────────────────────────────────────
async function handleTrestart(interaction) {
  const parts  = interaction.customId.split(":");
  const action = parts[0];
  const userId = parts[1];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: "❌ Only the server owner can confirm this!", ephemeral: true });
  }

  if (action === "trestart_no") {
    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("✅  Restart Cancelled")
          .setDescription("Nothing was deleted. Your server is safe.")
          .setColor(0x57F287)
          .setTimestamp(),
      ],
      components: [],
    });
  }

  // trestart_yes — delete everything
  const guild = interaction.guild;

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle("🗑️  Restarting Server...")
        .setDescription("Deleting all channels, roles, and voice channels.\nThis may take a moment...")
        .setColor(0xED4245)
        .setTimestamp(),
    ],
    components: [],
  });

  // Fetch all members first
  await guild.members.fetch().catch(() => {});

  const botId = interaction.client.user.id;

  // Kick all bots (except ourselves)
  const botsToKick = guild.members.cache.filter(m => m.user.bot && m.id !== botId);
  for (const [, member] of botsToKick) {
    await member.kick("Server restart: ,restart").catch(() => {});
  }

  // Delete all channels
  for (const [, ch] of guild.channels.cache) {
    await ch.delete("Server restart: ,restart").catch(() => {});
  }

  // Delete all non-managed, non-everyone roles
  for (const [, role] of guild.roles.cache) {
    if (role.name === "@everyone" || role.managed || role.id === guild.id) continue;
    await role.delete("Server restart: ,restart").catch(() => {});
  }

  // DM the owner since channels are gone
  try {
    await interaction.user.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("✅  Server Restart Complete")
          .setDescription(
            `**${guild.name}** has been fully wiped.\n\n` +
            `> 🤖  All bots kicked (**${botsToKick.size}**)\n` +
            `> 🗑️  All channels deleted\n` +
            `> 🏷️  All roles deleted\n\n` +
            `The server is completely empty. Rebuild from scratch or use \`,template load <name>\`.`
          )
          .setColor(0x57F287)
          .setTimestamp(),
      ],
    });
  } catch {}
}

// ── Welcome builder — button handler ─────────────────────────────────────────
// customId format: wlc_<field>:<userId>:<templateName>
async function handleWelcomeBuilder(interaction) {
  const [actionFull, userId, ...nameParts] = interaction.customId.split(":");
  const templateName = nameParts.join(":");
  const field = actionFull.replace("wlc_", "");

  // Only the owner of the template can use its builder buttons
  if (interaction.user.id !== userId) {
    return interaction.reply({ content: "❌ Only the person who created this template can edit it.", ephemeral: true });
  }

  // Test Send — sends a real non-ephemeral welcome to the channel
  if (field === "test") {
    const tpl = getTemplate(userId, templateName);
    if (!tpl) return interaction.reply({ content: "❌ Template not found.", ephemeral: true });
    // Resolve Tenor/Giphy page URLs → direct media URLs so setImage works
    const member = interaction.member;
    const [resolvedImage, resolvedThumb] = await Promise.all([
      resolveGifUrl(tpl.image     ? resolveVars(tpl.image,     member) : null),
      resolveGifUrl(tpl.thumbnail ? resolveVars(tpl.thumbnail, member) : null),
    ]);
    const tplResolved = { ...tpl, image: resolvedImage, thumbnail: resolvedThumb };
    const { embed, content } = buildPreviewEmbed(tplResolved, member);
    try {
      const sendContent = content
        ? `${content}\n-# 🧪 Test — using your profile as preview`
        : `-# 🧪 Test — using your profile as preview`;
      await interaction.channel.send({ content: sendContent, embeds: [embed] });
      return interaction.reply({ content: "✅ **Test sent!** Check the message above.", ephemeral: true });
    } catch {
      return interaction.reply({ content: "❌ Couldn't send — I may not have permission to send messages here.", ephemeral: true });
    }
  }

  // All other fields open a modal
  const fieldConfig = {
    content: { label: "Message (text above embed)",          style: TextInputStyle.Short,     placeholder: "🎉 Welcome, {user}!",                         maxLength: 2000 },
    title:   { label: "Embed title",                         style: TextInputStyle.Short,     placeholder: "Welcome to {server_name}!",                    maxLength: 256  },
    desc:    { label: "Embed description",                   style: TextInputStyle.Paragraph, placeholder: "Hey {user_display}, welcome!\n\n✦ Check #rules", maxLength: 4000 },
    author:  { label: "Author: Name (line 1) + Icon URL (line 2)", style: TextInputStyle.Paragraph, placeholder: "{user_name}\n{user_avatar}",             maxLength: 512  },
    footer:  { label: "Footer text",                         style: TextInputStyle.Short,     placeholder: "You are member #{server_membercount}",          maxLength: 2048 },
    color:   { label: "Hex color  e.g. #FF69B4",             style: TextInputStyle.Short,     placeholder: "#5865F2",                                       maxLength: 7    },
    thumb:   { label: "Thumbnail URL or variable",           style: TextInputStyle.Short,     placeholder: "{user_avatar}",                                 maxLength: 1024 },
    image:   { label: "Banner / GIF URL  (.png .jpg .gif)",  style: TextInputStyle.Short,     placeholder: "https://example.com/banner.gif",                maxLength: 1024 },
    fields:  { label: "Custom fields  Name | Value | inline? (1 per line)", style: TextInputStyle.Paragraph, placeholder: "🌟 Roles | Check #roles | yes\n📣 Rules | Read #rules | yes\n🎉 Events | Join weekly events! | no", maxLength: 900 },
  };

  const cfg = fieldConfig[field];
  if (!cfg) return interaction.reply({ content: "❌ Unknown field.", ephemeral: true });

  const tpl = getTemplate(userId, templateName);
  let currentValue = "";
  if (field === "content") currentValue = tpl?.content      ?? "";
  if (field === "title")   currentValue = tpl?.title        ?? "";
  if (field === "desc")    currentValue = tpl?.description  ?? "";
  if (field === "author")  currentValue = tpl?.author ? `${tpl.author.name ?? ""}\n${tpl.author.iconUrl ?? ""}` : "";
  if (field === "footer")  currentValue = tpl?.footer       ?? "";
  if (field === "color")   currentValue = tpl?.color        ?? "";
  if (field === "thumb")   currentValue = tpl?.thumbnail    ?? "";
  if (field === "image")   currentValue = tpl?.image        ?? "";
  if (field === "fields")  currentValue = tpl?.fields
    ? tpl.fields.map((f) => `${f.name} | ${f.value} | ${f.inline ? "yes" : "no"}`).join("\n")
    : "";

  const modal = new ModalBuilder()
    .setCustomId(`wlcm_${field}:${userId}:${templateName}`)
    .setTitle(`Edit ${cfg.label.split("(")[0].trim()}`);

  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel(cfg.label)
    .setStyle(cfg.style)
    .setMaxLength(cfg.maxLength)
    .setRequired(false)
    .setPlaceholder(cfg.placeholder);

  if (currentValue) input.setValue(currentValue.slice(0, cfg.maxLength));

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

// ── Welcome builder — modal submit handler ────────────────────────────────────
// customId format: wlcm_<field>:<userId>:<templateName>
async function handleWelcomeModal(interaction) {
  const [actionFull, userId, ...nameParts] = interaction.customId.split(":");
  const templateName = nameParts.join(":");
  const field = actionFull.replace("wlcm_", "");

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: "❌ You can't edit someone else's template.", ephemeral: true });
  }

  const tpl = getTemplate(userId, templateName);
  if (!tpl) return interaction.reply({ content: "❌ Template not found.", ephemeral: true });

  const value = interaction.fields.getTextInputValue("value").trim();

  const updates = { ...tpl };
  if (field === "content") updates.content     = value || null;
  if (field === "title")   updates.title       = value || null;
  if (field === "desc")    updates.description = value || null;
  if (field === "footer")  updates.footer      = value || null;
  if (field === "color")   updates.color       = value || null;
  if (field === "thumb")   updates.thumbnail   = value || null;
  if (field === "image")   updates.image       = value || null;
  if (field === "author") {
    const lines = value.split("\n").map((l) => l.trim());
    const name    = lines[0] || null;
    const iconUrl = lines[1] || null;
    updates.author = name ? { name, iconUrl } : null;
  }
  if (field === "fields") {
    const lines = value.split("\n").map((l) => l.trim()).filter(Boolean);
    const parsed = lines.slice(0, 3).map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      return {
        name:   parts[0] || "Field",
        value:  parts[1] || "\u200b",
        inline: !(parts[2] ?? "yes").toLowerCase().startsWith("n"),
      };
    });
    updates.fields = parsed.length ? parsed : null;
  }

  const saved = saveTemplate(userId, templateName, updates);

  // Rebuild both embeds: control panel + live preview
  const { embed: livePreview } = buildLivePreviewEmbed(saved, interaction.member);

  const key = `${userId}:${templateName}`;
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wlc_content:${key}`).setLabel("Message").setStyle(ButtonStyle.Secondary).setEmoji("📨"),
    new ButtonBuilder().setCustomId(`wlc_title:${key}`).setLabel("Title").setStyle(ButtonStyle.Secondary).setEmoji("📝"),
    new ButtonBuilder().setCustomId(`wlc_desc:${key}`).setLabel("Description").setStyle(ButtonStyle.Secondary).setEmoji("📄"),
    new ButtonBuilder().setCustomId(`wlc_author:${key}`).setLabel("Author").setStyle(ButtonStyle.Secondary).setEmoji("👤"),
    new ButtonBuilder().setCustomId(`wlc_footer:${key}`).setLabel("Footer").setStyle(ButtonStyle.Secondary).setEmoji("📋"),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wlc_color:${key}`).setLabel("Color").setStyle(ButtonStyle.Secondary).setEmoji("🎨"),
    new ButtonBuilder().setCustomId(`wlc_thumb:${key}`).setLabel("Thumbnail").setStyle(ButtonStyle.Secondary).setEmoji("🖼️"),
    new ButtonBuilder().setCustomId(`wlc_image:${key}`).setLabel("Banner / GIF").setStyle(ButtonStyle.Secondary).setEmoji("🌄"),
    new ButtonBuilder().setCustomId(`wlc_fields:${key}`).setLabel("Fields").setStyle(ButtonStyle.Secondary).setEmoji("🔧"),
    new ButtonBuilder().setCustomId(`wlc_test:${key}`).setLabel("Test Send").setStyle(ButtonStyle.Success).setEmoji("📤"),
  );

  return interaction.update({ embeds: [buildBuilderEmbed(saved), livePreview], components: [row1, row2] });
}

// ── Color picker — button handler ────────────────────────────────────────────
// customId format: cp_<action>:<userId>:<h>:<s>:<l>
async function handleColorPicker(interaction) {
  const { generatePickerImage, buildPickerMessage, hslToHex, clamp } = require("../util/colorPicker");

  const parts  = interaction.customId.split(":");
  const action = parts[0].replace("cp_", "");
  const userId = parts[1];
  let h = parseInt(parts[2]);
  let s = parseInt(parts[3]);
  let l = parseInt(parts[4]);

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: "❌ Start your own with `,colorpicker`!", ephemeral: true });
  }

  // Done button — show final result
  if (action === "end") {
    const hex = hslToHex(h, s, l);
    const { EmbedBuilder } = require("discord.js");
    return interaction.update({
      content: null,
      embeds: [
        new EmbedBuilder()
          .setTitle("🎨  Color Selected")
          .setDescription(`\`\`\`${hex}\`\`\``)
          .addFields(
            { name: "HEX",  value: `\`${hex}\``,             inline: true },
            { name: "HSL",  value: `\`${h}°  ${s}%  ${l}%\``, inline: true },
          )
          .setColor(parseInt(hex.replace("#", ""), 16))
          .setFooter({ text: "Paste the HEX value into any Color field in the welcome builder" }),
      ],
      files: [],
      components: [],
    });
  }

  // Hex input modal
  if (action === "hex") {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
    const modal = new ModalBuilder()
      .setCustomId(`cphex_${userId}:${h}:${s}:${l}`)
      .setTitle("Enter a Hex Color");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel("Hex code  (e.g. #FF5733 or FF5733)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(7)
          .setRequired(true)
          .setPlaceholder("#FF5733"),
      ),
    );
    return interaction.showModal(modal);
  }

  // Image URL modal
  if (action === "img") {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
    const modal = new ModalBuilder()
      .setCustomId(`cpimg_${userId}:${h}:${s}:${l}`)
      .setTitle("Sample Color from Image");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel("Image URL (.png, .jpg, .gif, etc.)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(512)
          .setRequired(true)
          .setPlaceholder("https://example.com/image.png"),
      ),
    );
    return interaction.showModal(modal);
  }

  // Ignore disabled label buttons
  if (action === "hlbl" || action === "slbl" || action === "llbl") return;

  // Adjust values
  if (action === "hd30") h = (h - 30 + 360) % 360;
  if (action === "hd10") h = (h - 10 + 360) % 360;
  if (action === "hu10") h = (h + 10) % 360;
  if (action === "hu30") h = (h + 30) % 360;
  if (action === "sd20") s = clamp(s - 20, 0, 100);
  if (action === "sd10") s = clamp(s - 10, 0, 100);
  if (action === "su10") s = clamp(s + 10, 0, 100);
  if (action === "su20") s = clamp(s + 20, 0, 100);
  if (action === "ld20") l = clamp(l - 20, 0, 100);
  if (action === "ld10") l = clamp(l - 10, 0, 100);
  if (action === "lu10") l = clamp(l + 10, 0, 100);
  if (action === "lu20") l = clamp(l + 20, 0, 100);

  await interaction.deferUpdate();
  const buf = await generatePickerImage(h, s, l);
  return interaction.editReply(buildPickerMessage(userId, h, s, l, buf));
}

// ── Color picker — modal submit handler ──────────────────────────────────────
// customId format: cphex_<userId>:<h>:<s>:<l>  or  cpimg_<userId>:<h>:<s>:<l>
async function handleColorPickerModal(interaction) {
  const { generatePickerImage, buildPickerMessage, hexToHsl, sampleImageColor } = require("../util/colorPicker");

  const [actionFull, ...rest] = interaction.customId.split(":");
  const userId = actionFull.replace("cphex_", "").replace("cpimg_", "");
  const isHex  = actionFull.startsWith("cphex_");
  let h = parseInt(rest[0]);
  let s = parseInt(rest[1]);
  let l = parseInt(rest[2]);

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: "❌ Not your color picker.", ephemeral: true });
  }

  const value = interaction.fields.getTextInputValue("value").trim();

  if (isHex) {
    const raw = value.startsWith("#") ? value : `#${value}`;
    if (!/^#[0-9a-fA-F]{6}$/i.test(raw)) {
      return interaction.reply({ content: "❌ Invalid hex — use format `#FF5733` or `FF5733`.", ephemeral: true });
    }
    [h, s, l] = hexToHsl(raw);
  } else {
    if (!value.startsWith("http://") && !value.startsWith("https://")) {
      return interaction.reply({ content: "❌ Please provide a valid `https://` image URL.", ephemeral: true });
    }
    await interaction.deferUpdate();
    [h, s, l] = await sampleImageColor(value);
    const buf = await generatePickerImage(h, s, l);
    return interaction.editReply(buildPickerMessage(userId, h, s, l, buf));
  }

  await interaction.deferUpdate();
  const buf = await generatePickerImage(h, s, l);
  return interaction.editReply(buildPickerMessage(userId, h, s, l, buf));
}

// ── Main router ───────────────────────────────────────────────────────────────
async function handle(interaction) {
  try {
    if (interaction.isButton()) {
      const action = interaction.customId.split(":")[0];
      if (action === "trestart_yes" || action === "trestart_no") return handleTrestart(interaction);
      if (action.startsWith("wlc_")) return handleWelcomeBuilder(interaction);
      if (action.startsWith("gw_")) return handleGiveawayButton(interaction);
      if (action.startsWith("cp_"))  return handleColorPicker(interaction);
      if (action === "dis_back") return handleDisableBack(interaction);
    }
    if (interaction.isStringSelectMenu()) {
      const action = interaction.customId.split(":")[0];
      if (action === "help_cat") return handleHelpCat(interaction);
      if (action === "dis_cat") return handleDisableCategory(interaction);
      if (action === "dis_toggle") return handleDisableToggle(interaction);
    }
  } catch (err) {
    console.error("[interaction handler]", err);
    try {
      const reply = { content: "❌ Something went wrong. Try again!", ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
      else await interaction.reply(reply);
    } catch {}
  }
}

async function handleModal(interaction) {
  try {
    const action = interaction.customId.split(":")[0];
    if (action.startsWith("wlcm_"))  return handleWelcomeModal(interaction);
    if (action.startsWith("cphex_") || action.startsWith("cpimg_")) return handleColorPickerModal(interaction);
  } catch (err) {
    console.error("[modal handler]", err);
    try {
      const reply = { content: "❌ Something went wrong saving that field.", ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
      else await interaction.reply(reply);
    } catch {}
  }
}

async function handleGiveawayButton(interaction) {
  const [action, messageId] = interaction.customId.split(":");
  const { getGiveaway, saveGiveaway, removeGiveaway, buildMessage, hasManagerRole, endGiveaway } = require("../services/giveaway");

  const gw = getGiveaway(messageId);
  if (!gw) {
    return interaction.reply({ content: "❌ This giveaway no longer exists.", ephemeral: true });
  }

  if (action === "gw_join") {
    if (gw.ended) {
      return interaction.reply({ content: "❌ This giveaway has already ended.", ephemeral: true });
    }

    // ── Eligibility checks — block entry if requirements aren't met ───────────
    if (gw.requiredRoleId && !interaction.member.roles.cache.has(gw.requiredRoleId)) {
      return interaction.reply({ content: `❌ You need the <@&${gw.requiredRoleId}> role to join this giveaway.`, ephemeral: true });
    }

    if (gw.requiredLevel) {
      const { getUser } = require("../services/leveling");
      const lvl = getUser(interaction.guild.id, interaction.user.id);
      if ((lvl?.level ?? 1) < gw.requiredLevel) {
        return interaction.reply({ content: `❌ You need to be **Level ${gw.requiredLevel}** or higher to join this giveaway. You're currently Level ${lvl?.level ?? 1}.`, ephemeral: true });
      }
    }

    gw.entries = gw.entries ?? [];

    if (gw.entries.includes(interaction.user.id)) {
      gw.entries = gw.entries.filter((id) => id !== interaction.user.id);
      saveGiveaway(gw);
      await interaction.update({ embeds: [require("../services/giveaway").buildEmbed(gw, false)], components: require("../services/giveaway").buildButtons(gw, false) }).catch(() => {});
      return interaction.followUp({ content: "👋 You left the giveaway.", ephemeral: true }).catch(() => {});
    }

    gw.entries.push(interaction.user.id);
    saveGiveaway(gw);

    const { buildEmbed, buildButtons } = require("../services/giveaway");
    await interaction.update({ embeds: [buildEmbed(gw, false)], components: buildButtons(gw, false) }).catch(() => {});
    return interaction.followUp({ content: "🎉 You're in! Good luck.", ephemeral: true }).catch(() => {});
  }

  if (action === "gw_end") {
    if (!hasManagerRole(interaction.member)) {
      return interaction.reply({ content: "❌ You need **Manage Server** or a configured manager role to end this giveaway.", ephemeral: true });
    }
    await interaction.reply({ content: "⏳ Ending giveaway...", ephemeral: true });
    await endGiveaway(gw, interaction.client);
    return interaction.followUp({ content: "✅ Giveaway ended!", ephemeral: true }).catch(() => {});
  }

  if (action === "gw_cancel") {
    if (!hasManagerRole(interaction.member)) {
      return interaction.reply({ content: "❌ You need **Manage Server** or a configured manager role to cancel this giveaway.", ephemeral: true });
    }
    removeGiveaway(messageId);
    await interaction.update({ content: "❌ This giveaway was cancelled.", embeds: [], components: [] }).catch(() => {});
    return;
  }
}

module.exports = { handle, handleModal };