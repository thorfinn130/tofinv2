const { EmbedBuilder } = require("discord.js");

function bar(ms, max = 300) {
  const filled = Math.max(0, Math.min(10, Math.round((10 * (max - ms)) / max)));
  return "▰".repeat(filled) + "▱".repeat(10 - filled);
}

function tier(ms) {
  return ms < 100 ? "🟢 Great" : ms < 250 ? "🟡 Okay" : "🔴 High";
}

function color(ms) {
  return ms < 100 ? 0x2ECC71 : ms < 250 ? 0xF1C40F : 0xED4245;
}

module.exports = {
  name: "ping",
  aliases: ["latency"],
  async run(message) {
    const start = Date.now();
    const sent = await message.reply("🏓 Pinging...");
    const roundtrip = Date.now() - start; // send time: bot processing + first REST call

    const editStart = Date.now();
    await sent.edit("🏓 Pinging...");
    const apiLatency = Date.now() - editStart; // pure REST round-trip, isolated from any earlier processing

    const gatewayPing = Math.round(message.client.ws.ping);

    const worst = Math.max(roundtrip, apiLatency, gatewayPing);
    const embed = new EmbedBuilder()
      .setTitle("🏓  Pong!")
      .setColor(color(worst))
      .setDescription(
        `\`${bar(gatewayPing)}\`  **Gateway**  \`${gatewayPing}ms\`  ${tier(gatewayPing)}\n` +
        `\`${bar(apiLatency)}\`  **API Call**  \`${apiLatency}ms\`  ${tier(apiLatency)}\n` +
        `\`${bar(roundtrip)}\`  **Full Reply**  \`${roundtrip}ms\`  ${tier(roundtrip)}`
      )
      .setFooter({ text: gatewayPing > 250 || apiLatency > 250 ? "High ping usually means Discord/network, not the bot itself" : "All systems normal" })
      .setTimestamp();

    await sent.edit({ content: null, embeds: [embed] });
  },
};
