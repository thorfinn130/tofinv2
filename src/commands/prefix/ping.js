const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "ping",
  aliases: ["latency"],
  async run(message) {
    const sent = await message.reply({ content: "🏓 pinging..." });
    const roundtrip = sent.createdTimestamp - message.createdTimestamp;
    const api = Math.round(message.client.ws.ping);

    const quality = (ms) => ms < 80 ? "🟢 Great" : ms < 180 ? "🟡 OK" : "🔴 High";

    const embed = new EmbedBuilder()
      .setTitle("🏓  Pong!")
      .setColor(roundtrip < 80 ? 0x2ECC71 : roundtrip < 180 ? 0xF1C40F : 0xED4245)
      .addFields(
        { name: "💬 Message Latency", value: `\`${roundtrip}ms\`  ${quality(roundtrip)}`, inline: true },
        { name: "🌐 API Latency",     value: `\`${api}ms\`  ${quality(api)}`,        inline: true },
      )
      .setFooter({ text: `Requested by ${message.author.username}` })
      .setTimestamp();

    await sent.edit({ content: null, embeds: [embed] });
  },
};
