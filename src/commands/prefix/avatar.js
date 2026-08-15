const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "avatar",
  aliases: ["av", "pfp"],
  async run(message, args) {
    const target =
      message.mentions.users.first() ||
      (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null) ||
      message.author;

    const member = message.guild?.members.cache.get(target.id);
    const serverAvatar = member?.displayAvatarURL({ size: 4096, extension: "png" });
    const globalAvatar = target.displayAvatarURL({ size: 4096, extension: "png" });

    const embed = new EmbedBuilder()
      .setTitle(`🖼️  ${target.username}'s Avatar`)
      .setImage(serverAvatar ?? globalAvatar)
      .setColor(0x5865F2)
      .setFooter({ text: `Requested by ${message.author.username}` })
      .setTimestamp();

    const links = [`[Global](${globalAvatar})`];
    if (serverAvatar && serverAvatar !== globalAvatar) links.unshift(`[Server](${serverAvatar})`);
    embed.setDescription(`🔗 Download: ${links.join("  ·  ")}`);

    return message.reply({ embeds: [embed] });
  },
};
