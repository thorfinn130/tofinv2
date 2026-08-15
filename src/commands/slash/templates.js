const { SlashCommandBuilder } = require("discord.js");
const { listTemplates } = require("../../services/template");
const { info } = require("../../util/embed");

module.exports = {
  data: new SlashCommandBuilder().setName("templates").setDescription("View saved server templates"),
  async run(interaction) {
    const list = listTemplates(interaction.guildId);
    const desc = list.length
      ? list
          .map(
            (t) =>
              `🧱 **${t.name}**\n› <t:${Math.floor(t.createdAt / 1000)}:R> · ${t.roles.length} roles · ${t.channels.length} channels`,
          )
          .join("\n\n")
      : "_No templates yet. Use `,template save <name>`._";

    await interaction.reply({
      embeds: [info(`🧱 Templates — ${interaction.guild.name}`, desc)],
      ephemeral: true,
    });
  },
};
