const path = require('path');
const fs   = require('fs');

function findBotEntry(dir, depth) {
  if (depth > 4) return null;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return null; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    if (e.isDirectory()) {
      if (e.name === 'src') {
        const candidate = path.join(dir, 'src', 'index.js');
        if (fs.existsSync(candidate)) return candidate;
      }
      const found = findBotEntry(path.join(dir, e.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}

const entry = findBotEntry('/home/container', 0);

if (!entry) {
  console.error('[ERROR] Could not find src/index.js anywhere on the server.');
  process.exit(1);
}

const base = path.dirname(path.dirname(entry));
process.chdir(base);
require(entry);
