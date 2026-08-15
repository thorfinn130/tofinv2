const { success, warn } = require("../../util/embed");
const { clear, getQueueInfo } = require("../../services/music");

module.exports = {
  name: "tclear",
  aliases: ["clearqueue"],
  async run(message) {
    const qInfo = getQueueInfo(message.guild.id);
    if (qInfo.queue.length === 0) {
      return message.reply({ embeds: [warn("Queue Empty", "There are no songs in the queue to clear.")] });
    }
    clear(message.guild.id);
    return message.reply({ embeds: [success("Cleared", "The queue has been cleared.")] });
  },
};