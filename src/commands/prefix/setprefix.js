const { PermissionFlagsBits } = require("discord.js");
const { setPrefix, getPrefix } = require("../../services/prefixManager");
const { success, warn, danger } = require("../../util/embed");

console.log("[setprefix] Command loaded!"); // Debug

module.exports = {
  name: "setprefix",
  aliases: ["prefix"],
  async run(message, args) {
    console.log("[setprefix] Command triggered by", message.author.tag); // Debug
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ embeds: [danger("Missing Permission", "You need Administrator to change the prefix.")] });
    }

    if (!args.length) {
      const current = getPrefix(message.guild.id);
      return message.reply({ embeds: [warn("Current Prefix", `The current prefix is \`${current}\`.`)] });
    }

    const newPrefix = args[0];
    if (newPrefix.length > 5) {
      return message.reply({ embeds: [warn("Too Long", "Prefix must be 5 characters or fewer.")] });
    }

    console.log("[setprefix] Setting new prefix:", newPrefix);
    if (setPrefix(message.guild.id, newPrefix)) {
      return message.reply({ embeds: [success("Prefix Updated", `The new prefix is \`${newPrefix}\`.`)] });
    } else {
      return message.reply({ embeds: [warn("Error", "Could not set prefix.")] });
    }
  },
};