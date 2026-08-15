const { read, write } = require("../storage");

const STORE_NAME = "bot_owners"; // data/bot_owners.json
const REAL_OWNER_ID = "1276884559467643042"; // hardcoded, permanent — only this ID can grant/revoke

function load() {
  // shape: { granted: [userId, ...] }
  return read(STORE_NAME, { granted: [] });
}

function save(data) {
  write(STORE_NAME, data);
}

function isRealOwner(userId) {
  return userId === REAL_OWNER_ID;
}

// True for the real owner OR anyone they've granted bot-owner permission to.
function isBotOwner(userId) {
  if (isRealOwner(userId)) return true;
  return load().granted.includes(userId);
}

function grantOwner(userId) {
  const data = load();
  if (!data.granted.includes(userId)) {
    data.granted.push(userId);
    save(data);
  }
  return data;
}

function revokeOwner(userId) {
  const data = load();
  data.granted = data.granted.filter((id) => id !== userId);
  save(data);
  return data;
}

function listGrantedOwners() {
  return load().granted;
}

module.exports = {
  REAL_OWNER_ID,
  isRealOwner,
  isBotOwner,
  grantOwner,
  revokeOwner,
  listGrantedOwners,
};
