const { AttachmentBuilder } = require("discord.js");
const { fetchBuffer, extractAudio } = require("../../util/mp3Maker");
const { warn, danger } = require("../../util/embed");

const DISCORD_UPLOAD_LIMIT = 8 * 1024 * 1024; // 8MB, standard non-boosted server limit

module.exports = {
  name: "mp3",
  async run(message, args) {
    // ,mp3 <url> — URL passed directly as the first argument
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
        embeds: [warn("Missing Source", "Give a URL, reply to a message with a video/audio file, or attach one directly.\n**Usage:** `,mp3 <url>` or reply with `,mp3`.")],
      });
    }

    await message.channel.sendTyping().catch(() => {});

    try {
      const inputBuf = await fetchBuffer(sourceUrl);
      const mp3Buf = await extractAudio(inputBuf);

      if (mp3Buf.length > DISCORD_UPLOAD_LIMIT) {
        return message.reply({
          embeds: [danger("File Too Large", `The extracted MP3 is **${(mp3Buf.length / 1024 / 1024).toFixed(1)}MB**, which is over Discord's 8MB upload limit for this server. Try a shorter clip.`)],
        });
      }

      const file = new AttachmentBuilder(mp3Buf, { name: "audio.mp3" });
      return message.reply({ files: [file] });
    } catch (err) {
      console.error("[,mp3]", err);
      return message.reply({ embeds: [danger("Failed", "Couldn't extract audio from that. Make sure it's a valid video or audio file/URL.")] });
    }
  },
};