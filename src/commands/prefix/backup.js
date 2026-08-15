const { PermissionFlagsBits } = require("discord.js");
const { createBackup, restoreBackup, listBackups } = require("../../services/backup");
const { success, info, danger } = require("../../util/embed");

module.exports = {
  name: "backup",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Administrator)")] });
    }
    const sub = args[0]?.toLowerCase();
    if (sub === "create") {
      const b = await createBackup(message.guild, args.slice(1).join(" "));
      return message.reply({
        embeds: [success("Backup created", `ID: \`${b.id}\`\nName: **${b.name}**`)],
      });
    }
    if (sub === "restore") {
      const id = args[1];
      if (!id) return message.reply({ embeds: [danger("Provide a backup ID")] });
      await message.reply({ embeds: [info("Restoring backup… this will rebuild the server.")] });
      await restoreBackup(message.guild, id);
      return;
    }
    if (sub === "list") {
      const list = listBackups(message.guild.id);
      const desc = list.length
        ? list.map((b) => `• \`${b.id}\` — ${b.name}`).join("\n")
        : "_No backups yet._";
      return message.reply({ embeds: [info("💾 Backups", desc)] });
    }
    return message.reply({ embeds: [info("Usage", "`,backup create [name]` · `,backup restore <id>` · `,backup list`")] });
  },
};
