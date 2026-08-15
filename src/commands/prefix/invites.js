const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require("discord.js");
const { getInviteStats, getLeaderboard, syncFromDiscord } = require("../../services/inviteTracker");

module.exports = {
  name: "invites",
  aliases: ["invite", "inv"],
  async run(message, args) {
    const sub = args[0]?.toLowerCase();

    // ,invites sync — force a re-sync against Discord's live invite-use counts.
    // Useful right after the bot is added to an existing server with lots of history.
    if (sub === "sync") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return message.reply({ content: "❌ You need **Manage Server** to run this." });
      }
      const result = await syncFromDiscord(message.guild);
      return message.reply({
        content: result.synced
          ? `✅ Synced invite history — updated counts for **${result.synced}** inviter(s) based on Discord's current invite data.\n-# Note: invites that were already deleted/expired before this sync can't be recovered — Discord doesn't keep that data.`
          : "✅ Already up to date — no corrections needed.",
      });
    }

    // ,invites top
    if (sub === "top" || sub === "leaderboard" || sub === "lb") {
      const lb = getLeaderboard(message.guild.id, 10);
      if (!lb.length) {
        return message.reply({ content: "No invite data recorded yet. Invite tracking starts from when the bot joined." });
      }

      const desc = lb.map((entry, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
        return `${medal} <@${entry.userId}> — **${entry.net}** net *(${entry.regular} invited · ${entry.left} left)*`;
      }).join("\n");

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("📨  Invite Leaderboard")
            .setDescription(desc)
            .setColor(0x5865f2)
            .setFooter({ text: `${message.guild.name} · Net = total invited minus members who left` })
            .setTimestamp(),
        ],
      });
    }

    // ,invites [@user]
    const user   = message.mentions.users.first() ?? message.author;
    const member = message.guild.members.cache.get(user.id);
    const stats  = getInviteStats(message.guild.id, user.id);

    const embed = new EmbedBuilder()
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ size: 64 }) })
      .setTitle("📨  Invite Statistics")
      .setColor(member?.displayColor || 0x5865f2)
      .addFields(
        { name: "✅  Total Invited",  value: `**${stats.regular}** members`,                                inline: true },
        { name: "🚪  Members Left",   value: `**${stats.left}** left`,                                      inline: true },
        { name: "🌐  Net Invites",    value: `**${stats.net}** active`,                                     inline: true },
      )
      .setFooter({ text: `Tracking started when bot joined · ${message.guild.name}` })
      .setTimestamp();

    // Show who invited THIS user (if known)
    if (stats.invitedBy) {
      const inviter = await message.client.users.fetch(stats.invitedBy).catch(() => null);
      const codeStr = stats.inviteCode ? ` via code \`${stats.inviteCode}\`` : "";
      const joinStr = stats.joinedAt ? ` · <t:${Math.floor(stats.joinedAt / 1000)}:D>` : "";
      embed.addFields({
        name: "📥  Invited By",
        value: inviter ? `${inviter.tag}${codeStr}${joinStr}` : `Unknown${codeStr}`,
        inline: false,
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("View Leaderboard")
        .setCustomId(`inv_view_lb:${message.author.id}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🏆")
        .setDisabled(true),
    );

    return message.reply({ embeds: [embed], components: [row] });
  },
};