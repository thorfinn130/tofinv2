const { PermissionFlagsBits } = require("discord.js");
const {
  getGuildConfig,
  addChannel,
  removeChannelEvents,
  addIgnored,
  removeIgnored,
  parseEvents,
  ALL_EVENTS,
  EVENT_GROUPS,
} = require("../../services/logging");
const { success, danger, info, rich } = require("../../util/embed");

const ADMIN = PermissionFlagsBits.ManageGuild;

module.exports = {
  name: "logs",
  aliases: ["log"],

  async run(message, args) {
    if (!message.member.permissions.has(ADMIN)) {
      return message.reply({ embeds: [danger("Missing Permission", "You need **Manage Server** to configure logging.")] });
    }

    const sub = args[0]?.toLowerCase();

    // ,logs add #channel <events...>
    if (sub === "add") {
      const channel = message.mentions.channels.first();
      if (!channel) {
        return message.reply({ embeds: [danger("Missing Channel", "Mention the channel to log into.\nUsage: `,logs add #channel <events>`")] });
      }

      const eventArgs = args.slice(2);
      if (!eventArgs.length) {
        return message.reply({ embeds: [danger("Missing Events", "Provide at least one event or category.\nExamples: `all`, `member`, `message`, `role`, `voice`, `channel`, `server`, `other`\nOr specific events like `member_join`, `message_delete`, etc.")] });
      }

      const events = parseEvents(eventArgs);
      if (!events.length) {
        return message.reply({ embeds: [danger("Invalid Events", `No valid events found. Use \`,logs events\` to see all available events.`)] });
      }

      const me = message.guild.members.me;
      if (!me.permissionsIn(channel).has(["SendMessages", "EmbedLinks"])) {
        return message.reply({ embeds: [danger("Missing Bot Permission", `I need **Send Messages** and **Embed Links** in ${channel} to send logs there.`)] });
      }

      addChannel(message.guild.id, channel.id, events);

      const grouped = Object.entries(EVENT_GROUPS)
        .filter(([, evts]) => evts.some((e) => events.includes(e)))
        .map(([group]) => `\`${group}\``)
        .join(", ");

      return message.reply({ embeds: [success("Logging Channel Added", `Logs will be sent to ${channel}.\n**Events:** ${grouped || events.join(", ")}\n**Total events subscribed:** ${events.length}`)] });
    }

    // ,logs remove #channel <events...>
    if (sub === "remove") {
      const channel = message.mentions.channels.first();
      if (!channel) {
        return message.reply({ embeds: [danger("Missing Channel", "Mention the channel to remove events from.\nUsage: `,logs remove #channel <events>`")] });
      }

      const eventArgs = args.slice(2);
      if (!eventArgs.length) {
        return message.reply({ embeds: [danger("Missing Events", "Provide events to remove, or use `all` to remove everything from that channel.")] });
      }

      const events = parseEvents(eventArgs);
      removeChannelEvents(message.guild.id, channel.id, events);
      return message.reply({ embeds: [success("Events Removed", `Removed ${events.length} event(s) from ${channel}. Use \`,logs list\` to see the current config.`)] });
    }

    // ,logs list
    if (sub === "list") {
      const cfg = getGuildConfig(message.guild.id);
      if (!cfg.channels.length) {
        return message.reply({ embeds: [info("No Logging Channels", "No logging channels are configured yet.\nUse `,logs add #channel <events>` to get started.")] });
      }

      const fields = cfg.channels.map((entry) => {
        const ch = message.guild.channels.cache.get(entry.channelId);
        const label = ch ? `<#${entry.channelId}>` : `#deleted-channel (${entry.channelId})`;
        const groups = Object.entries(EVENT_GROUPS)
          .filter(([, evts]) => evts.every((e) => entry.events.includes(e)))
          .map(([g]) => g);
        const specific = entry.events.filter((e) => !groups.some((g) => EVENT_GROUPS[g]?.includes(e)));
        const display = [...groups.map((g) => `\`${g}\``), ...specific.map((e) => `\`${e}\``)].join(", ");
        return { name: label, value: display || "*No events*", inline: false };
      });

      return message.reply({ embeds: [rich({ title: "📋  Logging Channels", fields, color: 0x5865f2 })] });
    }

    // ,logs events
    if (sub === "events") {
      const fields = Object.entries(EVENT_GROUPS).map(([group, events]) => ({
        name: `**${group.charAt(0).toUpperCase() + group.slice(1)}** — \`${group}\``,
        value: events.map((e) => `\`${e}\``).join(", "),
        inline: false,
      }));
      return message.reply({
        embeds: [rich({
          title: "📋  Available Log Events",
          description: "Use group names (e.g. `member`, `message`) to subscribe to all events in a category, or individual event names for fine-grained control. Use `all` for everything.",
          fields,
          color: 0x5865f2,
        })],
      });
    }

    // ,logs ignore <member/channel> or ,logs ignore list
    if (sub === "ignore") {
      const listSub = args[1]?.toLowerCase();

      if (listSub === "list") {
        const cfg = getGuildConfig(message.guild.id);
        if (!cfg.ignored.length) {
          return message.reply({ embeds: [info("Ignored List", "Nothing is being ignored.")] });
        }
        const lines = cfg.ignored.map((id) => {
          const ch = message.guild.channels.cache.get(id);
          const mem = message.guild.members.cache.get(id);
          return ch ? `<#${id}>` : mem ? `<@${id}>` : `\`${id}\``;
        });
        return message.reply({ embeds: [info("🚫  Ignored Members & Channels", lines.join("\n"))] });
      }

      const target = message.mentions.members.first() ?? message.mentions.channels.first();
      if (!target) {
        return message.reply({ embeds: [danger("Missing Target", "Mention a member or channel to ignore.\nUsage: `,logs ignore @member` or `,logs ignore #channel`")] });
      }

      const id = target.id ?? target.channelId;
      const cfg = getGuildConfig(message.guild.id);

      if (cfg.ignored.includes(id)) {
        removeIgnored(message.guild.id, id);
        return message.reply({ embeds: [success("Unignored", `Logs for <@${id}> / <#${id}> will now be tracked again.`)] });
      } else {
        addIgnored(message.guild.id, id);
        const label = message.mentions.members.first() ? `<@${id}>` : `<#${id}>`;
        return message.reply({ embeds: [success("Ignored", `${label} will no longer generate log entries.`)] });
      }
    }

    // Help / default
    return message.reply({
      embeds: [rich({
        title: "📋  Logging — Help",
        description: "Track and monitor server activity with detailed logs.",
        fields: [
          { name: "`,logs add #channel <events>`",    value: "Add logging to a channel. Use group names or `all`.",     inline: false },
          { name: "`,logs remove #channel <events>`", value: "Remove specific events from a logging channel.",           inline: false },
          { name: "`,logs list`",                     value: "Show all configured logging channels.",                    inline: false },
          { name: "`,logs events`",                   value: "Show all available event names and groups.",               inline: false },
          { name: "`,logs ignore @member/#channel`",  value: "Toggle-ignore a member or channel from being logged.",     inline: false },
          { name: "`,logs ignore list`",              value: "Show all currently ignored members and channels.",          inline: false },
        ],
        color: 0x5865f2,
        footer: "Event groups: member · message · channel · role · voice · server · other · all",
      })],
    });
  },
};
