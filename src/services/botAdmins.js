const { read, write } = require("../storage");

const STORE_NAME = "bot_admins"; // data/bot_admins.json

function load() {
  // shape: { admins: [userId, ...] }
  return read(STORE_NAME, { admins: [] });
}

function save(data) {
  write(STORE_NAME, data);
}

function isBotAdmin(userId) {
  return load().admins.includes(userId);
}

function grantAdmin(userId) {
  const data = load();
  if (!data.admins.includes(userId)) {
    data.admins.push(userId);
    save(data);
  }
  return data;
}

function revokeAdmin(userId) {
  const data = load();
  data.admins = data.admins.filter((id) => id !== userId);
  save(data);
  return data;
}

function listAdmins() {
  return load().admins;
}

module.exports = { isBotAdmin, grantAdmin, revokeAdmin, listAdmins };
