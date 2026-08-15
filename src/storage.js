const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function file(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function read(name, fallback) {
  try {
    if (!fs.existsSync(file(name))) return fallback;
    return JSON.parse(fs.readFileSync(file(name), "utf8"));
  } catch {
    return fallback;
  }
}

function write(name, data) {
  fs.writeFileSync(file(name), JSON.stringify(data, null, 2));
}

function getGuild(name, guildId, fallback) {
  const all = read(name, {});
  return all[guildId] ?? fallback;
}
function setGuild(name, guildId, value) {
  const all = read(name, {});
  all[guildId] = value;
  write(name, all);
}

function getUser(name, userId, fallback) {
  const all = read(name, {});
  return all[userId] ?? fallback;
}
function setUser(name, userId, value) {
  const all = read(name, {});
  all[userId] = value;
  write(name, all);
}

module.exports = { read, write, getGuild, setGuild, getUser, setUser };
