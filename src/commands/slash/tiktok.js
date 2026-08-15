const { SlashCommandBuilder, AttachmentBuilder, ApplicationIntegrationType, InteractionContextType } = require("discord.js");
const { extractTikTokUrl, fetchTikTokResult } = require("../../services/tiktok");
const { saveGif } = require("../../services/gifMemory");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tiktok")
    .setDescription("Download a TikTok video")
    .addStringOption((opt) =>
      opt.setName("url").setDescription("The TikTok link").setRequired(true)
    )
    .setIntegrationTypes([
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ])
    .setContexts([
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel, // lets it run in DMs/group DMs with friends
    ]),

  async run(interaction) {
    const input = interaction.options.getString("url");
    const url = extractTikTokUrl(input) || input;

    await interaction.deferReply();

    try {
      const result = await fetchTikTokResult(url);

      // Only save GIF if we're in a guild (DMs have no guild)
      if (result.isGif && result.mediaUrl && interaction.guild) {
        saveGif(interaction.guild.id, result.mediaUrl);
      }

      if (result.buffer) {
        const file = new AttachmentBuilder(result.buffer, { name: result.fileName });
        return interaction.editReply({ embeds: [result.embed], files: [file] });
      }

      if (result.link) {
        return interaction.editReply({ content: result.link, embeds: [result.embed] });
      }

      return interaction.editReply({ embeds: [result.embed] });
    } catch (err) {
      console.error("[/tiktok]", err.message);
      return interaction.editReply({ content: "❌ Couldn't fetch that TikTok. Double-check the link." });
    }
  },
};