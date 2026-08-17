const { PermissionFlagsBits } = require("discord.js");
const { saveTemplate, loadTemplate, addToServer, listTemplates, deleteTemplate, parseModeAndName, MODES } = require("../../services/template");
const { hasAccess, grant, revoke, getGranted } = require("../../services/templateAccess");
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
// Server owner, or anyone the owner has specifically granted template access to.
const canUseTemplates = (message) => hasAccess(message.guild, message.author.id);

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

    // grant/revoke/access — only the real owner can manage who else gets template access
    if (sub === "grant" || sub === "revoke") {
      if (!isOwner(message)) {
        return message.reply({ embeds: [danger(`${EMOJIS.problem} Owner Only`, "Only the server owner can grant or revoke template access.")] });
      }
      const { resolveMember, formatAmbiguous } = require("../../util/resolve");
      const query = args.slice(1).join(" ");
      if (!query) {
        return message.reply({ embeds: [warn(`${EMOJIS.problem} Missing User`, `**Usage:** \`,template ${sub} <user>\``)] });
      }
      const result = resolveMember(message.guild, query);
      if (result.status === "not_found") {
        return message.reply({ embeds: [warn(`${EMOJIS.problem} Not Found`, `Couldn't find anyone matching \`${query}\`.`)] });
      }
      if (result.status === "ambiguous") {
        return message.reply({ content: formatAmbiguous(result, "member"), allowedMentions: { users: [], repliedUser: false } });
      }
      const target = result.match;
      if (sub === "grant") {
        grant(message.guild.id, target.id);
        return message.reply({ content: `✓ Granted template access to <@${target.id}>`, allowedMentions: { users: [], repliedUser: false } });
      } else {
        revoke(message.guild.id, target.id);
        return message.reply({ content: `✓ Revoked template access from <@${target.id}>`, allowedMentions: { users: [], repliedUser: false } });
      }
    }

    if (sub === "access") {
      const ids = getGranted(message.guild.id);
      const desc = ids.length ? ids.map((id) => `<@${id}>`).join("\n") : "_No one has been granted template access yet._";
      return message.reply({ embeds: [info(`${EMOJIS.templates} Granted Template Access`, `${desc}\n\n*(The server owner always has access.)*`)] });
    }

    // save & list — Administrator, or anyone granted template access
    if (sub === "save") {
      if (!isAdmin(message) && !canUseTemplates(message)) {
        return message.reply({ embeds: [danger(`${EMOJIS.problem} Missing Permission`, "Permission: (Administrator), or ask the server owner to run `,template grant`")] });
      }
      const name = args.slice(1).join(" ");
      if (!name) return message.reply({ embeds: [warn(`${EMOJIS.problem} Missing Name`, "Provide a name.\n**Usage:** `,template save <name>`")] });
      await message.guild.members.fetch();
      saveTemplate(message.guild, message.author.id, name);
      return message.reply({ embeds: [success(`${EMOJIS.saved} Done!`, `Template **${name}** saved to your account, including roles, channels, bot roles, emojis & stickers.\nYou can load it on any server you own.`)] });
    }

    if (sub === "list") {
      if (!isAdmin(message) && !canUseTemplates(message)) {
        return message.reply({ embeds: [danger(`${EMOJIS.problem} Missing Permission`, "Permission: (Administrator), or ask the server owner to run `,template grant`")] });
      }
      const list = listTemplates(message.author.id);
      const desc = list.length
        ? list.map((t) => `• **${t.name}** — saved <t:${Math.floor(t.createdAt / 1000)}:R>`).join("\n")
        : "_No templates saved yet. Use `,template save <name>` to save one._";
      return message.reply({ embeds: [info(`${EMOJIS.templates} Your Templates`, desc)] });
    }

    if (sub === "delete") {
      if (!isAdmin(message) && !canUseTemplates(message)) {
        return message.reply({ embeds: [danger(`${EMOJIS.problem} Missing Permission`, "Permission: (Administrator), or ask the server owner to run `,template grant`")] });
      }
      const name = args.slice(1).join(" ");
      if (!name) return message.reply({ embeds: [warn(`${EMOJIS.problem} Missing Name`, "Provide a template name.\n**Usage:** `,template delete <name>`")] });
      const deleted = deleteTemplate(message.author.id, name);
      if (!deleted) return message.reply({ embeds: [danger(`${EMOJIS.problem} Not Found`, `No template named **${name}** found in your account.`)] });
      return message.reply({ embeds: [success(`${EMOJIS.deleted} Deleted!`, `Template **${name}** has been permanently deleted.`)] });
    }

    // load — owner, or anyone the owner has granted template access to (destructive: wipes and replaces the chosen categories)
    if (sub === "load") {
      if (!canUseTemplates(message)) {
        return message.reply({ embeds: [danger(`${EMOJIS.problem} Owner Only`, "Only the server owner (or someone they've granted access via `,template grant`) can load templates.")] });
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
    if (!isAdmin(message) && !canUseTemplates(message)) {
      return message.reply({ embeds: [danger(`${EMOJIS.problem} Missing Permission`, "Permission: (Administrator)")] });
    }

    return message.reply({
      embeds: [info(
        `${EMOJIS.templates} Template Usage`,
        "`,template save <name>` — save this server as a template *(Admin, or granted access)*\n" +
        "`,template list` — view your saved templates *(Admin, or granted access)*\n" +
        "`,template delete <name>` — permanently delete a saved template *(Admin, or granted access)*\n" +
        "`,template load <name> [roles,channels,bots,emojis,stickers]` — load, replacing existing *(Owner, or granted access)*\n" +
        "`,template add <category> <name>` — **add** items without touching anything existing *(Admin, or granted access)*\n" +
        "`,template grant <user>` / `,template revoke <user>` — delegate template access *(Owner only)*\n" +
        "`,template access` — see who currently has granted access\n" +
        "`,templatelink <name>` — share a template with a one-time link *(Owner, or granted access)*"
      )],
    });
  },
};