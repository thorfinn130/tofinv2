const { EmbedBuilder, ChannelType } = require("discord.js");
const { bar } = require("../../util/embed");

const STATUS_ICONS = { online: "🟢", idle: "🟡", dnd: "🔴", offline: "⚫" };

module.exports = {
  name: "membercount",
  aliases: ["mc", "members"],
  async run(message) {
    const g = message.guild;
    await g.members.fetch().catch(() => {});

    const all      = g.members.cache;
    const total    = g.memberCount;
    const bots     = all.filter((m) => m.user.bot).size;
    const humans   = total - bots;

    // Status breakdown (only works if GuildPresences intent is enabled)
    const online  = all.filter((m) => !m.user.bot && m.presence?.status === "online").size;
    const idle    = all.filter((m) => !m.user.bot && m.presence?.status === "idle").size;
    const dnd     = all.filter((m) => !m.user.bot && m.presence?.status === "dnd").size;
    const offline = humans - online - idle - dnd;

    // Channel counts
    const text    = g.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
    const voice   = g.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;
    const threads = g.channels.cache.filter((c) => [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread].includes(c.type)).size;
    const stage   = g.channels.cache.filter((c) => c.type === ChannelType.GuildStageVoice).size;
    const cats    = g.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size;

    // Boost info
    const boostLevel = g.premiumTier === 0 ? "None" : `Level ${g.premiumTier}`;
    const boosts     = g.premiumSubscriptionCount ?? 0;

    const makeBar = (v, max) => `\`${bar(v, max, 10)}\` **${v.toLocaleString()}**`;

    const embed = new EmbedBuilder()
      .setTitle(`👥  ${g.name} — Member Count`)
      .setThumbnail(g.iconURL({ size: 128 }))
      .setColor(0x5865f2)
      .addFields(
        // Members
        { name: "👥  Members",   value: `Total: **${total.toLocaleString()}** · Humans: **${humans.toLocaleString()}** · Bots: **${bots.toLocaleString()}**`, inline: false },
        // Status bars
        { name: "🟢  Online",    value: makeBar(online,  humans), inline: true },
        { name: "🟡  Idle",      value: makeBar(idle,    humans), inline: true },
        { name: "🔴  DnD",       value: makeBar(dnd,     humans), inline: true },
        { name: "⚫  Offline",   value: makeBar(offline, humans), inline: true },
        { name: "\u200b",        value: "\u200b",                 inline: true },
        { name: "\u200b",        value: "\u200b",                 inline: true },
        // Channels
        { name: "💬  Text",      value: `**${text}**`,            inline: true },
        { name: "🔊  Voice",     value: `**${voice}**`,           inline: true },
        { name: "🧵  Threads",   value: `**${threads}**`,         inline: true },
        { name: "🎙️  Stage",     value: `**${stage}**`,           inline: true },
        { name: "📂  Categories",value: `**${cats}**`,            inline: true },
        { name: "\u200b",        value: "\u200b",                 inline: true },
        // Boosts
        { name: "🚀  Boost Level", value: `${boostLevel} — **${boosts}** boost${boosts !== 1 ? "s" : ""}`, inline: false },
      )
      .setFooter({ text: `Requested by ${message.author.username}` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
