const { PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { danger, warn, rich } = require("../../util/embed");
const { colors } = require("../../config");
const { isDisabled, isProtected, disableCommand, disableAllInChannel, getConfig } = require("../../services/commandToggle");
const CATEGORIES = require("../../util/commandCategories");

function buildCategoryMenu(scope, channelId) {
  const scopeToken = channelId ?? "none";
  const select = new StringSelectMenuBuilder()
    .setCustomId(`dis_cat:${scope}:${scopeToken}`)
    .setPlaceholder("Choose a category to manage…")
    .addOptions(
      Object.entries(CATEGORIES).map(([key, cat]) => ({
        label: cat.label,
        value: key,
        emoji: cat.emoji,
        description: `${cat.commands.length} command${cat.commands.length !== 1 ? "s" : ""}`,
      }))
    );
  return new ActionRowBuilder().addComponents(select);
}

function buildOverviewEmbed(guild, channel) {
  const cfg = getConfig(guild.id);
  const channelOverrides = Object.keys(cfg.channels).length;
  return rich({
    title: "🧰  Command Toggles",
    description: [
      channel
        ? `Managing toggles for ${channel}. Pick a category below to turn specific commands off — everything else stays on.`
        : "Managing **server-wide** toggles. Pick a category below to turn specific commands off — everything else stays on.",
      "",
      `**Disabled server-wide:** ${cfg.global.length}`,
      `**Channels with overrides:** ${channelOverrides}`,
      "",
      "> `,disable <command> [#channel]` — quick disable\n> `,enable <command> [#channel]` — quick enable\n> `,disable channel #channel` — turn off everything in a channel",
    ].join("\n"),
    color: colors.primary,
  });
}

function buildToggleEmbed(guild, categoryKey, scope, channelId) {
  const cat = CATEGORIES[categoryKey];
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  return rich({
    title: `${cat.emoji}  ${cat.label} Toggles`,
    description: [
      "Selected = **off**. Unselected = **on**.",
      scope === "channel" && channel ? `Scope: ${channel}` : "Scope: **server-wide**",
    ].join("\n"),
    color: colors.primary,
  });
}

function buildToggleMenu(guildId, categoryKey, scope, channelId) {
  const cat = CATEGORIES[categoryKey];
  const cfg = getConfig(guildId);
  const disabledSet = scope === "channel" && channelId
    ? new Set(cfg.channels[channelId] || [])
    : new Set(cfg.global);

  const toggleable = cat.commands.filter((name) => !isProtected(name));
  const select = new StringSelectMenuBuilder()
    .setCustomId(`dis_toggle:${categoryKey}:${scope}:${channelId ?? "none"}`)
    .setPlaceholder(`Pick commands to turn OFF in ${cat.label}…`)
    .setMinValues(0)
    .setMaxValues(toggleable.length)
    .addOptions(toggleable.map((name) => ({ label: name, value: name, default: disabledSet.has(name) })));

  const back = new ButtonBuilder()
    .setCustomId(`dis_back:${scope}:${channelId ?? "none"}`)
    .setLabel("⬅ Back to categories")
    .setStyle(ButtonStyle.Secondary);

  return [new ActionRowBuilder().addComponents(select), new ActionRowBuilder().addComponents(back)];
}

module.exports = {
  name: "disable",
  buildCategoryMenu,
  buildOverviewEmbed,
  buildToggleEmbed,
  buildToggleMenu,
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Administrator)")] });
    }

    const sub = args[0]?.toLowerCase();
    const guildId = message.guild.id;

    // ,disable list [#channel] — interactive category + toggle menu
    if (sub === "list") {
      const channel = message.mentions.channels.first() || null;
      return message.reply({
        embeds: [buildOverviewEmbed(message.guild, channel)],
        components: [buildCategoryMenu(channel ? "channel" : "global", channel?.id)],
      });
    }

    // ,disable channel #channel — turn off every (non-protected) command in a channel
    if (sub === "channel") {
      const channel = message.mentions.channels.first();
      if (!channel) {
        return message.reply({ embeds: [warn("Missing Channel", "**Usage:** `,disable channel #channel`")] });
      }
      const all = Object.values(CATEGORIES).flatMap((c) => c.commands);
      disableAllInChannel(guildId, channel.id, all);
      return message.reply("👌");
    }

    // ,disable <command> [#channel]
    if (!sub) {
      return message.reply({
        embeds: [warn(
          "Usage",
          "`,disable <command> [#channel]` — disable one command (server-wide, or just in a channel)\n`,disable channel #channel` — disable everything in a channel\n`,disable list [#channel]` — browse & toggle commands interactively"
        )],
      });
    }

    const { commands } = require("../../handlers/prefix");
    const cmd = commands.get(sub);
    if (!cmd) {
      return message.reply({ embeds: [danger("Unknown Command", `No command named \`${sub}\`.`)] });
    }
    if (isProtected(cmd.name)) {
      return message.reply({ embeds: [danger("Can't Disable", `\`${cmd.name}\` can't be disabled — it's needed to manage the bot.`)] });
    }

    const channel = message.mentions.channels.first() || null;
    if (isDisabled(guildId, channel?.id, cmd.name) && (channel ? getConfig(guildId).channels[channel.id]?.includes(cmd.name) : getConfig(guildId).global.includes(cmd.name))) {
      return message.reply({ embeds: [warn("Already Disabled", `\`${cmd.name}\` is already disabled${channel ? ` in ${channel}` : " server-wide"}.`)] });
    }

    disableCommand(guildId, cmd.name, channel?.id ?? null);
    return message.reply("👌");
  },
};
