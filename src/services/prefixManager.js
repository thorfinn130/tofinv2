const { read, write } = require("../storage");
const fs = require("fs");
const path = require("path");
const STORE = "prefixes";

const DEFAULT_PREFIX = ",";

function getPrefix(guildId) {
  const data = read(STORE, {});
  console.log(`[prefixManager] getPrefix(${guildId}) -> "${data[guildId] || DEFAULT_PREFIX}"`);
  return data[guildId] || DEFAULT_PREFIX;
}

function setPrefix(guildId, prefix) {
  console.log(`[prefixManager] setPrefix(${guildId}, "${prefix}") called`);
  if (!prefix || prefix.length > 5) {
    console.log(`[prefixManager] Invalid prefix: "${prefix}"`);
    return false;
  }
  const data = read(STORE, {});
  console.log(`[prefixManager] Current data:`, data);
  data[guildId] = prefix;
  console.log(`[prefixManager] Saving data:`, data);
  write(STORE, data);
  console.log(`[prefixManager] Saved!`);

  // Check if file exists
  const filePath = path.join(__dirname, "../../data/prefixes.json");
  console.log(`[prefixManager] File exists? ${fs.existsSync(filePath)}`);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf8");
    console.log(`[prefixManager] File content: ${content}`);
  }

  return true;
}

module.exports = { getPrefix, setPrefix, DEFAULT_PREFIX };