const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

// ── In-memory cache ────────────────────────────────────────────────────────
// Every store is read from disk at most once per process lifetime; after
// that, reads are a plain Map lookup (no I/O, no JSON.parse). This is the
// biggest single latency win here — most commands touch storage 2-3+ times
// per invocation (read config, maybe read again, write), and previously
// every one of those was a synchronous, event-loop-blocking disk read.
const cache = new Map();
const WRITE_DEBOUNCE_MS = 300;
const pendingTimers = new Map();
const dirty = new Set();

function loadFromDisk(name, fallback) {
  try {
    const p = filePath(name);
    if (!fs.existsSync(p)) return structuredClone(fallback);
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return structuredClone(fallback);
  }
}

function read(name, fallback) {
  if (!cache.has(name)) cache.set(name, loadFromDisk(name, fallback));
  return cache.get(name);
}

function flush(name) {
  const timer = pendingTimers.get(name);
  if (timer) { clearTimeout(timer); pendingTimers.delete(name); }
  if (!dirty.has(name) || !cache.has(name)) return;
  dirty.delete(name);
  try {
    fs.writeFileSync(filePath(name), JSON.stringify(cache.get(name), null, 2));
  } catch (err) {
    console.error(`[storage] failed to persist "${name}":`, err.message);
  }
}

function write(name, data) {
  // Update the in-memory copy immediately — anything that reads right after
  // a write (common pattern: read, modify, write, read again) sees the new
  // value instantly, with zero disk I/O in the hot path.
  cache.set(name, data);
  dirty.add(name);

  // Persist to disk on a short debounce so bursts of writes to the same
  // store (e.g. automod processing a raid) collapse into one disk write
  // instead of one per call, without ever blocking the caller.
  const existing = pendingTimers.get(name);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => flush(name), WRITE_DEBOUNCE_MS);
  timer.unref?.(); // don't keep the process alive just for this
  pendingTimers.set(name, timer);
}

// Flush everything immediately — used on graceful shutdown so a debounced
// write in flight doesn't get lost if the process exits right after.
function flushAll() {
  for (const name of [...dirty]) flush(name);
}
process.on("SIGINT", flushAll);
process.on("SIGTERM", flushAll);
process.on("beforeExit", flushAll);

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

module.exports = { read, write, getGuild, setGuild, getUser, setUser, flushAll };
