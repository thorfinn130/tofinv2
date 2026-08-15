const { EmbedBuilder } = require("discord.js");
const { danger, warn } = require("../../util/embed");
const { colors } = require("../../config");

const NUMBER_EMOJIS = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];

module.exports = {
  name: "poll",
  async run(message, args) {
    if (!message.member.permissions.has(8n) && !message.member.permissions.has(0x2000n)) {
      return message.reply({ embeds: [danger("Missing Permission", "Permission: (Manage Messages)")] });
    }
    const full = args.join(" ");
    const parts = full.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) {
      return message.reply({ embeds: [warn("Invalid Format", "Separate question and options with `|`.\n**Usage:** `,poll <question> | <option1> | <option2> ...`\n**Example:** `,poll Favourite colour? | Red | Blue | Green`")] });
    }
    const question = parts[0];
    const options = parts.slice(1);
    if (options.length > 10) {
      return message.reply({ embeds: [warn("Too Many Options", "Maximum **10** options allowed.")] });
    }

    const optionLines = options.map((o, i) => `${NUMBER_EMOJIS[i]}  ${o}`).join("\n");
    const embed = new EmbedBuilder()
      .setTitle(`📊  ${question}`)
      .setDescription(optionLines)
      .setColor(colors.primary)
      .setFooter({ text: `Poll by ${message.author.tag}` })
      .setTimestamp();

    await message.delete().catch(() => {});
    const pollMsg = await message.channel.send({ embeds: [embed] });
    for (let i = 0; i < options.length; i++) {
      await pollMsg.react(NUMBER_EMOJIS[i]).catch(() => {});
    }
  },
};
