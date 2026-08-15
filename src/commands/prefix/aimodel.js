const { EmbedBuilder } = require("discord.js");
const { getAIStatus } = require("../../services/aiChat");

const PROVIDER_META = {
  "Gemini 2.0 Flash": { color: 0x4285F4, icon: "🔵" },
  "Groq (Llama 3.3)": { color: 0x6B38D8, icon: "🟣" },
  "OpenRouter":        { color: 0xFF6B35, icon: "🟠" },
};

function bar(filled, total = 8) {
  return "█".repeat(filled) + "░".repeat(total - filled);
}

module.exports = {
  name: "aimodel",
  aliases: ["currentai", "whichai"],
  async run(message) {
    const providers = getAIStatus();
    const now = Date.now();

    const active = providers.find((p) => p.hasKey && !p.onCooldown);
    const meta = active ? (PROVIDER_META[active.name] ?? { color: 0x5865F2, icon: "🤖" }) : null;

    const embed = new EmbedBuilder()
      .setColor(meta?.color ?? 0xED4245)
      .setTimestamp()
      .setFooter({ text: "Tofin tries: Gemini → Groq → OpenRouter" });

    if (!active) {
      embed
        .setTitle("🔴  AI Offline")
        .setDescription("All providers are rate-limited right now.\nTry again in a bit.");
    } else {
      embed
        .setTitle(`${meta.icon}  Active Model — ${active.name}`)
        .setDescription(`> Currently processing all AI requests through **${active.name}**`);
    }

    const providerFields = providers.map((p, i) => {
      const isActive = active && p.name === active.name;
      const priority = ["Primary", "Fallback 1", "Fallback 2"][i] ?? "Fallback";
      const pm = PROVIDER_META[p.name] ?? { icon: "⚪" };

      let statusLine, healthBar;
      if (!p.hasKey) {
        statusLine = "⬜ No API key";
        healthBar = bar(0);
      } else if (p.onCooldown) {
        const secsLeft = Math.ceil((p.resumesAt - now) / 1000);
        const mins = Math.floor(secsLeft / 60);
        const secs = secsLeft % 60;
        const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        statusLine = `🔴 Rate limited — resets in **${timeStr}**`;
        healthBar = bar(2);
      } else {
        statusLine = isActive ? "🟢 **Active** ◄ handling requests" : "🟢 Standby — ready";
        healthBar = bar(8);
      }

      return {
        name: `${pm.icon} ${p.name}  ·  ${priority}${isActive ? "  ✦" : ""}`,
        value: `\`${healthBar}\`\n${statusLine}`,
        inline: false,
      };
    });

    embed.addFields(providerFields);

    return message.reply({ embeds: [embed] });
  },
};
