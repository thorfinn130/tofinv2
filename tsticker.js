const { PermissionFlagsBits } = require("discord.js");
const { success, danger, warn, info } = require("../../util/embed");

module.exports = {
  name: "tsticker",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Manage Stickers)")] });
    }
    const sub = args[0]?.toLowerCase();

    if (sub === "list") {
      const stickers = message.guild.stickers.cache.filter((s) => s.type === 2); // GUILD stickers only
      if (!stickers.size) return message.reply({ embeds: [info("🏷️  Server Stickers", "_No custom stickers found._")] });
      const list = stickers.map((s) => `[\`${s.name}\`](${s.url})`).join("  ·  ");
      return message.reply({ embeds: [info(`🏷️  Server Stickers (${stickers.size})`, list)] });
    }

    if (sub === "add") {
      const name = args[1];
      const url = message.attachments.first()?.url ?? args[2];
      const tags = args.slice(3).join(" ") || name;

      if (!name || !url) {
        return message.reply({
          embeds: [warn("Missing Info", "Provide a name and image URL (or attach an image).\n**Usage:** `,tsticker add <name> <url> [tags]`\nTags help Discord suggest the sticker — defaults to the name if left out.")],
        });
      }

      const sticker = await message.guild.stickers.create({
        name,
        file: url,
        tags,
        reason: `Added by ${message.author.tag}`,
      }).catch((e) => ({ error: e.message }));

      if (sticker.error) {
        const limitHit = sticker.error.includes("Maximum");
        return message.reply({ embeds: [danger("Failed", limitHit ? "This server has hit its sticker slot limit." : `Could not add sticker: ${sticker.error}`)] });
      }

      return message.reply({ embeds: [success("Sticker Added", `\`${sticker.name}\` has been added!`)] });
    }

    if (sub === "remove") {
      const name = args[1];
      if (!name) return message.reply({ embeds: [warn("Missing Name", "Provide the sticker name to remove.\n**Usage:** `,tsticker remove <name>`")] });
      const sticker = message.guild.stickers.cache.find((s) => s.name === name);
      if (!sticker) return message.reply({ embeds: [danger("Not Found", `No sticker named \`${name}\` found in this server.`)] });
      await sticker.delete(`Removed by ${message.author.tag}`);
      return message.reply({ embeds: [success("Sticker Removed", `\`${name}\` has been removed.`)] });
    }

    return message.reply({
      embeds: [info("🏷️  Sticker Usage", "`,tsticker list` — view all custom stickers\n`,tsticker add <name> <url> [tags]` — add a new sticker\n`,tsticker remove <name>` — delete a sticker")],
    });
  },
};