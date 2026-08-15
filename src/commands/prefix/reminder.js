const { EmbedBuilder } = require("discord.js");
const { parseDuration, formatDuration } = require("../../util/time");
const { addReminder, getUserReminders, removeReminder } = require("../../services/reminder");
const { success, danger, warn, info } = require("../../util/embed");

module.exports = {
  name: "reminder",
  aliases: ["remind", "remindme"],
  async run(message, args) {
    const sub = args[0]?.toLowerCase();

    // ,reminder list
    if (sub === "list") {
      const reminders = getUserReminders(message.author.id);
      if (!reminders.length) {
        return message.reply({ embeds: [info("No Reminders", "You have no active reminders. Use `,reminder add <time> <text>` to create one.")] });
      }
      const lines = reminders.map((r) => {
        const timeLeft = r.fireAt - Date.now();
        const tl = timeLeft > 0 ? formatDuration(timeLeft) : "due now";
        return `**#${r.id}** — ${r.text} *(in ${tl})*`;
      }).join("\n");
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("⏰  Your Reminders")
            .setDescription(lines)
            .setColor(0x5865f2)
            .setFooter({ text: `${reminders.length} reminder${reminders.length !== 1 ? "s" : ""}` })
            .setTimestamp(),
        ],
      });
    }

    // ,reminder remove <id>
    if (sub === "remove" || sub === "delete" || sub === "cancel") {
      const id = parseInt(args[1]);
      if (isNaN(id)) return message.reply({ embeds: [warn("Invalid ID", "Usage: `,reminder remove <id>`\nUse `,reminder list` to see your reminder IDs.")] });
      const removed = removeReminder(message.author.id, id);
      if (!removed) return message.reply({ embeds: [danger("Not Found", `No reminder #${id} found. Use \`,reminder list\` to see your reminders.`)] });
      return message.reply({ embeds: [success("Removed", `Reminder **#${id}** has been cancelled.`)] });
    }

    // ,reminder add <duration> <text>
    // Also support: ,reminder add 1h Finish project
    const offset = sub === "add" ? 1 : 0;
    const durationStr = args[offset];
    const text = args.slice(offset + 1).join(" ").trim();

    if (!durationStr) {
      return message.reply({ embeds: [warn("Missing Duration", "**Usage:** `,reminder add <duration> <text>`\n**Examples:** `,reminder add 1h Finish project`\n**Supported units:** `m` (minutes), `h` (hours), `d` (days), `w` (weeks)")] });
    }

    const ms = parseDuration(durationStr);
    if (!ms) {
      return message.reply({ embeds: [warn("Invalid Duration", "Couldn't parse that duration.\n**Examples:** `30m`, `2h`, `1d`, `1w`")] });
    }
    if (!text) {
      return message.reply({ embeds: [warn("Missing Message", "Add a message after the duration.\n**Example:** `,reminder add 1h Check the oven`")] });
    }
    if (ms < 60_000) {
      return message.reply({ embeds: [warn("Too Short", "Minimum reminder time is **1 minute**.")] });
    }

    const fireAt = Date.now() + ms;
    const { id } = addReminder(message.author.id, message.channel.id, message.guild.id, text, fireAt);

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("⏰  Reminder Set")
          .setDescription(`I'll remind you in **${formatDuration(ms)}**.\n\n**Message:** ${text}`)
          .setColor(0x57f287)
          .addFields({ name: "Reminder ID", value: `#${id}`, inline: true })
          .setFooter({ text: "Use ,reminder list to view your reminders" })
          .setTimestamp(),
      ],
    });
  },
};
