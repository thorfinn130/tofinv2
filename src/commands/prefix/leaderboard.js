const { AttachmentBuilder } = require("discord.js");
const { getLeaderboard, xpNeeded } = require("../../services/leveling");
const { generateLeaderboardCard } = require("../../util/leaderboardCard");
const { info, danger } = require("../../util/embed");

module.exports = {
  name: "leaderboard",
  aliases: ["lb", "top", "ranks"],
  async run(message) {
    const top = getLeaderboard(message.guild.id, 10);
    if (!top.length) {
      return message.reply({ embeds: [info("Leaderboard", "No one has earned XP yet. Start chatting to get on the board!")] });
    }

    await message.guild.members.fetch({ user: top.map((u) => u.userId) }).catch(() => {});
    await message.channel.sendTyping().catch(() => {});

    const entries = top.map((u, i) => {
      const member = message.guild.members.cache.get(u.userId);
      const username = member ? member.user.username : `unknown_user`;
      const avatarURL = member
        ? member.user.displayAvatarURL({ extension: "png", size: 128, forceStatic: true })
        : "https://cdn.discordapp.com/embed/avatars/0.png";
      return {
        rank: i + 1,
        userId: u.userId,
        username,
        avatarURL,
        level: u.level,
        xp: u.xp,
        xpNeeded: xpNeeded(u.level),
      };
    });

    try {
      const imgBuf = await generateLeaderboardCard({
        title: `/${message.guild.name}`,
        entries,
      });
      const attachment = new AttachmentBuilder(imgBuf, { name: "leaderboard.png" });
      return message.reply({ files: [attachment] });
    } catch (err) {
      console.error("[leaderboard]", err);
      return message.reply({ embeds: [danger("Error", "Couldn't generate the leaderboard card. Try again in a moment.")] });
    }
  },
};