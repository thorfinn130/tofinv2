const { getWarnings } = require("../../services/moderation");
const { info } = require("../../util/embed");

module.exports = {
  name: "warnings",
  run(message) {
    const user = message.mentions.users.first() ?? message.author;
    const list = getWarnings(message.guild.id, user.id);
    const desc = list.length
      ? list.map((w, i) => `**${i + 1}.** ${w.reason} — <@${w.by}>`).join("\n")
      : "_No warnings._";
    return message.reply({ embeds: [info(`Warnings for ${user.tag}`, desc)] });
  },
};
