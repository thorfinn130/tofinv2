const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require("discord.js");
const { recognizeFromUrl, recognizeFromAttachment } = require("../../services/shazam");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shazam")
    .setDescription("Identify a song from an audio/video file or URL")
    .addAttachmentOption(opt =>
      opt.setName("file")
        .setDescription("Upload an audio or video file")
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName("url")
        .setDescription("Or paste a URL to an audio/video file")
        .setRequired(false)
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
    const attachment = interaction.options.getAttachment("file");
    const url = interaction.options.getString("url");

    // Keep the missing input warning as a simple ephemeral reply
    if (!attachment && !url) {
      return interaction.reply({ content: "❌ Provide either an audio file or a URL.", ephemeral: true });
    }

    await interaction.deferReply();

    try {
      let result;
      if (attachment) {
        result = await recognizeFromAttachment(attachment);
      } else if (url) {
        result = await recognizeFromUrl(url);
      }

      // If no result, reply with the red embed – only that phrase
      if (!result) {
        const failEmbed = new EmbedBuilder()
          .setColor(0xFF0000) // red
          .setDescription("i cant recognize that song");
        return interaction.editReply({ embeds: [failEmbed] });
      }

      // Success embed (unchanged)
      const embed = new EmbedBuilder()
        .setColor(0x1DB954)
        .setTitle(`🎵 ${result.title}`)
        .setDescription(`**Artist:** ${result.artists.map(a => a.name).join(", ")}`)
        .addFields(
          { name: "Album", value: result.album?.name || "Unknown", inline: true },
          { name: "Label", value: result.label || "Unknown", inline: true },
          { name: "Duration", value: result.duration_ms ? `${Math.floor(result.duration_ms / 60000)}:${String(Math.floor((result.duration_ms % 60000) / 1000)).padStart(2, "0")}` : "Unknown", inline: true },
        )
        .setThumbnail(result.album?.cover_url || null)
        .setFooter({ text: "Powered by ACRCloud" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("[/shazam]", err);
      // On any error, also the same red embed, no extra details
      const failEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setDescription("i cant recognize that song");
      await interaction.editReply({ embeds: [failEmbed] });
    }
  },
};