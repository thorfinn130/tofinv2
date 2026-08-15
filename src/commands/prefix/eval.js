const { danger, info, success } = require("../../util/embed");

module.exports = {
  name: "eval",
  async run(message, args) {
    // Only the bot owner can use this
    if (message.author.id !== "1276884559467643042") { // replace with your ID
      return message.reply({ embeds: [danger("Owner Only", "This command is restricted to the bot owner.")] });
    }

    const code = args.join(" ");
    if (!code) {
      return message.reply({ embeds: [info("Usage", "`,eval <code>`")] });
    }

    try {
      // Use `vm` for a slightly safer eval (still not secure, but better than raw eval)
      const vm = require("vm");
      const sandbox = {
        console: console,
        message: message,
        client: message.client,
        // Add more safe objects as needed
      };
      const result = vm.runInNewContext(code, sandbox, { timeout: 5000 });
      return message.reply({
        embeds: [success("Eval Result", `\`\`\`js\n${String(result).slice(0, 1000)}\n\`\`\``)],
      });
    } catch (err) {
      return message.reply({
        embeds: [danger("Eval Error", `\`\`\`js\n${err.message.slice(0, 1000)}\n\`\`\``)],
      });
    }
  },
};