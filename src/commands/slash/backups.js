const { SlashCommandBuilder } = require("discord.js");
const { listBackups } = require("../../services/backup");
const { info } = require("../../util/embed");

module.exports = {
  data: new SlashCommandBuilder().setName("backups").setDescription("View server backups dashboard"),
  async run(interaction) {
    const list = listBackups(interaction.guildId);
    const desc = list.length
      ? list
          .map(
            (b) =>
              `\`${b.id}\` • **${b.name}**\n› <t:${Math.floor(b.createdAt / 1000)}:R> · ${b.data.roles.length} roles · ${b.data.channels.length} channels`,
          )
          .join("\n\n")
      : "_No backups yet. Use `,backup create` to make one._";

    await interaction.reply({
      embeds: [info(`💾 Backups — ${interaction.guild.name}`, desc)],
      ephemeral: true,
    });
  },
};
