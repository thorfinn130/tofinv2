const { info, warn } = require("../../util/embed");
const roasts = [
  "You bring everyone so much joy… when you leave the room.",
  "You're proof that even evolution takes breaks.",
  "If laziness was an Olympic sport, you'd come fourth so you didn't have to climb the podium.",
];
module.exports = {
  name: "roast",
  run(message) {
    const user = message.mentions.users.first();
    if (!user) {
      return message.reply({ embeds: [warn("Missing User", "You need to mention someone to roast!\n**Usage:** `,roast @user`\n**Example:** `,roast @John`")] });
    }
    const r = roasts[Math.floor(Math.random() * roasts.length)];
    return message.reply({ embeds: [info(`🔥 Roast for ${user.tag}`, r)] });
  },
};
