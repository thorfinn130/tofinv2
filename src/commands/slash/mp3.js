const { SlashCommandBuilder, AttachmentBuilder, ApplicationIntegrationType, InteractionContextType } = require("discord.js");
const { fetchBuffer, extractAudio } = require("../../util/mp3Maker");

const DISCORD_UPLOAD_LIMIT = 8 * 1024 * 1024;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mp3")
    .setDescription("Extract the audio from a video as an MP3 file")
    .addAttachmentOption((opt) =>
      opt.setName("file").setDescription("Upload a video or audio file").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("url").setDescription("Or paste a video/audio URL instead").setRequired(false)
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

    const sourceUrl = attachment?.url || url;
    if (!sourceUrl) {
      return interaction.reply({ content: "❌ Provide either an upload or a URL.", ephemeral: true });
    }

    await interaction.deferReply();

    try {
      const inputBuf = await fetchBuffer(sourceUrl);
      const mp3Buf = await extractAudio(inputBuf, "mp3", sourceUrl);

      if (mp3Buf.length > DISCORD_UPLOAD_LIMIT) {
        return interaction.editReply({ content: `❌ The extracted MP3 is **${(mp3Buf.length / 1024 / 1024).toFixed(1)}MB**, over Discord's 8MB upload limit. Try a shorter clip.` });
      }

      const file = new AttachmentBuilder(mp3Buf, { name: "audio.mp3" });
      return interaction.editReply({ files: [file] });
    } catch (err) {
      console.error("[/mp3]", err);
      return interaction.editReply({ content: "❌ Couldn't extract audio from that. Make sure it's a valid video or audio file/URL." });
    }
  },
};