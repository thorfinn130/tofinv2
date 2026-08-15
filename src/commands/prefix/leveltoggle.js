const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, setGuild } = require("../../storage");

const STORE = "guild_settings";

function isLevelingEnabled(guildId) {
  const s = getGuild(STORE, guildId, {});
  return s.leveling !== false; // default ON
}

function setLeveling(guildId, enabled) {
  const s = getGuild(STORE, guildId, {});
  s.leveling = enabled;
  setGuild(STORE, guildId, s);
}

module.exports = {
  name: "leveltoggle",
  aliases: ["ltoggle", "levelon", "leveloff"],
  isLevelingEnabled,
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ content: "❌ Requires Administrator." });
    }

    const sub = args[0]?.toLowerCase() || (message.content.includes("leveloff") || message.content.includes("ltoggle off") ? "off" : "on");
    const invoked = message.content.split(" ")[0].replace(",", "");

    let enable;
    if (invoked === "leveloff") enable = false;
    else if (invoked === "levelon") enable = true;
    else if (sub === "off") enable = false;
    else if (sub === "on") enable = true;
    else {
      // toggle current state
      enable = !isLevelingEnabled(message.guild.id);
    }

    setLeveling(message.guild.id, enable);

    const embed = new EmbedBuilder()
      .setColor(enable ? 0x2ECC71 : 0xE74C3C)
      .setTitle(enable ? "✅ Leveling Enabled" : "❌ Leveling Disabled")
      .setDescription(enable
        ? "Members will now earn XP and level up from chatting. Use `,profile` to view a rank card and `,leaderboard` to see the top members."
        : "Leveling is now **off**. No XP will be given and no level-up messages will appear.")
      .setFooter({ text: `Changed by ${message.author.username}` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
