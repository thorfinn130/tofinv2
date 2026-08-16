const { PermissionFlagsBits } = require("discord.js");
const { danger, warn, info } = require("../../util/embed");

module.exports = {
  name: "emoji",
  aliases: ["temoji"],
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Manage Emojis)")] });
    }
    const sub = args[0]?.toLowerCase();

    if (sub === "list") {
      const emojis = message.guild.emojis.cache;
      if (!emojis.size) return message.reply({ embeds: [info("😄  Server Emojis", "_No custom emojis found._")] });
      const list = emojis.map((e) => `${e} \`${e.name}\``).join("  ·  ");
      return message.reply({ embeds: [info(`😄  Server Emojis (${emojis.size})`, list)] });
    }

    if (sub === "add") {
      const name = args[1];
      const url = message.attachments.first()?.url ?? args[2];
      if (!name || !url) {
        return message.reply({ embeds: [warn("Missing Info", "Provide a name and image URL (or attach an image).\n**Usage:** `,emoji add <name> <url>`")] });
      }
      const emoji = await message.guild.emojis.create({ name, attachment: url, reason: `Added by ${message.author.tag}` }).catch((e) => ({ error: e.message }));
      if (emoji.error) return message.reply({ embeds: [danger("Failed", `Could not add emoji: ${emoji.error}`)] });
      return message.reply("👌");
    }

    if (sub === "remove") {
      const name = args[1];
      if (!name) return message.reply({ embeds: [warn("Missing Name", "Provide the emoji name to remove.\n**Usage:** `,emoji remove <name>`")] });
      const emoji = message.guild.emojis.cache.find((e) => e.name === name);
      if (!emoji) return message.reply({ embeds: [danger("Not Found", `No emoji named \`${name}\` found in this server.`)] });
      await emoji.delete(`Removed by ${message.author.tag}`);
      return message.reply("👌");
    }

    return message.reply({ embeds: [info("😄  Emoji Usage", "`,emoji list` — view all custom emojis\n`,emoji add <name> <url>` — add a new emoji\n`,emoji remove <name>` — delete an emoji")] });
  },
};
