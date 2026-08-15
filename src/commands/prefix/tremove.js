const { success, warn } = require("../../util/embed");
const { removeFromQueue, getQueueInfo } = require("../../services/music");

module.exports = {
  name: "tremove",
  aliases: ["remove"],
  async run(message, args) {
    const index = parseInt(args[0]);
    if (!index || index < 1) {
      return message.reply({ embeds: [warn("Invalid Number", "Provide the position number of the song to remove from the queue.")] });
    }
    const qInfo = getQueueInfo(message.guild.id);
    if (index > qInfo.queue.length) {
      return message.reply({ embeds: [warn("Index Out of Range", `Queue has only ${qInfo.queue.length} songs.`)] });
    }
    const removed = removeFromQueue(message.guild.id, index);
    if (!removed) return message.reply({ embeds: [warn("Error", "Could not remove that song.")] });
    return message.reply({ embeds: [success("Removed", `Removed **${removed.title}** from the queue.`)] });
  },
};