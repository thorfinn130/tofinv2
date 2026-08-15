const { EmbedBuilder } = require("discord.js");
const { recognizeFromUrl, recognizeFromAttachment } = require("../../services/shazam");
const { warn } = require("../../util/embed"); // keep warn for missing audio

module.exports = {
  name: "shazam",
  async run(message, args) {
    let url = args.find(a => a.startsWith("http://") || a.startsWith("https://"));
    let attachment = message.attachments.first();

    if (!attachment && !url && message.reference) {
      const replied = await message.fetchReference().catch(() => null);
      if (replied) {
        attachment = replied.attachments.first();
        if (!attachment && replied.content) {
          const match = replied.content.match(/https?:\/\/[^\s]+/);
          if (match) url = match[0];
        }
      }
    }

    // Keep the "Missing Audio" warning embed unchanged
    if (!attachment && !url) {
      return message.reply({ embeds: [warn("Missing Audio", "Attach an audio/video file, provide a URL, or reply to a message with audio.")] });
    }

    await message.channel.sendTyping();

    try {
      let result;
      if (attachment) {
        result = await recognizeFromAttachment(attachment);
      } else if (url) {
        result = await recognizeFromUrl(url);
      }

      if (!result) {
        // Failure embed: red, only the phrase
        const failEmbed = new EmbedBuilder()
          .setColor(0xFF0000) // red, or use your danger color
          .setDescription("i cant recognize that song");
        return message.reply({ embeds: [failEmbed] });
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
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error("[,shazam]", err);
      // On error, same red embed, only that text
      const failEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setDescription("i cant recognize that song");
      return message.reply({ embeds: [failEmbed] });
    }
  },
};