const { ChannelType } = require("discord.js");
const { rich } = require("../../util/embed");
const { colors } = require("../../config");

module.exports = {
  name: "serverinfo",
  aliases: ["si"],
  async run(message) {
    const g = message.guild;
    await g.members.fetch();

    const totalMembers = g.memberCount;
    const bots = g.members.cache.filter((m) => m.user.bot).size;
    const humans = totalMembers - bots;
    const textChannels = g.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
    const voiceChannels = g.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;
    const categories = g.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size;
    const roles = g.roles.cache.size - 1;
    const created = `<t:${Math.floor(g.createdTimestamp / 1000)}:D> (<t:${Math.floor(g.createdTimestamp / 1000)}:R>)`;
    const owner = await g.fetchOwner().catch(() => null);
    const boostLevel = g.premiumTier === 0 ? "None" : `Level ${g.premiumTier}`;

    const embed = rich({
      title: `🏠  ${g.name}`,
      color: colors.primary,
      thumbnail: g.iconURL({ size: 256 }),
      fields: [
        { name: "🪪  Server ID", value: g.id, inline: true },
        { name: "👑  Owner", value: owner ? `${owner.user.tag}` : "_Unknown_", inline: true },
        { name: "🚀  Boost Level", value: `${boostLevel} (${g.premiumSubscriptionCount} boosts)`, inline: true },
        { name: "👥  Members", value: `Total: **${totalMembers}** | Humans: **${humans}** | Bots: **${bots}**`, inline: false },
        { name: "💬  Channels", value: `Text: **${textChannels}** | Voice: **${voiceChannels}** | Categories: **${categories}**`, inline: false },
        { name: "🏷️  Roles", value: `${roles}`, inline: true },
        { name: "😄  Emojis", value: `${g.emojis.cache.size}`, inline: true },
        { name: "📅  Created", value: created, inline: false },
      ],
      footer: `Requested by ${message.author.tag}`,
    });

    return message.reply({ embeds: [embed] });
  },
};
