const { generateLink, useLink, applyTemplate } = require("../../services/template");
const { hasAccess } = require("../../services/templateAccess");
const { success, info, danger, warn } = require("../../util/embed");

module.exports = {
  name: "templatelink",
  async run(message, args) {
    if (!hasAccess(message.guild, message.author.id)) {
      return message.reply({ embeds: [danger("Owner Only", "Only the server owner (or someone they've granted access via `,template grant`) can use template links.")] });
    }

    const arg = args[0];

    if (!arg) {
      return message.reply({ embeds: [warn("Missing Argument", "**To share a template:**\n`,templatelink <template name>`\n\n**To use a link someone gave you:**\n`,templatelink <code>`")] });
    }

    // Check if arg is a valid one-time code (12 hex chars)
    const { read } = require("../../storage");
    const links = read("tpl_links", {});

    if (links[arg] !== undefined) {
      // It's a code — use it
      if (links[arg].used) {
        return message.reply({ embeds: [danger("Link Already Used", "This link has already been used and is no longer valid.")] });
      }

      const result = useLink(arg);
      if (result.error) {
        return message.reply({ embeds: [danger("Invalid Link", result.error)] });
      }

      await message.reply({ embeds: [info(`🔨 Building from template **${result.tpl.name}**…`, "Channels will be locked during the process. You'll get a DM when it's done.")] });
      await applyTemplate(message.guild, result.tpl, "full", message.author);
    }

    // It's a template name — generate a link
    const name = args.join(" ");
    const code = generateLink(message.author.id, name);

    if (!code) {
      return message.reply({ embeds: [danger("Template Not Found", `You don't have a template named **${name}**.\nUse \`,template list\` to see your saved templates.`)] });
    }

    return message.reply({
      embeds: [success("Link Generated!", `Share this code with anyone:\n\`\`\`${code}\`\`\`They can use it once with:\n\`\`,templatelink ${code}\`\`\`\n⚠️ This link can only be used **once** then it expires.`)],
    });
  },
};
