const { read, write } = require("../storage");

const STORE = "automod";

const DEFAULT_RULES = {
  invites:     { enabled: false, action: "delete" },              // discord.gg / discord.com/invite links
  links:       { enabled: false, action: "delete" },               // any http(s) link
  caps:        { enabled: false, action: "delete", threshold: 70, minLength: 12 }, // % uppercase
  mentionSpam: { enabled: false, action: "delete", threshold: 5 }, // mentions in a single message
  emojiSpam:   { enabled: false, action: "delete", threshold: 10 },// emoji in a single message
  duplicate:   { enabled: false, action: "delete", threshold: 4, timeframe: 10_000 }, // repeated identical messages
};

function _read()   { return read(STORE, {}); }
function _write(d) { write(STORE, d); }

function defaultConfig() {
  return {
    enabled: false,
    words: [],
    rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
    whitelistChannels: [],
    whitelistRoles: [],
    logChannelId: null,
  };
}

function getConfig(guildId) {
  const d = _read();
  const cfg = d[guildId] ?? defaultConfig();
  // Backfill any rules added in later versions so upgrades don't lose new protections
  let changed = !d[guildId];
  cfg.rules = cfg.rules ?? {};
  for (const [name, def] of Object.entries(DEFAULT_RULES)) {
    if (!cfg.rules[name]) { cfg.rules[name] = { ...def }; changed = true; }
  }
  cfg.whitelistChannels = cfg.whitelistChannels ?? [];
  cfg.whitelistRoles = cfg.whitelistRoles ?? [];
  if (changed) { d[guildId] = cfg; _write(d); }
  return cfg;
}

function _save(guildId, cfg) {
  const d = _read();
  d[guildId] = cfg;
  _write(d);
}

function setEnabled(guildId, enabled) {
  const cfg = getConfig(guildId);
  cfg.enabled = enabled;
  _save(guildId, cfg);
}

function setRuleEnabled(guildId, ruleName, enabled) {
  const cfg = getConfig(guildId);
  if (!cfg.rules[ruleName]) return null;
  cfg.rules[ruleName].enabled = enabled;
  _save(guildId, cfg);
  return cfg.rules[ruleName];
}

function setRuleAction(guildId, ruleName, action) {
  const cfg = getConfig(guildId);
  if (!cfg.rules[ruleName]) return null;
  cfg.rules[ruleName].action = action;
  _save(guildId, cfg);
  return cfg.rules[ruleName];
}

function setRuleThreshold(guildId, ruleName, threshold) {
  const cfg = getConfig(guildId);
  if (!cfg.rules[ruleName] || cfg.rules[ruleName].threshold === undefined) return null;
  cfg.rules[ruleName].threshold = threshold;
  _save(guildId, cfg);
  return cfg.rules[ruleName];
}

function addWord(guildId, word) {
  const cfg = getConfig(guildId);
  const w = word.toLowerCase();
  if (!cfg.words.includes(w)) {
    cfg.words.push(w);
    _save(guildId, cfg);
    return true;
  }
  return false;
}

function removeWord(guildId, word) {
  const cfg = getConfig(guildId);
  const before = cfg.words.length;
  cfg.words = cfg.words.filter((w) => w !== word.toLowerCase());
  _save(guildId, cfg);
  return cfg.words.length < before;
}

function clearWords(guildId) {
  const cfg = getConfig(guildId);
  cfg.words = [];
  _save(guildId, cfg);
}

function addWhitelist(guildId, type, id) {
  const cfg = getConfig(guildId);
  const key = type === "channel" ? "whitelistChannels" : "whitelistRoles";
  if (!cfg[key].includes(id)) { cfg[key].push(id); _save(guildId, cfg); }
}

function removeWhitelist(guildId, type, id) {
  const cfg = getConfig(guildId);
  const key = type === "channel" ? "whitelistChannels" : "whitelistRoles";
  cfg[key] = cfg[key].filter((x) => x !== id);
  _save(guildId, cfg);
}

function setLogChannel(guildId, channelId) {
  const cfg = getConfig(guildId);
  cfg.logChannelId = channelId;
  _save(guildId, cfg);
}

