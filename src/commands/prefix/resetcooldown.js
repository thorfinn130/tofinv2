const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { resetProviderCooldown, getAIStatus } = require("../../services/aiChat");

const VALID = ["gemini", "groq", "openrouter", "all"];

module.exports = {
  name: "resetcooldown",
  aliases: ["resetai", "clearcd"],
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ content: "❌ Requires Administrator." });
    }

    const target = args[0]?.toLowerCase();

    if (!target || !VALID.includes(target)) {
      return message.reply({
        content: `❌ Usage: \`,resetcooldown <gemini|groq|openrouter|all>\``,
      });
    }

    const cleared = resetProviderCooldown(target);
    const providers = getAIStatus();
    const now = Date.now();

    const lines = providers.map((p) => {
      if (!p.hasKey) return `⬜ **${p.name}** — no key`;
      if (p.onCooldown) {
        const s = Math.ceil((p.resumesAt - now) / 1000);
        return `🔴 **${p.name}** — still cooling (${s}s left)`;
      }
      return `🟢 **${p.name}** — ready`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle("🔄  Cooldown Reset")
      .setDescription(
        `Cleared cooldown for **${target === "all" ? "all providers" : cleared.join(", ")}**.\n\n` +
        lines.join("\n")
      )
      .setFooter({ text: `Reset by ${message.author.username}` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
