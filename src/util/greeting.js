// Multiple word triggers, each with their own list of possible replies.
// Add as many slots as you want to the TRIGGERS array below.

const TRIGGERS = [
  {
    word: "T server",
    replies: ["https://discord.gg/bmJA22YVRM"],
  },
  {
    word: "bot invite link",
    replies: ["https://discord.com/oauth2/authorize?client_id=1430715467525259437&permissions=8&scope=bot%20applications.commands"],
  },
  // Add more triggers here if needed
];

const TYPING_DELAY_MS = 1500; // how long the typing indicator shows before the message is sent

function pickReply(replies) {
  return replies[Math.floor(Math.random() * replies.length)];
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Finds the first trigger whose word appears in the message (as a whole word).
function findTrigger(content) {
  const lower = content.toLowerCase();
  return TRIGGERS.find((t) => new RegExp(`\\b${t.word}\\b`, "i").test(lower));
}

async function handleTriggers(message) {
  const trigger = findTrigger(message.content);
  if (!trigger) return false;

  const text = pickReply(trigger.replies);

  // Triggers Discord's built-in "Bot is typing..." indicator (lasts ~10s or until a message is sent)
  await message.channel.sendTyping();
  await sleep(TYPING_DELAY_MS);
  await message.reply(text);

  return true;
}

module.exports = { handleTriggers };