const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { danger, warn } = require("../../util/embed");

const NAMED_COLORS = {
  red: 0xff0000, blue: 0x0000ff, green: 0x00ff00, yellow: 0xffff00,
  orange: 0xff8800, purple: 0x8800ff, pink: 0xff69b4, white: 0xffffff,
  black: 0x000001, cyan: 0x00ffff, magenta: 0xff00ff, gold: 0xffd700,
  silver: 0xc0c0c0, navy: 0x000080, teal: 0x008080, lime: 0x00ff88,
  indigo: 0x4b0082, violet: 0xee82ee, maroon: 0x800000, olive: 0x808000,
};

function parseColor(str) {
  if (!str) return 0;
  const named = NAMED_COLORS[str.toLowerCase()];
  if (named !== undefined) return named;
  const hex = str.replace("#", "");
  const n = parseInt(hex, 16);
  return isNaN(n) ? 0 : n;
}

module.exports = {
  name: "rc",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: **Manage Roles**")] });
    }

    const name = args[0];
    if (!name) return message.reply({ embeds: [warn("Usage", "**Usage:** `,rc <name> [color]`\n**Examples:** `,rc Moderator` or `,rc VIP #FF5500` or `,rc Staff gold`")] });

    const colorStr = args[1];
    const color    = colorStr ? parseColor(colorStr) : 0;

    if (colorStr && color === 0 && colorStr.toLowerCase() !== "black") {
      return message.reply({ embeds: [warn("Invalid Color", `Couldn't parse color **${colorStr}**.\n**Examples:** \`#FF5500\`, \`red\`, \`blue\`, \`gold\``)] });
    }

    const role = await message.guild.roles.create({
      name,
      color,
      reason: `Created by ${message.author.tag}`,
    });

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("✅  Role Created")
          .setDescription(`Role ${role} has been created.`)
          .setColor(color || 0x5865f2)
          .addFields(
            { name: "Name",       value: role.name, inline: true },
            { name: "Color",      value: colorStr ? `${colorStr} (\`#${role.color.toString(16).toUpperCase().padStart(6, "0")}\`)` : "Default", inline: true },
            { name: "Role ID",    value: role.id,   inline: true },
          )
          .setFooter({ text: `Created by ${message.author.tag}` })
          .setTimestamp(),
      ],
    });
  },
};
