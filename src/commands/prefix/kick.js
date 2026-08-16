const { PermissionFlagsBits } = require("discord.js");
const { danger, warn } = require("../../util/embed");

module.exports = {
  name: "kick",
  async run(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Kick Members)")] });
    }
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply({ embeds: [danger("Missing Permission", "I need the **Kick Members** permission to do that.")] });
    }

    const targets = [...message.mentions.members.values()];
    if (!targets.length) {
      return message.reply({ embeds: [warn("Missing User", "**Usage:** `,kick @user [reason]`\n**Example:** `,kick @John breaking the rules`\nYou can mention multiple users to kick them all at once.")] });
    }

    // Strip mentions from args to build the reason text
    const reasonParts = args.filter((a) => !/^<@!?\d+>$/.test(a));
    const reason = reasonParts.join(" ") || "No reason";

    const results = [];
    for (const member of targets) {
      if (member.id === message.author.id) {
        results.push({ tag: member.user.tag, success: false, error: "You can't kick yourself." });
        continue;
      }
      if (member.id === message.guild.ownerId) {
        results.push({ tag: member.user.tag, success: false, error: "Can't kick the server owner." });
        continue;
      }
      if (!member.kickable) {
        results.push({ tag: member.user.tag, success: false, error: "I can't kick this member (role hierarchy)." });
        continue;
      }
      if (member.roles.highest.position >= message.member.roles.highest.position && message.guild.ownerId !== message.author.id) {
        results.push({ tag: member.user.tag, success: false, error: "That member's highest role is above or equal to yours." });
        continue;
      }

      try {
        await member.send({
          embeds: [danger("You have been kicked", `**Server:** ${message.guild.name}\n**Reason:** ${reason}`)],
        }).catch(() => {});
        await member.kick(reason);
        results.push({ tag: member.user.tag, success: true });
      } catch (err) {
        results.push({ tag: member.user.tag, success: false, error: err.message });
      }
    }

    const failed = results.filter((r) => !r.success);

    if (!failed.length) {
      return message.reply("👌");
    }

    const details = failed.map((r) => `❌  **${r.tag}** — ${r.error}`).join("\n");
    return message.reply({
      embeds: [warn("Some Failed", `👌 Kicked ${results.length - failed.length}/${results.length}\n${details.length > 1000 ? details.slice(0, 997) + "…" : details}`)],
    });
  },
};
