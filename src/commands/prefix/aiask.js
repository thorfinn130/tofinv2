const { askOnce, isEnabled } = require("../../services/aiChat");

module.exports = {
  name: "aiask",
  aliases: ["ask"],
  async run(message, args) {
    if (!args.length) {
      return message.reply({ content: "❌ Give me something to answer — `,aiask <your question>`" });
    }

    if (!isEnabled(message.guild.id)) {
      return message.reply({ content: "❌ AI chat is off in this server. Enable it with `,aion`." });
    }

    const question = args.join(" ");

    try {
      await message.channel.sendTyping();
      const answer = await askOnce(`${message.author.username}: ${question}`);
      if (!answer || !answer.trim()) {
        return message.reply({ content: "ngl couldn't think of anything rn, try again" });
      }
      return message.reply({ content: answer, allowedMentions: { repliedUser: false } });
    } catch {
      return message.reply({ content: "❌ AI is down rn, try again in a sec" });
    }
  },
};
