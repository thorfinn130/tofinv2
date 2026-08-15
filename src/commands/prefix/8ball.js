const { info, warn } = require("../../util/embed");
const answers = [
  "Yes.", "No.", "Definitely.", "Ask again later.", "Doubt it.", "100%.",
  "Not in this lifetime.", "Signs point to yes.", "Absolutely not.",
];
module.exports = {
  name: "8ball",
  run(message, args) {
    if (!args.length) {
      return message.reply({ embeds: [warn("Missing Question", "You need to ask something!\n**Usage:** `,8ball <question>`\n**Example:** `,8ball will I win today?`")] });
    }
    const a = answers[Math.floor(Math.random() * answers.length)];
    return message.reply({ embeds: [info("🎱 Magic 8-Ball", `**Q:** ${args.join(" ")}\n**A:** ${a}`)] });
  },
};
