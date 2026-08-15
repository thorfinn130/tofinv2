const { read, write } = require("../storage");

const STORE_NAME = "status_roles"; // data/status_roles.json

function load() {
  // shape: { rules: [{ guildId, roleId, matchText, createdBy }] }
  return read(STORE_NAME, { rules: [] });
}

function save(data) {
  write(STORE_NAME, data);
}

function addRule({ guildId, roleId, matchText, createdBy }) {
  const data = load();
  // one rule per role — adding again just updates the match text
  const existing = data.rules.find((r) => r.guildId === guildId && r.roleId === roleId);
  if (existing) {
    existing.matchText = matchText;
    existing.createdBy = createdBy;
  } else {
    data.rules.push({ guildId, roleId, matchText, createdBy });
  }
  save(data);
}

function removeRule(guildId, roleId) {
  const data = load();
  const before = data.rules.length;
  data.rules = data.rules.filter((r) => !(r.guildId === guildId && r.roleId === roleId));
  save(data);
  return before !== data.rules.length;
}

function listRules(guildId) {
  return load().rules.filter((r) => r.guildId === guildId);
}

function getAllRules() {
  return load().rules;
}

module.exports = { addRule, removeRule, listRules, getAllRules };
