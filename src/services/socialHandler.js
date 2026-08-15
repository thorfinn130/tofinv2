const { handleTikTok } = require("./tiktok");
const { handleTwitter } = require("./twitter");
const { handlePinterest } = require("./pinterest");

async function handleSocial(message) {
  let handled = await handleTikTok(message).catch(() => false);
  if (handled) return true;

  handled = await handleTwitter(message).catch(() => false);
  if (handled) return true;

  handled = await handlePinterest(message).catch(() => false);
  if (handled) return true;


  return false;
}

module.exports = { handleSocial };