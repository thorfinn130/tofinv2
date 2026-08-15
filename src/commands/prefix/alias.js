const { EmbedBuilder } = require("discord.js");
const { getAliases, addAlias, removeAlias } = require("../../services/alias");

// ─── Your custom emojis ──────────────────────────────
const EMOJIS = {
  checkmark: '<:checkmark:1517974555728023672>',
  deleted:   '<:deleted:1517207746792128752>',
  problem:   '<:problem:1517207782456168548>',
  error:     '<:error:1517975133405577399>',
  app:       '<:app:1519108045714620486>'
};

module.exports = {
  name: "alias",
  async run(message, args) {
    if (!message.member.permissions.has(0x20n)) {
      const embed = new EmbedBuilder()
        .setTitle(`${EMOJIS.error}  Missing Permission`)
        .setDescription("You need **Manage Server** to manage aliases.")
        .setColor(0xED4245);
      return message.reply({ embeds: [embed] });
    }

    const sub = args[0]?.toLowerCase();

    // ── List ──
    if (!sub || sub === "list") {
      const aliases = getAliases(message.guild.id);
      const entries = Object.entries(aliases);
      if (!entries.length) {
        const embed = new EmbedBuilder()
          .setTitle(`${EMOJIS.app}  No Aliases`)
          .setDescription("No aliases set for this server.\n**Add one:** `,alias add <command> <alias>`")
          .setColor(0x5865f2);
        return message.reply({ embeds: [embed] });
      }
      const lines = entries.map(([a, cmd]) => `**,${a}** → \`,${cmd}\``).join("\n");
      const embed = new EmbedBuilder()
        .setTitle(`${EMOJIS.app}  Server Aliases`)
        .setDescription(lines)
        .setColor(0x5865f2)
        .setFooter({ text: `${entries.length} alias${entries.length !== 1 ? "es" : ""}` })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // ── Add ──
    if (sub === "add" || sub === "set") {
      const argsWithoutSub = args.slice(1);
      if (argsWithoutSub.length < 2) {
        const embed = new EmbedBuilder()
          .setTitle(`${EMOJIS.problem}  Usage`)
          .setDescription(
            "**Correct order:** `,alias add <command> <alias>`\n" +
            "**Example:** `,alias add mute m` → now `,m` runs `,mute`"
          )
          .setColor(0xFEE75C);
        return message.reply({ embeds: [embed] });
      }

      // Last argument is the alias (shortcut)
      const alias = argsWithoutSub.pop().toLowerCase();
      const command = argsWithoutSub.join(" ").trim();

      if (!alias || !command) {
        const embed = new EmbedBuilder()
          .setTitle(`${EMOJIS.problem}  Usage`)
          .setDescription(
            "**Correct order:** `,alias add <command> <alias>`\n" +
            "**Example:** `,alias add mute m` → now `,m` runs `,mute`"
          )
          .setColor(0xFEE75C);
        return message.reply({ embeds: [embed] });
      }

      if (alias.length > 20) {
        const embed = new EmbedBuilder()
          .setTitle(`${EMOJIS.problem}  Too Long`)
          .setDescription("Alias must be 20 characters or fewer.")
          .setColor(0xFEE75C);
        return message.reply({ embeds: [embed] });
      }

      // ── Swap detection: if command is 1 letter and alias is longer ──
      // That suggests the user reversed them. We'll block and suggest correction.
      if (command.length === 1 && alias.length > 1) {
        const embed = new EmbedBuilder()
          .setTitle(`${EMOJIS.problem}  Did you mean?`)
          .setDescription(
            `⚠️ **Did you mean:** \`,alias add ${alias} ${command}\`?\n` +
            `That would make **,${command}** run \`,${alias}\`.`
          )
          .setColor(0xFEE75C);
        return message.reply({ embeds: [embed] });
      }

      // Check for existing alias
      const current = getAliases(message.guild.id);
      if (current[alias]) {
        const embed = new EmbedBuilder()
          .setTitle(`${EMOJIS.problem}  Already Exists`)
          .setDescription(`The alias **,${alias}** already points to \`,${current[alias]}\`.\nRemove it first with \`,alias remove ${alias}\`.`)
          .setColor(0xFEE75C);
        return message.reply({ embeds: [embed] });
      }

      // ── Add the alias ──
      addAlias(message.guild.id, alias, command);
      const embed = new EmbedBuilder()
        .setTitle(`${EMOJIS.checkmark}  Alias Added`)
        .setDescription(`**,${alias}** will now run \`,${command}\``)
        .setColor(0x57F287);
      return message.reply({ embeds: [embed] });
    }

    // ── Remove ──
    if (sub === "remove" || sub === "delete") {
      const alias = args[1]?.toLowerCase();
      if (!alias) {
        const embed = new EmbedBuilder()
          .setTitle(`${EMOJIS.problem}  Usage`)
          .setDescription("**Usage:** `,alias remove <alias>`")
          .setColor(0xFEE75C);
        return message.reply({ embeds: [embed] });
      }
      const removed = removeAlias(message.guild.id, alias);
      if (!removed) {
        const embed = new EmbedBuilder()
          .setTitle(`${EMOJIS.error}  Not Found`)
          .setDescription(`No alias **,${alias}** exists in this server.`)
          .setColor(0xED4245);
        return message.reply({ embeds: [embed] });
      }
      const embed = new EmbedBuilder()
        .setTitle(`${EMOJIS.deleted}  Alias Removed`)
        .setDescription(`The alias **,${alias}** has been removed.`)
        .setColor(0x57F287);
      return message.reply({ embeds: [embed] });
    }

    // ── Default help ──
    const embed = new EmbedBuilder()
      .setTitle(`${EMOJIS.problem}  Alias Help`)
      .setDescription(
        "`,alias add <command> <alias>` — create a shortcut\n" +
        "**Example:** `,alias add mute m` → now `,m` runs `,mute`\n" +
        "`,alias remove <alias>` — delete one\n" +
        "`,alias list` — view all aliases"
      )
      .setColor(0xFEE75C);
    return message.reply({ embeds: [embed] });
  },
};