const { read, write } = require("../storage");

const STORE = "reminders";
let _nextId = null;

function _read()   { return read(STORE, { reminders: [], nextId: 1 }); }
function _write(d) { write(STORE, d); }

function nextId() {
  const d = _read();
  const id = d.nextId ?? 1;
  d.nextId = id + 1;
  _write(d);
  return id;
}

/**
 * Add a reminder.
 * @param {string} userId
 * @param {string} channelId
 * @param {string} guildId
 * @param {string} text
 * @param {number} fireAt  Unix timestamp (ms)
 * @returns {{ id: number }}
 */
function addReminder(userId, channelId, guildId, text, fireAt) {
  const d = _read();
  const id = nextId();
  d.reminders.push({ id, userId, channelId, guildId, text, fireAt, createdAt: Date.now() });
  _write(d);
  return { id };
}

function getUserReminders(userId) {
  return _read().reminders.filter((r) => r.userId === userId);
}

function removeReminder(userId, id) {
  const d = _read();
  const before = d.reminders.length;
  d.reminders = d.reminders.filter((r) => !(r.userId === userId && r.id === id));
  _write(d);
  return d.reminders.length < before;
}

function getDueReminders() {
  const now = Date.now();
  return _read().reminders.filter((r) => r.fireAt <= now);
}

function removeById(id) {
  const d = _read();
  d.reminders = d.reminders.filter((r) => r.id !== id);
  _write(d);
}

module.exports = { addReminder, getUserReminders, removeReminder, getDueReminders, removeById };
