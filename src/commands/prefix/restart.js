const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require("discord.js");
const { danger } = require("../../util/embed");

module.exports = {
  name: "restart",
  aliases: ["trestart"],
  async run(message) {
    // ── Owner only ────────────────────────────────────────────────────────────
    if (message.author.id !== message.guild.ownerId) {
      return message.reply({ embeds: [danger("Owner Only", "Only the **server owner** can use this command.")] });
    }

    const guild = message.guild;
    await guild.members.fetch().catch(() => {});
    const channelCount = guild.channels.cache.size;
    const roleCount    = guild.roles.cache.filter(r => !r.managed && r.name !== "@everyone").size;
    const botCount     = guild.members.cache.filter(m => m.user.bot && m.id !== message.client.user.id).size;

    const confirmEmbed = new EmbedBuilder()
      .setTitle("⚠️  Server Restart — Are You Sure?")
      .setDescription(
        `This will **permanently wipe** everything on **${guild.name}**:\n\n` +
        `> 🗑️  **${channelCount}** channels deleted\n` +
        `> 🏷️  **${roleCount}** roles deleted\n` +
        `> 🤖  **${botCount}** bots kicked\n\n` +
        `**This cannot be undone.**\n` +
        `The server will be completely empty (bots, channels, and roles all gone).`
      )
      .setColor(0xED4245)
      .setFooter({ text: "This action is irreversible. Choose carefully." })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`trestart_yes:${message.author.id}:${guild.id}`)
        .setLabel("🗑️  Yes, delete everything")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`trestart_no:${message.author.id}`)
        .setLabel("✅  Cancel — keep everything")
        .setStyle(ButtonStyle.Success),
    );

    return message.reply({ embeds: [confirmEmbed], components: [row] });
  },
};
