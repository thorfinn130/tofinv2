const { PermissionFlagsBits } = require("discord.js");
const { danger, warn } = require("../../util/embed");

module.exports = {
  name: "purge",
  aliases: ["tpurge"],
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Manage Messages)")] });
    }
    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) {
      return message.reply({ embeds: [warn("Invalid Amount", "Provide a number between **1** and **100**.\n**Usage:** `,purge <amount>`")] });
    }
    await message.delete().catch(() => {});
    const deleted = await message.channel.bulkDelete(amount, true).catch(() => null);
    if (!deleted) return message.channel.send({ embeds: [danger("Failed", "Could not delete messages. Messages older than 14 days can't be bulk deleted.")] });
    const reply = await message.channel.send("👌");
    setTimeout(() => reply.delete().catch(() => {}), 4000);
  },
};
