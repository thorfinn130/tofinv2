const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const {
  getConfig, setEnabled, addWord, removeWord, clearWords,
  setRuleEnabled, setRuleAction, setRuleThreshold,
  addWhitelist, removeWhitelist, setLogChannel,
} = require("../../services/automod");
const { danger, warn, info } = require("../../util/embed");

const ADMIN = PermissionFlagsBits.ManageGuild;
const RULES = ["invites", "links", "caps", "mentionSpam", "emojiSpam", "duplicate"];
const ACTIONS = ["delete", "warn", "mute"];

module.exports = {
  name: "automod",
  async run(message, args) {
    if (!message.member.permissions.has(ADMIN)) {
      return message.reply({ embeds: [danger("Missing Permission", "You need **Manage Server** to configure automod.")] });
    }

    const sub = args[0]?.toLowerCase();
    const guildId = message.guild.id;

    // ,automod (no sub) — show status
    if (!sub || sub === "status") {
      const cfg = getConfig(guildId);
      const rulesList = RULES.map((r) => {
        const rule = cfg.rules[r];
        const extra = rule.threshold !== undefined ? ` (${rule.threshold})` : "";
        return `${rule.enabled ? "✅" : "❌"} **${r}**${extra} → \`${rule.action}\``;
      }).join("\n");

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🛡️  Automod Settings")
            .setColor(cfg.enabled ? 0x57f287 : 0xed4245)
            .addFields(
              { name: "Status", value: cfg.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
              { name: "Blocked Words", value: `${cfg.words.length}`, inline: true },
              { name: "Log Channel", value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "Not set", inline: true },
              { name: "Rules", value: rulesList, inline: false },
            )
            .addFields({
              name: "Commands",
              value: "`,automod enable` / `,automod disable`\n`,automod add/remove/list/clear` — blocked words\n`,automod rule <name> <on|off>` — toggle a rule\n`,automod rule <name> action <delete|warn|mute>` — set response\n`,automod rule <name> threshold <n>` — set sensitivity\n`,automod whitelist <channel|role> <add|remove> <#channel|@role>`\n`,automod logchannel #channel`",
              inline: false,
            })
            .setFooter({ text: `Rules: ${RULES.join(", ")}` })
            .setTimestamp(),
        ],
      });
    }

    if (sub === "enable" || sub === "on") {
      setEnabled(guildId, true);
      return message.reply("👌");
    }

    if (sub === "disable" || sub === "off") {
      setEnabled(guildId, false);
      return message.reply("👌");
    }

    if (sub === "list") {
      const cfg = getConfig(guildId);
      if (!cfg.words.length) return message.reply({ embeds: [info("No Words", "No blocked words set. Use `,automod add <word>` to add one.")] });
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🚫  Blocked Words")
            .setDescription(cfg.words.map((w) => `\`${w}\``).join(", "))
            .setColor(0xed4245)
            .setFooter({ text: `${cfg.words.length} blocked word${cfg.words.length !== 1 ? "s" : ""}` })
            .setTimestamp(),
        ],
      });
    }

    if (sub === "add") {
      const word = args[1]?.toLowerCase();
      if (!word) return message.reply({ embeds: [warn("Missing Word", "**Usage:** `,automod add <word>`")] });
      const added = addWord(guildId, word);
      if (!added) return message.reply({ embeds: [warn("Already Added", `\`${word}\` is already in the blocked words list.`)] });
      return message.reply("👌");
    }

    if (sub === "remove") {
      const word = args[1]?.toLowerCase();
      if (!word) return message.reply({ embeds: [warn("Missing Word", "**Usage:** `,automod remove <word>`")] });
      const removed = removeWord(guildId, word);
      if (!removed) return message.reply({ embeds: [danger("Not Found", `\`${word}\` is not in the blocked words list.`)] });
      return message.reply("👌");
    }

    if (sub === "clear") {
      clearWords(guildId);
      return message.reply("👌");
    }

    if (sub === "rule") {
      const ruleName = args[1];
      if (!RULES.includes(ruleName)) {
        return message.reply({ embeds: [warn("Invalid Rule", `Available rules: ${RULES.join(", ")}`)] });
      }
      const action = args[2]?.toLowerCase();

      if (action === "on" || action === "off") {
        const updated = setRuleEnabled(guildId, ruleName, action === "on");
        return message.reply("👌");
      }
      if (action === "action") {
        const newAction = args[3]?.toLowerCase();
        if (!ACTIONS.includes(newAction)) {
          return message.reply({ embeds: [warn("Invalid Action", `Available: ${ACTIONS.join(", ")}`)] });
        }
        const updated = setRuleAction(guildId, ruleName, newAction);
        return message.reply("👌");
      }
      if (action === "threshold") {
        const n = parseInt(args[3]);
        if (isNaN(n) || n < 1) return message.reply({ embeds: [warn("Invalid Threshold", "Provide a positive number.")] });
        const updated = setRuleThreshold(guildId, ruleName, n);
        if (!updated) return message.reply({ embeds: [danger("Not Supported", `**${ruleName}** doesn't use a threshold.`)] });
        return message.reply("👌");
      }

      return message.reply({ embeds: [warn("Usage", "`,automod rule <name> <on|off>`\n`,automod rule <name> action <delete|warn|mute>`\n`,automod rule <name> threshold <n>`")] });
    }

    if (sub === "whitelist") {
      const type = args[1]?.toLowerCase();
      const action = args[2]?.toLowerCase();
      if (!["channel", "role"].includes(type) || !["add", "remove"].includes(action)) {
        return message.reply({ embeds: [warn("Usage", "`,automod whitelist channel add #channel`\n`,automod whitelist role add @role`")] });
      }
      const target = type === "channel" ? message.mentions.channels.first() : message.mentions.roles.first();
      if (!target) return message.reply({ embeds: [warn("Missing Target", `Mention a ${type} to ${action} from the whitelist.`)] });
      if (action === "add") addWhitelist(guildId, type, target.id);
      else removeWhitelist(guildId, type, target.id);
      return message.reply("👌");
    }

    if (sub === "logchannel") {
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply({ embeds: [warn("Missing Channel", "Mention a channel for automod logs.")] });
      setLogChannel(guildId, channel.id);
      return message.reply("👌");
    }

    return message.reply({ embeds: [warn("Unknown Subcommand", "**Available:** `enable` · `disable` · `add` · `remove` · `list` · `clear` · `rule` · `whitelist` · `logchannel` · `status`")] });
  },
};
