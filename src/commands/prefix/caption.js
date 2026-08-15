const { AttachmentBuilder } = require("discord.js");
const { makeStaticGif, makeCaptionedAnimatedGif, isGifBuffer, fetchBuffer } = require("../../util/gifMaker");
const { warn, danger } = require("../../util/embed");

module.exports = {
  name: "caption",
  async run(message, args) {
    // ,caption gif <url> <caption text...>
    if (args[0]?.toLowerCase() !== "gif") {
      return message.reply({
        embeds: [warn("Usage", "`,caption gif <url> <caption>`\n**Example:** `,caption gif https://example.com/dance.gif lol nice moves`")],
      });
    }

    const url = args[1];
    const caption = args.slice(2).join(" ").trim() || null;

    if (!url || !/^https?:\/\//i.test(url)) {
      return message.reply({ embeds: [warn("Missing/Invalid URL", "**Usage:** `,caption gif <url> <caption>`")] });
    }

    await message.channel.sendTyping().catch(() => {});

    try {
      const buf = await fetchBuffer(url);
      const outBuf = isGifBuffer(buf)
        ? await makeCaptionedAnimatedGif(url, caption)
        : await makeStaticGif(url, caption); // gracefully handles a non-animated link too

      const file = new AttachmentBuilder(outBuf, { name: "captioned.gif" });
      return message.reply({ files: [file] });
    } catch (err) {
      console.error("[,caption gif]", err);
      return message.reply({ embeds: [danger("Failed", "Couldn't process that URL. Make sure it's a direct link to an image or GIF.")] });
    }
  },
};
