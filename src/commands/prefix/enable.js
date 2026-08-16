const { PermissionFlagsBits } = require("discord.js");
const { danger, warn } = require("../../util/embed");
const { isDisabled, enableCommand, enableAllInChannel, getConfig } = require("../../services/commandToggle");
const { buildCategoryMenu, buildOverviewEmbed } = require("./disable");

module.exports = {
  name: "enable",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Administrator)")] });
    }

    const sub = args[0]?.toLowerCase();
    const guildId = message.guild.id;

    // ,enable list [#channel] — same interactive menu as ,disable list
    if (sub === "list") {
      const channel = message.mentions.channels.first() || null;
      return message.reply({
        embeds: [buildOverviewEmbed(message.guild, channel)],
        components: [buildCategoryMenu(channel ? "channel" : "global", channel?.id)],
      });
    }

    // ,enable channel #channel — clear every override in a channel
    if (sub === "channel") {
      const channel = message.mentions.channels.first();
      if (!channel) {
        return message.reply({ embeds: [warn("Missing Channel", "**Usage:** `,enable channel #channel`")] });
      }
      enableAllInChannel(guildId, channel.id);
      return message.reply("👌");
    }

    // ,enable <command> [#channel]
    if (!sub) {
      return message.reply({
        embeds: [warn(
          "Usage",
          "`,enable <command> [#channel]` — re-enable one command\n`,enable channel #channel` — clear all overrides in a channel\n`,enable list [#channel]` — browse & toggle commands interactively"
        )],
      });
    }

    const { commands } = require("../../handlers/prefix");
    const cmd = commands.get(sub);
    if (!cmd) {
      return message.reply({ embeds: [danger("Unknown Command", `No command named \`${sub}\`.`)] });
    }

    const channel = message.mentions.channels.first() || null;
    if (!isDisabled(guildId, channel?.id, cmd.name)) {
      return message.reply({ embeds: [warn("Not Disabled", `\`${cmd.name}\` isn't disabled${channel ? ` in ${channel}` : " server-wide"}.`)] });
    }

    enableCommand(guildId, cmd.name, channel?.id ?? null);
    return message.reply("👌");
  },
};
