const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");
const { parseDuration, formatDuration } = require("../../util/time");
const {
  saveGiveaway, getGiveaway, removeGiveaway, getAllActive,
  getConfig, setConfig,
  hasManagerRole, hasCreatorRole,
  buildEmbed, buildMessage, endGiveaway,
} = require("../../services/giveaway");

function parseColor(str) {
  if (!str) return null;
  const hex = str.replace("#", "");
  const n = parseInt(hex, 16);
  return isNaN(n) ? null : n;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Full-featured giveaway system")

    // ── /giveaway create ─────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Start a new giveaway")
        .addStringOption((o) =>
          o.setName("duration")
            .setDescription("How long the giveaway runs — e.g. 1h, 30m, 2d, 1h30m")
            .setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("prize")
            .setDescription("What are you giving away?")
            .setRequired(true)
        )
        .addIntegerOption((o) =>
          o.setName("winners")
            .setDescription("Number of winners (default: 1)")
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(false)
        )
        .addChannelOption((o) =>
          o.setName("channel")
            .setDescription("Channel to post in (default: current channel)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addRoleOption((o) =>
          o.setName("required-role")
            .setDescription("Role required to enter")
            .setRequired(false)
        )
        .addRoleOption((o) =>
          o.setName("winners-role")
            .setDescription("Role automatically given to the winner(s)")
            .setRequired(false)
        )
        .addUserOption((o) =>
          o.setName("host")
            .setDescription("Who is hosting this giveaway? (default: you)")
            .setRequired(false)
        )
        .addStringOption((o) =>
          o.setName("color")
            .setDescription("Embed color while giveaway is active — hex code e.g. #FF5733")
            .setRequired(false)
        )
        .addStringOption((o) =>
          o.setName("end-color")
            .setDescription("Embed color after giveaway ends — hex code e.g. #ED4245")
            .setRequired(false)
        )
        .addStringOption((o) =>
          o.setName("win-message")
            .setDescription("Custom winner announcement (use {winners} and {prize} as placeholders)")
            .setRequired(false)
        )
        .addStringOption((o) =>
          o.setName("dm-message")
            .setDescription("Message DM'd to winners (use {prize} and {server} as placeholders)")
            .setRequired(false)
        )
        .addStringOption((o) =>
          o.setName("create-message")
            .setDescription("Extra message sent in the channel after the giveaway is posted")
            .setRequired(false)
        )
    )

    // ── /giveaway end ─────────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName("end")
        .setDescription("End a giveaway early and pick winners now")
        .addStringOption((o) =>
          o.setName("message-id")
            .setDescription("The message ID of the giveaway to end")
            .setRequired(true)
        )
    )

    // ── /giveaway reroll ──────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName("reroll")
        .setDescription("Reroll winner(s) of an ended giveaway")
        .addStringOption((o) =>
          o.setName("message-id")
            .setDescription("The message ID of the giveaway to reroll")
            .setRequired(true)
        )
        .addIntegerOption((o) =>
          o.setName("winners")
            .setDescription("How many new winners to pick (default: 1)")
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(false)
        )
    )

    // ── /giveaway delete ──────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Cancel and delete an active giveaway")
        .addStringOption((o) =>
          o.setName("message-id")
            .setDescription("The message ID of the giveaway to delete")
            .setRequired(true)
        )
    )

    // ── /giveaway edit ────────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Edit a live giveaway")
        .addStringOption((o) =>
          o.setName("message-id")
            .setDescription("The message ID of the giveaway to edit")
            .setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("duration")
            .setDescription("New duration from now — e.g. 2h, 30m, 1d")
            .setRequired(false)
        )
        .addStringOption((o) =>
          o.setName("prize")
            .setDescription("New prize text")
            .setRequired(false)
        )
        .addIntegerOption((o) =>
          o.setName("winners")
            .setDescription("New winner count")
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(false)
        )
        .addRoleOption((o) =>
          o.setName("required-role")
            .setDescription("New required role (set to @everyone to remove)")
            .setRequired(false)
        )
        .addStringOption((o) =>
          o.setName("color")
            .setDescription("New embed color — hex code e.g. #5865F2")
            .setRequired(false)
        )
    )

    // ── /giveaway list ────────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Show all active giveaways in this server")
    )

    // ── /giveaway managerroles ────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName("managerroles")
        .setDescription("Toggle a role that can manage all giveaway actions (end, delete, edit, reroll)")
        .addRoleOption((o) =>
          o.setName("role")
            .setDescription("Role to toggle")
            .setRequired(true)
        )
    )

    // ── /giveaway creatorroles ────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub
        .setName("creatorroles")
        .setDescription("Toggle a role that can only create giveaways")
        .addRoleOption((o) =>
          o.setName("role")
            .setDescription("Role to toggle")
            .setRequired(true)
        )
    ),

  // ── Handler ─────────────────────────────────────────────────────────────────
  async run(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── create ────────────────────────────────────────────────────────────────
    if (sub === "create") {
      if (!hasCreatorRole(interaction.member)) {
        return interaction.reply({ content: "❌ You need **Manage Server** or a configured creator role to start giveaways.", ephemeral: true });
      }

      const durationStr  = interaction.options.getString("duration");
      const prize        = interaction.options.getString("prize");
      const winnerCount  = interaction.options.getInteger("winners")      ?? 1;
      const channel      = interaction.options.getChannel("channel")      ?? interaction.channel;
      const reqRole      = interaction.options.getRole("required-role");
      const winnersRole  = interaction.options.getRole("winners-role");
      const host         = interaction.options.getUser("host")            ?? interaction.user;
      const colorHex     = interaction.options.getString("color");
      const endColorHex  = interaction.options.getString("end-color");
      const winMsg       = interaction.options.getString("win-message");
      const dmMsg        = interaction.options.getString("dm-message");
      const createMsg    = interaction.options.getString("create-message");

      const ms = parseDuration(durationStr);
      if (!ms) {
        return interaction.reply({ content: "❌ Invalid duration. Use formats like `1h`, `30m`, `2d`, `1h30m`.", ephemeral: true });
      }

      const me = interaction.guild.members.me;
      if (!me.permissionsIn(channel).has(["SendMessages", "EmbedLinks", "AddReactions"])) {
        return interaction.reply({ content: `❌ I need **Send Messages**, **Embed Links**, and **Add Reactions** in ${channel}.`, ephemeral: true });
      }

      const gw = {
        guildId:        interaction.guild.id,
        channelId:      channel.id,
        messageId:      null,
        prize,
        winnerCount,
        endsAt:         Date.now() + ms,
        hostId:         host.id,
        requiredRoleId: reqRole?.id         ?? null,
        winnersRoleId:  winnersRole?.id     ?? null,
        color:          parseColor(colorHex),
        endColor:       parseColor(endColorHex),
        winMsg:         winMsg || null,
        dmMsg:          dmMsg  || null,
        ended:          false,
        winnerIds:      [],
        entries:        [],
      };

      await interaction.deferReply({ ephemeral: true });

      const gwMsg = await channel.send(buildMessage(gw, false));

      gw.messageId = gwMsg.id;
      saveGiveaway(gw);

      // Re-send with the now-known messageId baked into the button customIds
      await gwMsg.edit(buildMessage(gw, false)).catch(() => {});

      if (createMsg) await channel.send({ content: createMsg }).catch(() => {});

      // Build a nice summary
      const summary = new EmbedBuilder()
        .setTitle("✅  Giveaway Created!")
        .setColor(0x57f287)
        .addFields(
          { name: "Prize",    value: prize,                                              inline: true  },
          { name: "Winners",  value: `${winnerCount}`,                                  inline: true  },
          { name: "Duration", value: formatDuration(ms),                                inline: true  },
          { name: "Channel",  value: `${channel}`,                                      inline: true  },
          { name: "Ends",     value: `<t:${Math.floor(gw.endsAt / 1000)}:R>`,           inline: true  },
          { name: "Host",     value: `<@${host.id}>`,                                   inline: true  },
        );

      if (reqRole)     summary.addFields({ name: "Required Role",  value: `${reqRole}`,    inline: true });
      if (winnersRole) summary.addFields({ name: "Winners Role",   value: `${winnersRole}`, inline: true });

      summary.addFields({ name: "Message ID", value: `\`${gwMsg.id}\``, inline: false });

      return interaction.editReply({ embeds: [summary] });
    }

    // ── end ───────────────────────────────────────────────────────────────────
    if (sub === "end") {
      if (!hasManagerRole(interaction.member)) {
        return interaction.reply({ content: "❌ You need **Manage Server** or a configured manager role.", ephemeral: true });
      }
      const msgId = interaction.options.getString("message-id");
      const gw = getGiveaway(msgId);
      if (!gw || gw.guildId !== interaction.guild.id) {
        return interaction.reply({ content: "❌ No active giveaway found with that message ID.", ephemeral: true });
      }
      await interaction.reply({ content: "⏳ Ending giveaway and picking winners...", ephemeral: true });
      await endGiveaway(gw, interaction.client);
      return interaction.editReply({ content: "✅ Giveaway ended!" });
    }

    // ── reroll ────────────────────────────────────────────────────────────────
    if (sub === "reroll") {
      if (!hasManagerRole(interaction.member)) {
        return interaction.reply({ content: "❌ You need **Manage Server** or a configured manager role.", ephemeral: true });
      }
      const msgId = interaction.options.getString("message-id");
      const count = interaction.options.getInteger("winners") ?? 1;

      const gw = getGiveaway(msgId);
      if (!gw) {
        return interaction.reply({ content: "❌ No giveaway found with that message ID (it may have already been cleaned up after ending).", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: false });

      const { pickWinners } = require("../../services/giveaway");
      const excludeIds = gw.winnerIds ?? [];
      const winners = await pickWinners(gw, interaction.guild, excludeIds);

      if (!winners.length) {
        return interaction.editReply({ content: "❌ No valid entries found to reroll." });
      }

      const mention = winners.map((id) => `<@${id}>`).join(", ");
      const gwChannel = interaction.guild.channels.cache.get(gw.channelId);
      const jumpUrl = gwChannel ? `https://discord.com/channels/${gw.guildId}/${gw.channelId}/${msgId}` : null;

      return interaction.editReply({
        content: `🎉 **Rerolled!** New winner${winners.length > 1 ? "s" : ""}: ${mention}${jumpUrl ? `\n[Jump to giveaway](${jumpUrl})` : ""}`,
      });
    }

    // ── delete ────────────────────────────────────────────────────────────────
    if (sub === "delete") {
      if (!hasManagerRole(interaction.member)) {
        return interaction.reply({ content: "❌ You need **Manage Server** or a configured manager role.", ephemeral: true });
      }
      const msgId = interaction.options.getString("message-id");
      const gw = getGiveaway(msgId);
      if (!gw || gw.guildId !== interaction.guild.id) {
        return interaction.reply({ content: "❌ No active giveaway found with that message ID.", ephemeral: true });
      }

      const gwChannel = interaction.guild.channels.cache.get(gw.channelId);
      if (gwChannel) {
        const gwMsg = await gwChannel.messages.fetch(msgId).catch(() => null);
        if (gwMsg) await gwMsg.delete().catch(() => {});
      }
      removeGiveaway(msgId);
      return interaction.reply({ content: "✅ Giveaway deleted.", ephemeral: true });
    }

    // ── edit ──────────────────────────────────────────────────────────────────
    if (sub === "edit") {
      if (!hasManagerRole(interaction.member)) {
        return interaction.reply({ content: "❌ You need **Manage Server** or a configured manager role.", ephemeral: true });
      }
      const msgId = interaction.options.getString("message-id");
      const gw = getGiveaway(msgId);
      if (!gw || gw.guildId !== interaction.guild.id) {
        return interaction.reply({ content: "❌ No active giveaway found with that message ID.", ephemeral: true });
      }

      const newDuration = interaction.options.getString("duration");
      const newPrize    = interaction.options.getString("prize");
      const newWinners  = interaction.options.getInteger("winners");
      const newReqRole  = interaction.options.getRole("required-role");
      const newColor    = interaction.options.getString("color");

      let changed = false;
      if (newDuration) { const ms = parseDuration(newDuration); if (ms) { gw.endsAt = Date.now() + ms; changed = true; } }
      if (newPrize)    { gw.prize = newPrize; changed = true; }
      if (newWinners)  { gw.winnerCount = newWinners; changed = true; }
      if (newReqRole)  { gw.requiredRoleId = newReqRole.id === interaction.guild.id ? null : newReqRole.id; changed = true; }
      if (newColor)    { gw.color = parseColor(newColor); changed = true; }

      if (!changed) {
        return interaction.reply({ content: "❌ No changes provided — include at least one field to update.", ephemeral: true });
      }

      saveGiveaway(gw);

      const gwChannel = interaction.guild.channels.cache.get(gw.channelId);
      if (gwChannel) {
        const gwMsg = await gwChannel.messages.fetch(msgId).catch(() => null);
        if (gwMsg) await gwMsg.edit({ embeds: [buildEmbed(gw, false)] }).catch(() => {});
      }

      return interaction.reply({ content: "✅ Giveaway updated!", ephemeral: true });
    }

    // ── list ──────────────────────────────────────────────────────────────────
    if (sub === "list") {
      const active = getAllActive().filter((gw) => gw.guildId === interaction.guild.id && !gw.ended);
      if (!active.length) {
        return interaction.reply({ content: "There are no active giveaways right now.", ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle("🎉  Active Giveaways")
        .setColor(0x5865f2)
        .setDescription(
          active.map((gw) =>
            `**${gw.prize}** — ${gw.winnerCount} winner${gw.winnerCount > 1 ? "s" : ""}\n` +
            `<#${gw.channelId}> · Ends <t:${Math.floor(gw.endsAt / 1000)}:R> · [Jump](https://discord.com/channels/${gw.guildId}/${gw.channelId}/${gw.messageId})`
          ).join("\n\n")
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── managerroles / creatorroles ───────────────────────────────────────────
    if (sub === "managerroles" || sub === "creatorroles") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "❌ You need **Manage Server** to configure giveaway roles.", ephemeral: true });
      }
      const role = interaction.options.getRole("role");
      const cfg  = getConfig(interaction.guild.id);
      const key  = sub === "managerroles" ? "managerRoles" : "creatorRoles";

      if (cfg[key].includes(role.id)) {
        cfg[key] = cfg[key].filter((id) => id !== role.id);
        setConfig(interaction.guild.id, cfg);
        return interaction.reply({ content: `✅ ${role} removed from giveaway ${sub === "managerroles" ? "manager" : "creator"} roles.`, ephemeral: true });
      } else {
        cfg[key].push(role.id);
        setConfig(interaction.guild.id, cfg);
        const label = sub === "managerroles" ? "manage all giveaway actions" : "create giveaways";
        return interaction.reply({ content: `✅ ${role} can now **${label}**.`, ephemeral: true });
      }
    }
  },
};