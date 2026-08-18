const { PermissionFlagsBits } = require("discord.js");
const { danger, warn, info } = require("../../util/embed");
const { resolveMember, formatAmbiguous } = require("../../util/resolve");
const { getAll, getForced, setForced, removeForced } = require("../../services/forcedNickname");

const SILENT = { users: [], repliedUser: false };

// True if a's highest role outranks b's highest role.
function outranks(a, b) {
  return a.roles.highest.comparePositionTo(b.roles.highest) > 0;
}

async function ack(message) {
  return message.react("👌").catch(() => message.reply("👌"));
}

module.exports = {
  name: "fn",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Manage Nicknames)")] });
    }

    const sub = args[0]?.toLowerCase();

    if (sub === "list") {
      const all = getAll(message.guild.id);
      const ids = Object.keys(all);
      if (!ids.length) return message.reply({ embeds: [info("Forced Nicknames", "No forced nicknames are currently active.")] });
      const lines = ids.map((id) => `<@${id}> — \`${all[id].nickname}\``).join("\n");
      return message.reply({ content: lines, allowedMentions: SILENT });
    }

    if (sub !== "add" && sub !== "remove") {
      return message.reply({
        embeds: [warn("Usage", "`,fn add <user> <nickname>` — force a nickname; reverts automatically if they change it\n`,fn remove <user>` — release a forced nickname\n`,fn list` — view active forced nicknames\n\nWorks with a mention, username, nickname, or a close typo of either. Requires a higher role than the target.")],
      });
    }

    const userQuery = args[1];
    if (!userQuery) {
      return message.reply({ embeds: [warn("Missing User", `**Usage:** \`,fn ${sub} <user>${sub === "add" ? " <nickname>" : ""}\``)] });
    }

    const userResult = resolveMember(message.guild, userQuery);
    if (userResult.status === "not_found") {
      return message.reply({ embeds: [warn("User Not Found", `Couldn't find anyone matching \`${userQuery}\`.`)] });
    }
    if (userResult.status === "ambiguous") {
      return message.reply({ content: formatAmbiguous(userResult, "member"), allowedMentions: SILENT });
    }
    const target = userResult.match;

    if (target.id === message.author.id) {
      return message.reply({ embeds: [warn("Not Allowed", "You can't force a nickname on yourself.")] });
    }
    if (target.id === message.guild.ownerId) {
      return message.reply({ embeds: [danger("Not Allowed", "Can't force a nickname on the server owner.")] });
    }
    // Role hierarchy: you must outrank the target (the guild owner is always exempt from this check)
    if (message.author.id !== message.guild.ownerId && !outranks(message.member, target)) {
      return message.reply({ embeds: [danger("Role Too Low", "Your highest role needs to be above theirs to do that.")] });
    }
    // The bot also needs to outrank them to actually change/lock the nickname
    if (!outranks(message.guild.members.me, target)) {
      return message.reply({ embeds: [danger("Bot Role Too Low", "My highest role needs to be above theirs — I can't change their nickname.")] });
    }

    if (sub === "remove") {
      const existing = getForced(message.guild.id, target.id);
      if (!existing) {
        return message.reply({ embeds: [warn("Not Forced", "That user doesn't have a forced nickname.")] });
      }
      removeForced(message.guild.id, target.id);
      return ack(message);
    }

    // add
    const nickname = args.slice(2).join(" ").trim();
    if (!nickname) {
      return message.reply({ embeds: [warn("Missing Nickname", "**Usage:** `,fn add <user> <nickname>`")] });
    }
    if (nickname.length > 32) {
      return message.reply({ embeds: [warn("Too Long", "Nicknames can be at most 32 characters.")] });
    }

    try {
      await target.setNickname(nickname, `Forced nickname set by ${message.author.tag}`);
    } catch {
      return message.reply({ embeds: [danger("Failed", "Couldn't set that nickname. Check my permissions and role position.")] });
    }
    setForced(message.guild.id, target.id, nickname, message.author.id);
    return ack(message);
  },
};
