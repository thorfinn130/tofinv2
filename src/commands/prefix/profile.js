const { getUser, xpNeeded, getRank } = require("../../services/leveling");
const { generateRankCard } = require("../../util/rankCard");
const { danger } = require("../../util/embed");
const { AttachmentBuilder } = require("discord.js");

module.exports = {
  name: "profile",
  aliases: ["prof", "rank", "level"],
  async run(message, args) {
    const user = message.mentions.users.first() ?? message.author;
    const lv = getUser(message.guild.id, user.id);
    const needed = xpNeeded(lv.level);
    const { rank, total } = getRank(message.guild.id, user.id);

    await message.channel.sendTyping().catch(() => {});

    try {
      const imgBuf = await generateRankCard({
        username: user.username,
        avatarURL: user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true }),
        level: lv.level,
        xp: lv.xp,
        xpNeeded: needed,
        rank,
        totalMembers: total,
        totalXp: lv.totalXp || 0,
      });

      const attachment = new AttachmentBuilder(imgBuf, { name: "profile.png" });
      return message.reply({ files: [attachment] });
    } catch (err) {
      console.error("[rankCard]", err);
      return message.reply({ embeds: [danger("Error", "Couldn't generate profile card. Try again in a moment.")] });
    }
  },
};
