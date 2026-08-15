const { SlashCommandBuilder, AttachmentBuilder, ApplicationIntegrationType, InteractionContextType } = require("discord.js");
const { extractTwitterUrl, fetchTwitterResult } = require("../../services/twitter");
const { saveGif } = require("../../services/gifMemory");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("twitter")
    .setDescription("Download a Twitter/X post's media")
    .addStringOption((opt) =>
      opt.setName("url").setDescription("The Tweet link").setRequired(true)
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
    const url = extractTwitterUrl(input) || input;

    await interaction.deferReply();

    try {
      const result = await fetchTwitterResult(url);

      // Only save GIF if we're in a guild (DMs have no guild)
      if (result.isGif && result.mediaUrl && interaction.guild) {
        saveGif(interaction.guild.id, result.mediaUrl);
      }

      if (result.buffer) {
        const file = new AttachmentBuilder(result.buffer, { name: result.fileName });
        return interaction.editReply({ embeds: [result.embed], files: [file] });
      }

      if (result.link) {
        return interaction.editReply({ content: `📁 File too large. View it here: ${result.link}`, embeds: [result.embed] });
      }

      return interaction.editReply({ embeds: [result.embed] });
    } catch (err) {
      console.error("[/twitter]", err.message);
      return interaction.editReply({ content: `🐦 Couldn't fetch media. View it here: ${url}` });
    }
  },
};