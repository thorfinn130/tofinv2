const { info } = require("../../util/embed");
const jokes = [
  "Why don't scientists trust atoms? Because they make up everything.",
  "I told my computer I needed a break, it said 'no problem, I'll go to sleep.'",
  "Why did the developer go broke? Because he used up all his cache.",
];
module.exports = {
  name: "joke",
  run: (m) => m.reply({ embeds: [info("😂 Joke", jokes[Math.floor(Math.random() * jokes.length)])] }),
};
