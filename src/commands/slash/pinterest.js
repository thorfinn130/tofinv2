const { SlashCommandBuilder, AttachmentBuilder, ApplicationIntegrationType, InteractionContextType } = require("discord.js");
const { extractPinterestUrl, fetchPinterestResult } = require("../../services/pinterest");
const { saveGif } = require("../../services/gifMemory");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pinterest")
    .setDescription("Download a Pinterest pin")
    .addStringOption((opt) =>
      opt.setName("url").setDescription("The Pinterest pin link").setRequired(true)
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
    const url = extractPinterestUrl(input) || input;

    await interaction.deferReply();

    try {
      const result = await fetchPinterestResult(url);

      // Only save GIF if we're in a guild (DMs have no guild)
      if (result.isGif && result.mediaUrl && interaction.guild) {
        saveGif(interaction.guild.id, result.mediaUrl);
      }

      if (result.buffer) {
        const file = new AttachmentBuilder(result.buffer, { name: result.fileName });
        return interaction.editReply({ embeds: [result.embed], files: [file] });
      }

      if (result.link) {
        return interaction.editReply({ content: `📌 View it here: ${result.link}`, embeds: [result.embed] });
      }

      return interaction.editReply({ embeds: [result.embed] });
    } catch (err) {
      console.error("[/pinterest]", err.message);
      return interaction.editReply({ content: `📌 Couldn't fetch media directly. View it here: ${url}` });
    }
  },
};