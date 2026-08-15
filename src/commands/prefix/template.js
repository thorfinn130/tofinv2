const { PermissionFlagsBits } = require("discord.js");
const { saveTemplate, loadTemplate, addToServer, listTemplates, deleteTemplate, parseModeAndName, MODES } = require("../../services/template");
const { success, info, danger, warn } = require("../../util/embed");

// ─── Custom emojis (replace with your actual IDs) ───
const EMOJIS = {
  building: '<:building:1517241627507167242>',
  templates: '<:templates:1517240431266500779>',
  saved: '<:saved:1517207803671089242>',
  problem: '<:problem:1517207782456168548>',
  deleted: '<:deleted:1517207746792128752>'
};

const isOwner = (message) => message.author.id === message.guild.ownerId;
const isAdmin = (message) => message.member.permissions.has(PermissionFlagsBits.Administrator);

const LABELS = { roles: "roles", channels: "channels", bots: "bot roles", emojis: "emojis", stickers: "stickers" };

function formatAddResults(results) {
  const lines = [];
  for (const [cat, r] of Object.entries(results)) {
    let line = `**${LABELS[cat] ?? cat}:** ${r.added} added`;
    if (r.failed.length) {
      line += `, ${r.failed.length} skipped (${r.failed.map((f) => `${f.name}: ${f.reason}`).join(", ")})`;
    }
    lines.push(line);
  }
  return lines.join("\n") || "_Nothing to add._";
}

