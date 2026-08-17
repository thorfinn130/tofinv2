const { AttachmentBuilder } = require("discord.js");
const { fetchBuffer, extractAudio } = require("../../util/mp3Maker");
const { warn, danger } = require("../../util/embed");

const DISCORD_UPLOAD_LIMIT = 8 * 1024 * 1024; // 8MB, standard non-boosted server limit

module.exports = {
  name: "opus",
  async run(message, args) {
    // ,opus <url> — URL passed directly as the first argument
    let sourceUrl = null;
    if (args[0] && /^https?:\/\//i.test(args[0])) {
      sourceUrl = args[0];
    }

    // Otherwise: file attached directly to this message, or on the message being replied to
    if (!sourceUrl) sourceUrl = message.attachments.first()?.url || null;
    if (!sourceUrl && message.reference) {
      const replied = await message.fetchReference().catch(() => null);
      sourceUrl = replied?.attachments.first()?.url || null;
      if (!sourceUrl && replied?.content) {
        const match = replied.content.match(/https?:\/\/\S+/i);
        if (match) sourceUrl = match[0];
      }
    }

    if (!sourceUrl) {
      return message.reply({
        embeds: [warn("Missing Source", "Give a URL, reply to a message with a video/audio file, or attach one directly.\n**Usage:** `,opus <url>` or reply with `,opus`.")],
      });
    }

    await message.channel.sendTyping().catch(() => {});

    try {
      const inputBuf = await fetchBuffer(sourceUrl);
      const opusBuf = await extractAudio(inputBuf, "opus", sourceUrl);

      if (opusBuf.length > DISCORD_UPLOAD_LIMIT) {
        return message.reply({
          embeds: [danger("File Too Large", `The extracted Opus file is **${(opusBuf.length / 1024 / 1024).toFixed(1)}MB**, which is over Discord's 8MB upload limit for this server. Try a shorter clip.`)],
        });
      }

      const file = new AttachmentBuilder(opusBuf, { name: "audio.opus" });
      return message.reply({ files: [file] });
    } catch (err) {
      console.error("[,opus]", err);
      return message.reply({ embeds: [danger("Failed", "Couldn't extract audio from that. Make sure it's a valid video or audio file/URL.")] });
    }
  },
};