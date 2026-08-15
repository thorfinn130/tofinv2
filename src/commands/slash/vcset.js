const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require("discord.js");
const { addTrigger, removeTrigger, listTriggers } = require("../../services/joinToCreate");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vcset")
    .setDescription("Set up or manage Join-to-Create voice channels")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Make a voice channel a Join-to-Create trigger")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The voice channel — joining it creates a private channel for the user")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("limit")
            .setDescription("Max people per created channel (leave blank for no limit)")
            .setMinValue(1)
            .setMaxValue(99)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Stop a voice channel from being a Join-to-Create trigger")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The trigger channel to remove")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List all Join-to-Create trigger channels in this server")
    ),

  async run(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      const triggers = listTriggers(interaction.guild.id);
      if (!triggers.length) {
        return interaction.reply({ content: "No Join-to-Create trigger channels set up yet.", ephemeral: true });
      }
      const lines = triggers.map((id) => `<#${id}>`).join("\n");
      return interaction.reply({ content: `🔊 **Join-to-Create Channels**\n${lines}`, ephemeral: true });
    }

    const channel = interaction.options.getChannel("channel");

    if (sub === "add") {
      const me = interaction.guild.members.me;
      if (!me.permissions.has(PermissionFlagsBits.ManageChannels) || !me.permissions.has(PermissionFlagsBits.MoveMembers)) {
        return interaction.reply({ content: "❌ I need **Manage Channels** and **Move Members** permissions first.", ephemeral: true });
      }

      const limit = interaction.options.getInteger("limit"); // null if not provided = no limit
      addTrigger(interaction.guild.id, channel.id, limit ?? null);

      const limitNote = limit ? `Each created channel will have a **${limit}**-person limit.` : "Created channels will have **no user limit**.";
      return interaction.reply({
        content: `✅ **${channel.name}** is now a Join-to-Create channel.\nAnyone who joins it gets their own private voice channel and is moved in automatically. ${limitNote}\nThey get full control over their own channel through Discord's normal channel permissions — no extra commands needed.`,
        ephemeral: true,
      });
    }

    if (sub === "remove") {
      const removed = removeTrigger(interaction.guild.id, channel.id);
      if (!removed) {
        return interaction.reply({ content: "❌ That channel isn't a Join-to-Create trigger.", ephemeral: true });
      }
      return interaction.reply({ content: `✅ **${channel.name}** is no longer a Join-to-Create channel.`, ephemeral: true });
    }
  },
};
