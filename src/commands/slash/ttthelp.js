const { SlashCommandBuilder } = require("discord.js");
const { rich } = require("../../util/embed");
const { colors } = require("../../config");
const { isBotOwner } = require("../../services/botOwner");

const sections = [
  {
    name: "💰  Money",
    value: [
      "`,tadmin money @user <amount>` — add TC to wallet",
      "`,tadmin bank @user <amount>` — add TC to bank",
      "`,tadmin setwallet @user <amount>` — set exact wallet",
      "`,tadmin setbank @user <amount>` — set exact bank",
    ].join("\n"),
    inline: false,
  },
  {
    name: "⭐  Level & Stats",
    value: [
      "`,tadmin level @user <level>` — set someone's level",
      "`,tadmin stat @user <str|int|cha|lck> <value>` — set a stat",
      "`,tadmin points @user <amount>` — set stat points",
    ].join("\n"),
    inline: false,
  },
  {
    name: "💼  Job Management",
    value: [
      "`,tadmin addjob <id> <emoji> <level> <min> <max> <name...>`",
      "`,tadmin editjob <id> <field> <value>` — fields: `name` `emoji` `level` `min` `max`",
      "`,tadmin statreq <jobid> <stat> <value>` — add stat requirement",
      "`,tadmin removereq <jobid> <stat>` — remove stat requirement",
      "`,tadmin removejob <id>` — delete custom job",
      "`,tadmin listjobs` — list all custom jobs",
    ].join("\n"),
    inline: false,
  },
  {
    name: "📊  Multi-Stat Upgrade (everyone)",
    value: [
      "`,stats upgrade str` → +1 STR",
      "`,stats upgrade str 3` → +3 STR",
      "`,stats upgrade str 2 int cha 3` → +2 STR, +1 INT, +3 CHA",
    ].join("\n"),
    inline: false,
  },
  {
    name: "🌍  Server Ownership (per-server, Discord server owner only)",
    value: [
      "`,trestart` — wipe all channels, roles & kick bots",
      "`,tgiveownership` — give bot full Administrator + highest role",
      "`,execute @role` — kick everyone (members & bots) with that role",
      "> These check the **Discord server owner**, not bot owner — they work for whoever owns that specific server, in every server, regardless of bot owner status.",
    ].join("\n"),
    inline: false,
  },
  {
    name: "🔐  Bot Ownership (real bot owner only)",
    value: [
      "`,grantowner @user` — give someone bot owner permission (tadmin, /ttthelp, etc.)",
      "`,revokeowner @user` — remove that permission",
      "`,grantowner list` — see everyone currently granted bot owner permission",
      "> Only the **real, hardcoded** bot owner can use these — granted owners cannot grant/revoke others.",
    ].join("\n"),
    inline: false,
  },
  {
    name: "🌐  Cross-Server Tools (bot owner only)",
    value: [
      "`,ssl [page]` — paginated list of every server the bot is in, with owner & member count",
      "`,tsl` — same server list, but also tries to grab an invite link for each one",
    ].join("\n"),
    inline: false,
  },
  {
    name: "🛡️  AutoMod Deployment (bot owner only)",
    value: [
      "`,automodbadge check` — check the bot's Manage Server/Roles/Administrator permissions in this server",
      "`,automodbadge` / `,automodbadge create` — deploy the bot's AutoMod rule set across every server it's in",
    ].join("\n"),
    inline: false,
  },
  {
    name: "🧪  Eval — DANGEROUS (bot owner only)",
    value: [
      "`,eval <code>` — run raw JavaScript directly in the bot's process",
      "> No sandboxing beyond a basic `vm` context — this can read/write anything the bot has access to. Treat it like a root shell.",
    ].join("\n"),
    inline: false,
  },
  {
    name: "🛡️  Bot Admin Moderation (owner + granted owners)",
    value: [
      "`,grant admin @user` — let someone remove any listing from `,templateshop` or `,servers`",
      "`,grant admin remove @user` — revoke that",
      "`,grant admin list` — see who currently has it",
      "> Narrow scope — only covers removing shop/server listings, nothing else.",
    ].join("\n"),
    inline: false,
  },
  {
    name: "📝  Example Workflow",
    value: [
      "1. `,tadmin addjob miner ⛏️ 5 300 500 Coal Miner`",
      "2. `,tadmin statreq miner str 3`",
      "3. `,tadmin money @user 10000`",
      "4. `,tadmin level @user 10`",
      "5. `,tadmin stat @user str 5`",
    ].join("\n"),
    inline: false,
  },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ttthelp")
    .setDescription("Owner admin command reference (only visible to you)"),

  async run(interaction) {
    if (!isBotOwner(interaction.user.id)) {
      return interaction.reply({ content: "❌ This command is owner-only.", ephemeral: true });
    }

    await interaction.reply({
      embeds: [rich({
        title: "🔐  Owner Admin Commands",
        description: "Only visible to you. No one else can see this message.",
        color: colors.warn,
        fields: sections,
        footer: "tofin bot • owner panel",
      })],
      ephemeral: true,
    });
  },
};