module.exports = {
  name: "template",
  aliases: ["tpl"],
  async run(message, args) {
    const sub = args[0]?.toLowerCase();

    // save & list — open to anyone with Administrator (includes owner, co-owner, admins)
    if (sub === "save") {
      if (!isAdmin(message)) {
        return message.reply({ embeds: [danger(`${EMOJIS.problem} Missing Permission`, "Permission: (Administrator)")] });
      }
      const name = args.slice(1).join(" ");
      if (!name) return message.reply({ embeds: [warn(`${EMOJIS.problem} Missing Name`, "Provide a name.\n**Usage:** `,template save <name>`")] });
      await message.guild.members.fetch();
      saveTemplate(message.guild, message.author.id, name);
      return message.reply({ embeds: [success(`${EMOJIS.saved} Done!`, `Template **${name}** saved to your account, including roles, channels, bot roles, emojis & stickers.\nYou can load it on any server you own.`)] });
    }

    if (sub === "list") {
      if (!isAdmin(message)) {
        return message.reply({ embeds: [danger(`${EMOJIS.problem} Missing Permission`, "Permission: (Administrator)")] });
      }
      const list = listTemplates(message.author.id);
      const desc = list.length
        ? list.map((t) => `• **${t.name}** — saved <t:${Math.floor(t.createdAt / 1000)}:R>`).join("\n")
        : "_No templates saved yet. Use `,template save <name>` to save one._";
      return message.reply({ embeds: [info(`${EMOJIS.templates} Your Templates`, desc)] });
    }

    if (sub === "delete") {
      if (!isAdmin(message)) {
        return message.reply({ embeds: [danger(`${EMOJIS.problem} Missing Permission`, "Permission: (Administrator)")] });
      }
      const name = args.slice(1).join(" ");
      if (!name) return message.reply({ embeds: [warn(`${EMOJIS.problem} Missing Name`, "Provide a template name.\n**Usage:** `,template delete <name>`")] });
      const deleted = deleteTemplate(message.author.id, name);
      if (!deleted) return message.reply({ embeds: [danger(`${EMOJIS.problem} Not Found`, `No template named **${name}** found in your account.`)] });
      return message.reply({ embeds: [success(`${EMOJIS.deleted} Deleted!`, `Template **${name}** has been permanently deleted.`)] });
    }

    // load — owner only (destructive: wipes and replaces the chosen categories)
    if (sub === "load") {
      if (!isOwner(message)) {
        return message.reply({ embeds: [danger(`${EMOJIS.problem} Owner Only`, "Only the server owner can load templates.")] });
      }
      const rest = args.slice(1);
      if (!rest.length) {
        return message.reply({ embeds: [warn(`${EMOJIS.problem} Missing Name`, "Provide a template name.\n**Usage:** `,template load <name> [roles,channels,bots,emojis,stickers]`")] });
      }
      const { modes, name } = parseModeAndName(rest);
      if (!name) {
        return message.reply({ embeds: [warn(`${EMOJIS.problem} Missing Name`, "Provide a template name.\n**Usage:** `,template load <name> [roles,channels,bots,emojis,stickers]`")] });
      }
      const modeLabel = modes.includes("full")
        ? "everything (roles, channels, bots, emojis & stickers)"
        : modes.map((m) => LABELS[m] ?? m).join(", ");

      await message.reply({
        embeds: [info(`${EMOJIS.building} Building from template **${name}**…`, `Loading: **${modeLabel}**\nThis replaces existing items in those categories. You'll get a DM when it's done.`)],
      });
      try {
        await loadTemplate(message.guild, message.author.id, name, modes, message.author);
      } catch (e) {
        await message.author.send({ embeds: [danger(`${EMOJIS.problem} Template Error`, e.message)] }).catch(() => {});
      }
      return;
    }

    // add — Administrator, purely additive (never deletes/touches existing items)
    if (sub === "add") {
      if (!isAdmin(message)) {
        return message.reply({ embeds: [danger(`${EMOJIS.problem} Missing Permission`, "Permission: (Administrator)")] });
      }
      const rest = args.slice(1);
      if (rest.length < 2) {
        return message.reply({
          embeds: [warn(
            `${EMOJIS.problem} Usage`,
            "`,template add <category> <name>`\n**Categories:** `roles` · `channels` · `bots` · `emojis` · `stickers` (comma-separated for multiple)\n**Example:** `,template add emojis My Server`\n**Example:** `,template add roles,emojis My Server`\n\nThis only **adds** items — nothing existing gets deleted or changed."
          )],
        });
      }

      const categoryArg = rest[0].toLowerCase();
      const categories = categoryArg.split(",").map((c) => c.trim()).filter(Boolean);
      const validCategories = categories.filter((c) => MODES.includes(c) && c !== "full");

      if (!validCategories.length) {
        return message.reply({ embeds: [warn(`${EMOJIS.problem} Invalid Category`, "**Valid categories:** `roles`, `channels`, `bots`, `emojis`, `stickers`")] });
      }

      const name = rest.slice(1).join(" ");
      if (!name) {
        return message.reply({ embeds: [warn(`${EMOJIS.problem} Missing Name`, "**Usage:** `,template add <category> <name>`")] });
      }

      const status = await message.reply({ embeds: [info(`${EMOJIS.building} Adding...`, `Adding **${validCategories.map((c) => LABELS[c] ?? c).join(", ")}** from **${name}** — this won't touch anything already here.`)] });

      try {
        const { results } = await addToServer(message.guild, message.author.id, name, validCategories);
        await status.edit({ embeds: [success(`${EMOJIS.saved} Added!`, formatAddResults(results))] });
      } catch (e) {
        await status.edit({ embeds: [danger(`${EMOJIS.problem} Template Error`, e.message)] });
      }
      return;
    }

    // ── Default help ──
    if (!isAdmin(message)) {
      return message.reply({ embeds: [danger(`${EMOJIS.problem} Missing Permission`, "Permission: (Administrator)")] });
    }

    return message.reply({
      embeds: [info(
        `${EMOJIS.templates} Template Usage`,
        "`,template save <name>` — save this server as a template (roles, channels, bots, emojis, stickers) *(Admin+)*\n" +
        "`,template list` — view your saved templates *(Admin+)*\n" +
        "`,template delete <name>` — permanently delete a saved template *(Admin+)*\n" +
        "`,template load <name>` — load everything, replacing existing *(Owner only)*\n" +
        "`,template load <name> roles` — replace roles only *(Owner only)*\n" +
        "`,template load <name> roles,channels,stickers` — replace multiple categories at once *(Owner only)*\n" +
        "`,template add <category> <name>` — **add** items without touching anything existing *(Admin+)*\n" +
        "`,template add emojis,stickers <name>` — add multiple categories at once *(Admin+)*\n" +
        "`,templatelink <name>` — share a template with a one-time link *(Owner only)*"
      )],
    });
  },
};