// ── Duplicate-message tracking (in-memory) ──
const recentMessages = new Map(); // key: guildId:userId -> [{content, at}]

function _isWhitelisted(cfg, message) {
  if (cfg.whitelistChannels.includes(message.channel.id)) return true;
  if (message.member && cfg.whitelistRoles.some((r) => message.member.roles.cache.has(r))) return true;
  return false;
}

const INVITE_RE = /(discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i;
const LINK_RE = /https?:\/\/\S+/i;
const EMOJI_RE = /<a?:\w+:\d+>|\p{Extended_Pictographic}/gu;

/**
 * Evaluate a message against every enabled automod rule.
 * Returns { rule, action, reason } for the first rule that trips, or null.
 * Accepts the full discord.js Message object for context (mentions, member roles, etc).
 */
function check(guildId, message) {
  const cfg = getConfig(guildId);
  if (!cfg.enabled) return null;
  if (message.member?.permissions?.has?.("Administrator")) return null;
  if (_isWhitelisted(cfg, message)) return null;

  const content = message.content ?? "";
  const lower = content.toLowerCase();

  // ── Blocked words ──
  if (cfg.words.length) {
    const matched = cfg.words.find((w) => lower.includes(w));
    if (matched) return { rule: "words", action: "delete", reason: `blocked word \`${matched}\`` };
  }

  // ── Invite links ──
  if (cfg.rules.invites.enabled && INVITE_RE.test(content)) {
    return { rule: "invites", action: cfg.rules.invites.action, reason: "posting a Discord invite link" };
  }

  // ── Any link ──
  if (cfg.rules.links.enabled && LINK_RE.test(content)) {
    return { rule: "links", action: cfg.rules.links.action, reason: "posting a link" };
  }

  // ── Excessive caps ──
  if (cfg.rules.caps.enabled && content.length >= cfg.rules.caps.minLength) {
    const letters = content.replace(/[^a-zA-Z]/g, "");
    if (letters.length >= cfg.rules.caps.minLength) {
      const upper = letters.replace(/[^A-Z]/g, "").length;
      const pct = (upper / letters.length) * 100;
      if (pct >= cfg.rules.caps.threshold) {
        return { rule: "caps", action: cfg.rules.caps.action, reason: "excessive caps" };
      }
    }
  }

  // ── Mention spam ──
  if (cfg.rules.mentionSpam.enabled) {
    const count = message.mentions.users.size + message.mentions.roles.size;
    if (count >= cfg.rules.mentionSpam.threshold) {
      return { rule: "mentionSpam", action: cfg.rules.mentionSpam.action, reason: `mentioning ${count} users/roles at once` };
    }
  }

  // ── Emoji spam ──
  if (cfg.rules.emojiSpam.enabled) {
    const matches = content.match(EMOJI_RE);
    if (matches && matches.length >= cfg.rules.emojiSpam.threshold) {
      return { rule: "emojiSpam", action: cfg.rules.emojiSpam.action, reason: `${matches.length} emoji in one message` };
    }
  }

  // ── Duplicate / repeated messages ──
  if (cfg.rules.duplicate.enabled && content.trim().length > 0) {
    const key = `${guildId}:${message.author.id}`;
    const now = Date.now();
    const history = (recentMessages.get(key) || []).filter((e) => now - e.at < cfg.rules.duplicate.timeframe);
    history.push({ content: lower.trim(), at: now });
    recentMessages.set(key, history);
    const matches = history.filter((e) => e.content === lower.trim()).length;
    if (matches >= cfg.rules.duplicate.threshold) {
      recentMessages.set(key, []); // reset so we don't re-trigger every message
      return { rule: "duplicate", action: cfg.rules.duplicate.action, reason: "repeating the same message" };
    }
  }

  return null;
}

module.exports = {
  getConfig, setEnabled, addWord, removeWord, clearWords, check,
  setRuleEnabled, setRuleAction, setRuleThreshold,
  addWhitelist, removeWhitelist, setLogChannel,
  DEFAULT_RULES,
};
