const { SlashCommandBuilder, AttachmentBuilder, ApplicationIntegrationType, InteractionContextType } = require("discord.js");
const {
  makeStaticGif, makeCaptionedAnimatedGif, makeGifFromVideo,
  isGifBuffer, isVideoBuffer, fetchBuffer, parseTimeToSeconds, uploadPermanentGif,
} = require("../../util/gifMaker");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("gif")
    .setDescription("Turn an image, video, or sticker into a GIF, with an optional caption")
    .addAttachmentOption((opt) =>
      opt.setName("image").setDescription("Upload an image, GIF, or video").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("url").setDescription("Or paste an image/GIF/video URL instead").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("sticker_url")
        .setDescription("Or paste a Discord sticker CDN URL (e.g., from a sticker)").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("caption").setDescription("Optional caption shown above the image").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("start").setDescription("Start time for videos, e.g. 5 or 0:05").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("end").setDescription("End time for videos, e.g. 12 or 0:12").setRequired(false)
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
    const attachment = interaction.options.getAttachment("image");
    const url = interaction.options.getString("url");
    const stickerUrl = interaction.options.getString("sticker_url");
    const caption = interaction.options.getString("caption");
    const startStr = interaction.options.getString("start");
    const endStr = interaction.options.getString("end");

    const sourceUrl = attachment?.url || url || stickerUrl;
    if (!sourceUrl) {
      return interaction.reply({ content: "❌ Provide either an upload, a URL, or a sticker URL.", ephemeral: true });
    }

    const startSeconds = startStr ? parseTimeToSeconds(startStr) : null;
    const endSeconds = endStr ? parseTimeToSeconds(endStr) : null;

    if (startStr && startSeconds === null) {
      return interaction.reply({ content: "❌ Invalid start time. Use seconds (e.g. `5`) or `mm:ss` (e.g. `0:05`).", ephemeral: true });
    }
    if (endStr && endSeconds === null) {
      return interaction.reply({ content: "❌ Invalid end time. Use seconds (e.g. `12`) or `mm:ss` (e.g. `0:12`).", ephemeral: true });
    }
    if (startSeconds != null && endSeconds != null && endSeconds <= startSeconds) {
      return interaction.reply({ content: "❌ End time must be after start time.", ephemeral: true });
    }

    await interaction.deferReply();
    console.log(`[/gif] processing request from ${interaction.user.tag}: ${sourceUrl}`);

    try {
      const buf = await fetchBuffer(sourceUrl);
      let outBuf;
      if (isVideoBuffer(buf)) {
        outBuf = await makeGifFromVideo(sourceUrl, caption, startSeconds, endSeconds);
      } else if (isGifBuffer(buf)) {
        outBuf = await makeCaptionedAnimatedGif(sourceUrl, caption);
      } else {
        outBuf = await makeStaticGif(sourceUrl, caption);
      }
      const file = new AttachmentBuilder(outBuf, { name: "tofin.gif" });
      const permanentUrl = await uploadPermanentGif(outBuf, "tofin").catch(() => null);
      return interaction.editReply({
        content: permanentUrl ? `-# 🔗 permanent link (won't expire): ${permanentUrl}` : undefined,
        files: [file],
      });
    } catch (err) {
      console.error("[/gif]", err);
      return interaction.editReply({ content: `❌ Couldn't process that. ${err.message || "Make sure the link/upload is a valid image, GIF, or video."}` });
    }
  },
};