const { AttachmentBuilder } = require("discord.js");
const {
  makeStaticGif, makeCaptionedAnimatedGif, makeGifFromVideo,
  isGifBuffer, isVideoBuffer, fetchBuffer, parseTimeToSeconds, uploadPermanentGif,
} = require("../../util/gifMaker");

module.exports = {
  name: "gif",
  async run(message, args) {
    // ,gif <url> [start] [end] [caption] — URL passed directly as the first argument.
    // start/end are optional timestamps (e.g. 5, 0:05, 1:23) and only apply to videos.
    let sourceUrl = null;
    let rest = args;

    if (args[0] && /^https?:\/\//i.test(args[0])) {
      sourceUrl = args[0];
      rest = args.slice(1);
    }

    // Greedily consume up to 2 leading time-like tokens as start/end
    let startSeconds = null;
    let endSeconds = null;

    if (rest[0] != null && parseTimeToSeconds(rest[0]) !== null) {
      startSeconds = parseTimeToSeconds(rest[0]);
      rest = rest.slice(1);

      if (rest[0] != null && parseTimeToSeconds(rest[0]) !== null) {
        endSeconds = parseTimeToSeconds(rest[0]);
        rest = rest.slice(1);
      }
    }

    const caption = rest.join(" ").trim() || null;

    // Otherwise: image/video attached directly to this message, or on the message being replied to
    if (!sourceUrl) sourceUrl = message.attachments.first()?.url || null;

    if (!sourceUrl && message.reference) {
      const replied = await message.fetchReference().catch(() => null);
      sourceUrl = replied?.attachments.first()?.url || null;

      // Also allow replying to a message that's just a plain image/gif/video link
      if (!sourceUrl && replied?.content) {
        const match = replied.content.match(/https?:\/\/\S+/i);
        if (match) sourceUrl = match[0];
      }
    }

    if (!sourceUrl) {
      return message.reply({
        content: "❌ Give a URL, reply to a message with an image/GIF/video, or attach one directly.\n**Usage:** `,gif <url> [start] [end] [caption]` or reply with `,gif [start] [end] [caption]`.\n**Example:** `,gif https://example.com/clip.mp4 0:05 0:12 lol nice`\n-# Videos default to the first 8s if no start/end given, capped at 20s.",
      });
    }

    if (startSeconds != null && endSeconds != null && endSeconds <= startSeconds) {
      return message.reply({ content: "❌ End time must be after start time." });
    }

    await message.channel.sendTyping().catch(() => {});
    // Discord's typing indicator only lasts ~10s — keep renewing it so it
    // doesn't silently disappear while a longer video is processing.
    const typingInterval = setInterval(() => {
      message.channel.sendTyping().catch(() => {});
    }, 8000);

    console.log(`[,gif] processing request from ${message.author.tag} in #${message.channel.name ?? message.channel.id}: ${sourceUrl}`);

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

      const file = new AttachmentBuilder(outBuf, { name: "result.gif" });
      const permanentUrl = await uploadPermanentGif(outBuf, "gif").catch(() => null);
      return message.reply({
        content: permanentUrl ? `-# 🔗 permanent link (won't expire): ${permanentUrl}` : undefined,
        files: [file],
      });
    } catch (err) {
      console.error("[,gif]", err);
      return message.reply({ content: `❌ ${err.message || "Couldn't process that. Make sure it's a valid image, GIF, or video."}` });
    } finally {
      clearInterval(typingInterval);
    }
  },
};