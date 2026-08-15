const { EmbedBuilder } = require("discord.js");
const { getAIStatus } = require("../../services/aiChat");
const { PermissionFlagsBits } = require("discord.js");

module.exports = {
  name: "taistatus",
  aliases: ["aistatus", "aistat"],
  async run(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ content: "❌ Requires Administrator." });
    }

    const providers = getAIStatus();
    const now = Date.now();

    const lines = providers.map((p, i) => {
      const priority = i === 0 ? " *(primary)*" : i === 1 ? " *(fallback 1)*" : " *(fallback 2)*";

      if (!p.hasKey) {
        return `⬜ **${p.name}**${priority}\n> No API key set`;
      }
      if (p.onCooldown) {
        const secsLeft = Math.ceil((p.resumesAt - now) / 1000);
        const minsLeft = Math.floor(secsLeft / 60);
        const s = secsLeft % 60;
        const timeStr = minsLeft > 0 ? `${minsLeft}m ${s}s` : `${s}s`;
        return `🔴 **${p.name}**${priority}\n> Rate limited — resets in **${timeStr}**`;
      }
      return `🟢 **${p.name}**${priority}\n> Ready`;
    });

    const anyActive = providers.some(p => p.hasKey && !p.onCooldown);
    const color = anyActive ? 0x2ecc71 : 0xed4245;
    const statusText = anyActive ? "AI is operational" : "⚠️ All providers rate-limited — AI is silent until one resets";

    const embed = new EmbedBuilder()
      .setTitle("🤖  Tofin AI Status")
      .setDescription(lines.join("\n\n"))
      .addFields({ name: "Overall", value: statusText, inline: false })
      .setColor(color)
      .setTimestamp()
      .setFooter({ text: "Tofin tries providers in order: Gemini → Groq → OpenRouter" });

    return message.reply({ embeds: [embed] });
  },
};
