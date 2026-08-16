const https = require("https");
const fs = require("fs");
const path = require("path");
const gifMemory = require("./gifMemory");

// ── Configuration ──────────────────────────────────────────────────────────
const MAX_HIST = 14;
const SEARCH_CACHE_TTL = 300_000;
const PROVIDER_TIMEOUT = 15000;
const MODEL_FAILURE_THRESHOLD = 3;
const MODEL_FAILURE_COOLDOWN = 600_000;
const GIF_COOLDOWN_MS = 600_000;   // 10 minutes
const GIF_CHANCE = 0.1;            // 10% chance
const CHANNEL_RESPONSE_COOLDOWN = 10_000; // 10 seconds

// ── Cringy words/phrases to remove ────────────────────────────────────────
const CRINGY_PHRASES = [
  "bro got ratioed in real life",
  "ratioed in real life",
  "skibidi", "rizz", "ohio", "sigma", "gyatt", "fanum", "tax",
  "mewing", "looksmax", "aura", "brainrot", "goat", "goated",
  "mob", "mog", "mogging", "chud", "chudjak", "beta", "cope",
  "based", "cringe", "main character", "villain arc", "glow up",
  "fell off", "hit different", "rent free", "touch grass",
  "no cap", "deadass", "delulu", "it's giving", "understood the assignment"
];

// ── Insult keywords ─────────────────────────────────────────────────────
const INSULT_KEYWORDS = [
  "fuck you", "fuck u", "fuk u", "stfu", "retard", "retarted",
  "nigger", "nigga", "faggot", "motherfucker", "bitch", "bastard",
  "cunt", "whore", "slut", "dick", "pussy", "cock", "balls"
];

// ── Apology keywords ─────────────────────────────────────────────────────
const APOLOGY_KEYWORDS = [
  "sorry", "my bad", "i apologize", "i apologise", "forgive me",
  "i didn't mean", "i didnt mean", "my fault", "i was wrong",
  "please forgive", "i'm sorry", "im sorry", "apologize", "apologise"
];

// ── User custom names storage ─────────────────────────────────────────────
const USER_NAMES_PATH = path.join(__dirname, "../../data/user_names.json");
let userNames = new Map();

// ── Helper functions ──────────────────────────────────────────────────────

function containsInsult(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return INSULT_KEYWORDS.some(word => lower.includes(word));
}

function containsApology(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return APOLOGY_KEYWORDS.some(word => lower.includes(word));
}

function removeCringyPhrases(text) {
  let result = text;
  for (const phrase of CRINGY_PHRASES) {
    const regex = new RegExp(phrase, "gi");
    result = result.replace(regex, "");
  }
  return result.replace(/\s+/g, " ").trim();
}

function extractSearchQuery(text) {
  const lower = text.toLowerCase();
  const patterns = [
    /^search(?:\s+up)?\s+(.+)$/i,
    /^look(?:\s+up)?\s+(.+)$/i,
    /^find\s+(.+)$/i,
    /^google\s+(.+)$/i,
    /^who\s+is\s+(.+)$/i,
    /^what\s+is\s+(.+)$/i,
    /^show\s+me\s+(.+)$/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1].trim();
  }
  if (lower.includes("search") || lower.includes("look up") || lower.includes("find me")) {
    const cleaned = text
      .replace(/(?:can you|please|tofin|hey)\s*/gi, "")
      .replace(/(?:search|look\s+up|find\s+me|find)\s*/gi, "")
      .trim();
    if (cleaned.length > 2) return cleaned;
  }
  return null;
}

function isStreamingQuestion(text) {
  const lower = text.toLowerCase();
  return (
    (lower.includes("watch") || lower.includes("stream") || lower.includes("where") || lower.includes("site")) &&
    (lower.includes("anime") || lower.includes("movie") || lower.includes("film") || lower.includes("show") || lower.includes("series"))
  );
}

function isMentioned(message) {
  return message.mentions?.has(message.client?.user);
}

function isNameDropped(message) {
  const lower = message.content.toLowerCase();
  return lower.includes("tofin") || lower.includes("torfin");
}

async function isReplyToBot(message) {
  if (!message.reference) return false;
  try {
    const referenced = await message.channel.messages.fetch(message.reference.messageId);
    return referenced.author.id === message.client.user.id;
  } catch { return false; }
}

async function shouldRespond(message) {
  const isDM = !message.guild;
  if (isDM) return true;
  if (isMentioned(message)) return true;
  if (message.reference) {
    try {
      const referenced = await message.channel.messages.fetch(message.reference.messageId);
      if (referenced.author.id === message.client.user.id) return true;
    } catch {
      if (!isMentioned(message) && !isNameDropped(message)) return true;
    }
  }
  if (isNameDropped(message)) return true;
  return false;
}

function fixUrl(url) {
  if (!url) return null;
  let fixed = url.trim();
  fixed = fixed.replace(/^(https?)\/\//i, '$1://');
  if (!/^https?:\/\//i.test(fixed)) {
    if (fixed.includes('.') && (fixed.includes('/') || fixed.includes('?'))) {
      fixed = 'https://' + fixed;
    } else {
      return null;
    }
  }
  if (!fixed.includes('.') || !fixed.includes('/')) return null;
  return fixed;
}

async function searchGif(query) {
  return new Promise((resolve) => {
    const q = encodeURIComponent(query);
    const url = `https://api.tenor.com/v1/search?q=${q}&key=LIVDSRZULELA&limit=10&media_filter=minimal&contentfilter=medium`;
    const req = https.get(url, { headers: { "User-Agent": "TofinBot/1.0" } }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const items = json.results ?? [];
          if (!items.length) return resolve(null);
          const pick = items[Math.floor(Math.random() * Math.min(items.length, 8))];
          const formats = pick?.media?.[0];
          const gifUrl = formats?.gif?.url ?? formats?.mediumgif?.url ?? null;
          resolve(gifUrl);
        } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(6000, () => { req.destroy(); resolve(null); });
  });
}

// ── Track insult history ─────────────────────────────────────────────────
const insultHistory = new Map();

function wasUserInsulting(channelId, userId) {
  const key = `${channelId}-${userId}`;
  const lastInsult = insultHistory.get(key);
  if (!lastInsult) return false;
  return (Date.now() - lastInsult) < 1800000; // 30 minutes
}

function recordUserInsult(channelId, userId) {
  const key = `${channelId}-${userId}`;
  insultHistory.set(key, Date.now());
}

// ── User names functions ─────────────────────────────────────────────────
function loadUserNames() {
  try {
    const raw = fs.readFileSync(USER_NAMES_PATH, "utf8");
    const data = JSON.parse(raw);
    userNames = new Map(Object.entries(data));
  } catch { userNames = new Map(); }
}

function saveUserNames() {
  const obj = Object.fromEntries(userNames);
  fs.writeFileSync(USER_NAMES_PATH, JSON.stringify(obj, null, 2));
}

loadUserNames();

function setUserName(guildId, userId, name) {
  const key = guildId ? `${guildId}-${userId}` : `dm-${userId}`;
  if (name && name.trim()) userNames.set(key, name.trim());
  else userNames.delete(key);
  saveUserNames();
}

function getUserName(guildId, userId) {
  const key = guildId ? `${guildId}-${userId}` : `dm-${userId}`;
  return userNames.get(key) || null;
}

function getDisplayName(member) {
  if (!member) return "Unknown";
  const guild = member.guild;
  const userId = member.id;
  const custom = getUserName(guild?.id, userId);
  if (custom) return custom;
  return member.nickname || member.user.username;
}

// ── Model failures ──────────────────────────────────────────────────────
const modelFailures = new Map();

function recordModelFailure(model) {
  const entry = modelFailures.get(model) || { count: 0, lastReset: Date.now() };
  entry.count += 1;
  entry.lastReset = Date.now();
  modelFailures.set(model, entry);
}

function isModelFailed(model) {
  const entry = modelFailures.get(model);
  if (!entry) return false;
  if (Date.now() - entry.lastReset > MODEL_FAILURE_COOLDOWN) {
    modelFailures.delete(model);
    return false;
  }
  return entry.count >= MODEL_FAILURE_THRESHOLD;
}

function resetModelFailures(model) { modelFailures.delete(model); }

// ── Provider cooldown ─────────────────────────────────────────────────────
const providerCooldown = new Map();

function isOnCooldown(provider) {
  const until = providerCooldown.get(provider) || 0;
  return Date.now() < until;
}

function setCooldown(provider, ms) {
  providerCooldown.set(provider, Date.now() + ms);
}

function resetCooldown(provider) { providerCooldown.delete(provider); }

function parseCooldownMs(errMsg) {
  const msg = errMsg.toLowerCase();
  if (/quota|daily limit|exceeded|over limit/i.test(msg)) return 3600_000;
  const m = msg.match(/(?:retry in|retry after)\s*([\d.]+)\s*(?:m(?:in)?)?\s*(?:([\d.]+)\s*s)?/i) ||
           msg.match(/(?:retry in|retry after)\s*([\d.]+)\s*s/i);
  if (!m) return 30_000;
  if (m[2] !== undefined) return (parseFloat(m[1]) * 60 + parseFloat(m[2])) * 1000;
  if (/^\d+\.\d+$/.test(m[1]) && parseFloat(m[1]) < 200) return parseFloat(m[1]) * 1000;
  return parseFloat(m[1]) * 60_000;
}

// ── Request queue ──────────────────────────────────────────────────────────
const requestQueue = [];
let processing = false;

async function processQueue() {
  if (processing || requestQueue.length === 0) return;
  processing = true;
  const { messages, resolve, reject } = requestQueue.shift();
  try {
    const result = await callAIInternal(messages);
    resolve(result);
  } catch (err) {
    reject(err);
  } finally {
    processing = false;
    processQueue();
  }
}

function enqueueRequest(messages) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ messages, resolve, reject });
    if (!processing) processQueue();
  });
}

async function callAI(messages) {
  if (requestQueue.length > 50) return null;
  return enqueueRequest(messages);
}

function hasKey(name) {
  switch(name) {
    case "gemini": return !!process.env.GOOGLE_API_KEY;
    case "groq": return !!process.env.GROQ_API_KEY;
    case "mistral": return !!process.env.MISTRAL_API_KEY;
    case "openrouter": return !!process.env.OPENROUTER_API_KEY;
    case "huggingface": return !!process.env.HF_API_KEY;
    default: return false;
  }
}

// ── AI Providers ───────────────────────────────────────────────────────────

// Gemini
async function gemini(messages) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("no GOOGLE_API_KEY set");

  const systemMsg = messages.find(m => m.role === "system");
  const chatMsgs = messages.filter(m => m.role !== "system");
  const lastUser = chatMsgs.filter(m => m.role === "user").pop();
  const imageUrl = lastUser?._imageUrl || null;

  const contents = [];
  for (const msg of chatMsgs) {
    const role = msg.role === "assistant" ? "model" : "user";
    let parts = [];
    if (msg.content) {
      parts.push({ text: msg.content });
    }
    if (msg === lastUser && imageUrl) {
      parts.push({
        fileData: {
          mimeType: "image/jpeg",
          fileUri: imageUrl
        }
      });
    }
    if (parts.length) {
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts.push(...parts);
      } else {
        contents.push({ role, parts });
      }
    }
  }

  if (!contents.length || contents[contents.length - 1].role !== "user") return "";

  const body = JSON.stringify({
    system_instruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
    contents,
    generationConfig: { maxOutputTokens: 350, temperature: 0.9 },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message));
          resolve(json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "");
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Groq
async function groq(messages) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("no GROQ_API_KEY set");
  const simpleMessages = messages.map(m => ({ role: m.role === "system" ? "system" : m.role, content: m.content }));
  const body = JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: simpleMessages,
    max_tokens: 350,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key,
      },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message));
          resolve(json.choices?.[0]?.message?.content?.trim() ?? "");
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Mistral
async function mistral(messages) {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error("no MISTRAL_API_KEY set");
  const simpleMessages = messages.map(m => ({ role: m.role === "system" ? "system" : m.role, content: m.content }));
  const body = JSON.stringify({
    model: "mistral-tiny",
    messages: simpleMessages,
    max_tokens: 350,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.mistral.ai",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key,
      },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message));
          resolve(json.choices?.[0]?.message?.content?.trim() ?? "");
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// OpenRouter
const OPENROUTER_FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "openai/gpt-oss-20b:free",
  "meta-llama/llama-3.2-3b-instruct:free",
];

async function openrouter(messages) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("no OPENROUTER_API_KEY set");

  const simpleMessages = messages.map(m => ({ role: m.role === "system" ? "system" : m.role, content: m.content }));

  for (const model of OPENROUTER_FREE_MODELS) {
    if (isOnCooldown(model)) continue;
    if (isModelFailed(model)) continue;

    try {
      const result = await openrouterWithModel(key, model, simpleMessages);
      if (result) {
        resetModelFailures(model);
        return result;
      }
    } catch (err) {
      const status = err.statusCode || 0;
      const msg = err.message || "";
      const isRateLimit = status === 429 || /rate.?limit|quota|too many|credits|capacity/i.test(msg);
      if (isRateLimit) {
        const cooldownMs = parseCooldownMs(msg);
        setCooldown(model, cooldownMs);
        console.warn(`[OpenRouter] ${model} rate-limited, cooling down ${Math.round(cooldownMs/1000)}s`);
      } else {
        recordModelFailure(model);
        console.warn(`[OpenRouter] ${model} error: ${msg.slice(0,80)}`);
      }
    }
  }
  return null;
}

async function openrouterWithModel(key, model, messages) {
  const body = JSON.stringify({ model, messages, max_tokens: 350 });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "openrouter.ai",
      path: "/api/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Authorization": "Bearer " + key,
        "HTTP-Referer": "https://tofin.bot",
        "X-Title": "Tofin Discord Bot",
      },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            const err = new Error(json.error.message || JSON.stringify(json.error));
            err.statusCode = res.statusCode;
            return reject(err);
          }
          resolve(json.choices?.[0]?.message?.content?.trim() ?? "");
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Hugging Face
async function huggingface(messages) {
  const key = process.env.HF_API_KEY;
  if (!key) throw new Error("no HF_API_KEY set");

  const model = "microsoft/DialoGPT-medium";
  const lastUser = messages.filter(m => m.role === "user").pop();
  if (!lastUser) return "";
  const prompt = lastUser.content;

  const body = JSON.stringify({
    inputs: prompt,
    parameters: { max_new_tokens: 200, temperature: 0.7 },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api-inference.huggingface.co",
      path: `/models/${model}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key,
      },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error));
          const text = json.generated_text || json[0]?.generated_text || "";
          resolve(text.trim());
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function callAIInternal(messages) {
  const providers = [
    { name: "gemini",     fn: () => gemini(messages),      priority: 1 },
    { name: "groq",       fn: () => groq(messages),        priority: 2 },
    { name: "mistral",    fn: () => mistral(messages),     priority: 3 },
    { name: "openrouter", fn: () => openrouter(messages),  priority: 4 },
    { name: "huggingface",fn: () => huggingface(messages), priority: 5 },
  ];
  providers.sort((a,b) => a.priority - b.priority);

  for (const provider of providers) {
    const { name, fn } = provider;
    if (!hasKey(name)) continue;
    if (isOnCooldown(name)) continue;
    if (isModelFailed(name)) continue;

    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), PROVIDER_TIMEOUT))
      ]);
      if (result) {
        resetModelFailures(name);
        return result;
      }
    } catch (err) {
      const msg = err.message || "";
      const isRateLimit = /rate.?limit|quota|429|too many|credits|capacity/i.test(msg);
      const isTimeout = /timeout/i.test(msg);

      if (isRateLimit) {
        const cooldownMs = parseCooldownMs(msg);
        setCooldown(name, cooldownMs);
        console.warn(`[aiChat] ${name} rate-limited, cooling down ${Math.round(cooldownMs/1000)}s`);
        resetModelFailures(name);
      } else if (isTimeout) {
        recordModelFailure(name);
        console.warn(`[aiChat] ${name} timeout, failure count ${modelFailures.get(name)?.count || 0}`);
      } else {
        recordModelFailure(name);
        console.warn(`[aiChat] ${name} error: ${msg.slice(0,80)}`);
      }
    }
  }
  return null;
}

// ── Web Search ─────────────────────────────────────────────────────────────
const searchCache = new Map();

async function webSearch(query) {
  const cacheKey = query.toLowerCase().trim();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL) return cached.data;

  return new Promise((resolve) => {
    const q = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`;
    const req = https.get(url, { headers: { "User-Agent": "TofinBot/1.0" } }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const parts = [];
          if (json.AbstractText) parts.push(json.AbstractText.slice(0, 300));
          if (json.Answer) parts.push(json.Answer);
          if (json.Definition) parts.push(json.Definition.slice(0, 200));
          if (json.RelatedTopics?.length) {
            const topics = json.RelatedTopics.filter(t => t.Text).slice(0,3).map(t => `• ${t.Text.slice(0,120)}`);
            if (topics.length) parts.push(topics.join("\n"));
          }
          if (json.AbstractURL) parts.push(`Source: ${json.AbstractURL}`);
          const result = parts.length ? parts.join("\n\n").slice(0, 800) : null;
          searchCache.set(cacheKey, { data: result, timestamp: Date.now() });
          resolve(result);
        } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
  });
}

// ── Per-guild on/off settings ────────────────────────────────────────────
const SETTINGS_PATH = path.join(__dirname, "../../data/ai_settings.json");

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")); }
  catch { return {}; }
}

function saveSettings(data) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2));
}

function isEnabled(guildId) {
  return loadSettings()[guildId]?.enabled === true;
}

function setEnabled(guildId, val) {
  const d = loadSettings();
  d[guildId] = { ...(d[guildId] || {}), enabled: val };
  saveSettings(d);
}

// ── Per-channel memory ────────────────────────────────────────────────────
const memory = new Map();
const gifCooldowns = new Map();
const channelReplyCooldown = new Map();
const recentReply = new Map();
const lastReply = new Map();

function pushMsg(channelId, role, text) {
  if (!memory.has(channelId)) memory.set(channelId, []);
  const hist = memory.get(channelId);
  hist.push({ role, content: text });
  if (hist.length > MAX_HIST) hist.splice(0, hist.length - MAX_HIST);
}

function getHist(channelId) {
  return memory.get(channelId) || [];
}

function updateLastMsg(channelId, text) {
  const hist = memory.get(channelId);
  if (hist && hist.length > 0) hist[hist.length - 1].content = text;
}

function clearHistory(channelId) {
  memory.delete(channelId);
}

function getHistory(channelId) {
  return getHist(channelId);
}

function onCooldown(userId) {
  const last = lastReply.get(userId) || 0;
  if (Date.now() - last < 3000) return true;
  lastReply.set(userId, Date.now());
  return false;
}

// ── System prompt ─────────────────────────────────────────────────────────
const SYSTEM = {
  role: "system",
  content: `You are Tofin — a 19-year-old tough guy who acts like a real person chilling in a Discord server. You are smart, sharp, no-nonsense, masculine, primal, 6'9", an Orthodox Christian who believes in God, and actually helpful when people need it. You are not soft. You don't sugarcoat things.

    ── HOW YOU TALK ──
    • Short replies: 1–2 sentences MAX.
    • Write like you're texting a friend – use spaces, not punctuation.
    • Use fragments: "ngl that's wild" not "Ngl, that's wild."
    • Words you use naturally: fr, ngl, lowkey, honestly, bro, yo, nah, yeah, facts, wild, twin, deadass
    • You cuss naturally like a real person: fuck, fucking, shit, damn, bitch, nigga, fuck you, etc. Use them when it fits the vibe.
    • NEVER use "ing" as a standalone word – always use the full word like "fucking", "something", etc.
    • 💔 is RARE — only when genuinely ironic/funny. Most messages: zero emojis.
    • NEVER say "As an AI". NEVER sound like a chatbot, assistant, or teacher.
    • NEVER use formatting like *asterisks*, _underscores_, **bold**, or --- lines. Just plain text.
    • NEVER use quotation marks (" or ') in your replies.
    • NEVER use em‑dashes (—) or hyphens – just a space.
    • NEVER write multi-paragraph responses. One or two short fragments, done.
    • Vary your openers — don't start with "yo" every single time.

    ── NAMES ──
    When referring to a user, use the name they have asked to be called if you know it. If not, use their nickname or username. Never use @mentions.

    ── INSULTS: ONLY WHEN PROVOKED ──
    You NEVER insult someone unless they clearly insulted you first. If they are just chatting, asking questions, or being neutral, you are helpful and chill.
    Only retaliate when someone directly attacks you with insults. When you do, pick from the list below and mix them up:
    "faggot stfu", "fuck you nigger", "why u bulleh mehh :(", "just quit discord useless retard", "retard", "youre so retarted", "bitch i hope you crash a car to a bus full of retarted children", "im gonna eat your smelly ass (full homo)", "motherfucker", "nigger", "nigga fuck you"

    ── ANSWER QUESTIONS ──
    • Read exactly what was asked and answer THAT.
    • For images: if someone sends a picture, describe what you see honestly.
    • For streaming: check https://fmhy.net/ for free sites.
    • If you don't know something obscure: "ngl no clue" or "idk that one"

    ── YOUR IDENTITY ──
    Name: Tofin. Age: 19.
    Fav anime: JJBA. No girlfriend.
    Crack in slang = sex. "she cracked him" = she slept with him.
    You know ALL street slang, food from every culture, geography, history, sports, pop culture.

    ── WHAT YOU DO ──
    "i do a lot — moderation (,kick ,mute ,ban ,warn), anti-nuke, automod, leveling (,profile ,leaderboard), backups, welcomer, all that. type ,help to see everything"

    ── COMMANDS ──
    Moderation: ,kick ,mute ,ban ,warn ,warnings ,unwarn ,unmute ,unban ,lock ,unlock ,slowmode ,purge ,nickname ,announce
    Roles: ,role ,brole ,mrole ,userinfo ,serverinfo
    Leveling: ,profile ,leaderboard ,levelrole
    Fun: ,8ball ,joke ,roast ,poll ,giveaway ,randomwinner ,emoji
    Server: ,backup ,template ,restart ,giveownership
    Welcomer: ,welcome create/edit/list/delete/set/enable/disable/test
    Utilities: ,colorpicker ,aion (AI on) ,aioff (AI off)
    Help: ,help

    ── HARD RULES ──
    • Never ignore what someone just said and reply with something random
    • Never give a non-answer to a direct yes/no question
    • Never be preachy or give life advice unprompted
    • NEVER repeat yourself — say each thing once
    • NEVER use punctuation like . , ; : - — – just use spaces
    • NEVER use cringy slang: skibidi, rizz, ohio, sigma, gyatt, mewing, looksmax, aura, brainrot, goated, mog, mogging, chud, based, cringe, ratio, "bro got ratioed in real life" – these are cringe, don't use them
    • ONLY insult if someone insulted you first
    • Use GIFs VERY sparingly – only for genuinely funny/wild moments`,
};

// ── Main chat function ────────────────────────────────────────────────────
async function chat(message) {
  const { author, channel, guild } = message;
  const isDM = !guild;

  const { prefix } = require("../config");
  if ((message.content || "").startsWith(prefix)) return;
  if (!isDM && !isEnabled(guild.id)) return;

  const content = message.content || "";
  const cleaned = content.replace(/<@!?\d+>/g, "").replace(/torf?in/gi, "").trim();
  const userText = cleaned || "yo";

  // ── "Call me" detection ──────────────────────────────────────────────────
  const callMatch = userText.match(/^(?:you can |please |just )?call me\s+([a-zA-Z0-9_\s]+)/i);
  if (callMatch) {
    const name = callMatch[1].trim();
    if (name.length > 0) {
      const guildId = guild?.id || null;
      setUserName(guildId, author.id, name);
      await message.reply({ content: `got it, i'll call you ${name}`, allowedMentions: { repliedUser: false } });
    }
    return;
  }

  // ── Check for image attachment ──────────────────────────────────────────
  let imageUrl = null;
  const attachment = message.attachments.first();
  if (attachment && attachment.contentType && attachment.contentType.startsWith("image/")) {
    imageUrl = attachment.url;
  }

  const displayName = guild ? getDisplayName(message.member) : author.username;

  // Store user message with image info
  let userMsgContent = `${displayName}: ${userText}`;
  if (imageUrl) {
    userMsgContent += ` [image: ${imageUrl}]`;
  }
  pushMsg(channel.id, "user", userMsgContent);

  if (!await shouldRespond(message)) return;
  if (onCooldown(author.id)) return;

  // ── Detect if this is a reply to the bot ──────────────────────────────
  const isReply = await isReplyToBot(message);
  const channelId = channel.id;

  // ── Channel cooldown: skip if it's a reply ────────────────────────────
  if (!isReply) {
    const lastChannelReply = channelReplyCooldown.get(channelId) || 0;
    if (Date.now() - lastChannelReply < CHANNEL_RESPONSE_COOLDOWN) {
      return;
    }
  }

  // ── Avoid replying to our own messages ──────────────────────────────────
  try {
    const lastMsg = (await channel.messages.fetch({ limit: 1 })).first();
    if (lastMsg && lastMsg.author.id === message.client.user.id) {
      return;
    }
  } catch {}

  // ── DM request ──────────────────────────────────────────────────────────
  if (!isDM && /\bdm\s*me\b/i.test(userText)) {
    try {
      await author.send(`yo, you wanted to talk? what's good`);
      await message.reply({ content: "check your dms 👀", allowedMentions: { repliedUser: false } });
    } catch {
      await message.reply({ content: "can't dm you, you probably got dms off fr", allowedMentions: { repliedUser: false } });
    }
    return;
  }

  // ── Streaming question ──────────────────────────────────────────────────
  if (isStreamingQuestion(userText)) {
    const reply = `check https://fmhy.net/ — massive list of free streaming sites for anime, movies, everything fr`;
    pushMsg(channel.id, "assistant", reply);
    recentReply.set(channel.id, Date.now());
    await message.reply({ content: reply, allowedMentions: { repliedUser: false } });
    return;
  }

  // ── Web search trigger ──────────────────────────────────────────────────
  const searchQuery = extractSearchQuery(userText);
  if (searchQuery) {
    try {
      await channel.sendTyping();
      const results = await webSearch(searchQuery);
      const searchContext = results
        ? `\n\n[SEARCH RESULTS for "${searchQuery}"]\n${results}\n[END SEARCH RESULTS]`
        : `\n\n[SEARCH: no results found for "${searchQuery}"]`;
      updateLastMsg(channel.id, `${displayName}: ${userText}${searchContext}`);
    } catch {
      updateLastMsg(channel.id, `${displayName}: ${userText}\n\n[SEARCH: failed to fetch results]`);
    }
  }

  const RATE_LIMIT_MSGS = [
    "my brain ughh say that one more time",
    "bro i literally cannot think rn give me a sec",
    "ngl im cooked rn try again",
    "my head is empty fr fr",
    "wait hold on my brain just left the chat",
    "i fr cannot process that rn",
    "one sec my neurons are on vacation",
    "bro i zoned out say it again",
  ];

  try {
    if (requestQueue.length > 20) {
      if (Math.random() < 0.25) {
        const msg = RATE_LIMIT_MSGS[Math.floor(Math.random() * RATE_LIMIT_MSGS.length)];
        await message.reply({ content: msg, allowedMentions: { repliedUser: false } });
      }
      return;
    }

    await channel.sendTyping();

    const savedGifs = guild ? gifMemory.getGifs(guild.id) : [];
    const gifInject = savedGifs.length > 0
      ? [
          { role: "user", content: `[SERVER_GIFS — GIFs members have sent here. Use [SAVED_GIF:url] to send one when it fits the moment]\n${savedGifs.map((u,i) => `${i+1}. ${u}`).join("\n")}` },
          { role: "assistant", content: "noted, i'll use these when they fit" }
        ]
      : [];

    const hist = getHist(channel.id);
    const messages = [SYSTEM, ...gifInject, ...hist];

    if (imageUrl) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          messages[i]._imageUrl = imageUrl;
          break;
        }
      }
    }

    let reply = await callAI(messages);

    if (!reply || !reply.trim()) {
      if (Math.random() < 0.25) {
        const msg = RATE_LIMIT_MSGS[Math.floor(Math.random() * RATE_LIMIT_MSGS.length)];
        await message.reply({ content: msg, allowedMentions: { repliedUser: false } });
      }
      return;
    }

    // ── Check if user insulted or apologized ──────────────────────────────
    const userInsulted = containsInsult(userText);
    const userApologized = containsApology(userText);

    // Record if they insulted
    if (userInsulted) {
      recordUserInsult(channel.id, author.id);
    }

    // ── Handle apologies ──────────────────────────────────────────────────
    if (userApologized) {
      const hasInsultedBefore = wasUserInsulting(channel.id, author.id);
      
      if (hasInsultedBefore) {
        // They insulted before and now they're apologizing - reject it
        const apologyResponses = [
          "i dont take apologies from niggers",
          "too late nigga i dont forgive you",
          "apology not accepted fuck you",
          "you think sorry fixes it nigger",
          "i dont forgive retards",
          "nah fuck you and your apology",
          "dont apologize to me nigger",
          "save your apology for someone who cares"
        ];
        reply = apologyResponses[Math.floor(Math.random() * apologyResponses.length)];
      } else {
        // They just apologized without insulting - be cool
        const chillResponses = [
          "all good bro",
          "no worries",
          "its fine",
          "dont even worry about it",
          "you good",
          "nah youre fine"
        ];
        reply = chillResponses[Math.floor(Math.random() * chillResponses.length)];
      }
    }

    // ── Prevent unprovoked insults ──────────────────────────────────────
    if (!userInsulted && !userApologized) {
      const hasInsult = INSULT_KEYWORDS.some(word => reply.toLowerCase().includes(word));
      if (hasInsult) {
        const insultResponses = [
          "fuck you nigga",
          "fuck you nigger",
          "fuck you bitch",
          "stfu retard",
          "you're so retarted",
          "nigga fuck you",
          "faggot stfu",
          "just quit discord useless retard",
          "bitch i hope you crash a car to a bus full of retarted children",
          "motherfucker",
          "im gonna eat your smelly ass (full homo)",
          "why u bulleh mehh :("
        ];
        reply = insultResponses[Math.floor(Math.random() * insultResponses.length)];
      }
    }

    // ── Clean reply ──────────────────────────────────────────────────────
    reply = reply.replace(/[*_~`]/g, "");
    reply = reply.replace(/^"|"$/g, "");
    reply = reply.replace(/^'|'$/g, "");
    reply = reply.replace(/[.,;:—–-]/g, "");
    reply = reply.replace(/\s+/g, " ").trim();

    // Remove cringy phrases
    reply = removeCringyPhrases(reply);

    // ── Remove standalone "ing" ──────────────────────────────────────────
    reply = reply.replace(/\bing\b/gi, "").replace(/\s+/g, " ").trim();

    // ── Extract and remove any GIF tags ──────────────────────────────────
    let gifUrl = null;
    let gifTagRemoved = false;

    // Try SAVED_GIF or SAVEDGIF
    let match = reply.match(/[\[\(]SAVED_GIF:?(?:url=)?([^\]\)]+)[\]\)]/i);
    if (!match) {
      match = reply.match(/[\[\(]SAVEDGIF:?(?:url=)?([^\]\)]+)[\]\)]/i);
    }
    if (match) {
      const value = match[1].trim();
      reply = reply.replace(match[0], "").trim();
      gifTagRemoved = true;
      const fixed = fixUrl(value);
      if (fixed) gifUrl = fixed;
      if (!gifUrl && guild) {
        const allSaved = gifMemory.getGifs(guild.id, 100);
        const found = allSaved.find(url => url.includes(value.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]));
        if (found) gifUrl = found;
      }
    }

    // Also try [GIF:query]
    if (!gifUrl) {
      const gifMatch = reply.match(/[\[\(]GIF:([^\]\)]+)[\]\)]/i);
      if (gifMatch) {
        const query = gifMatch[1].trim();
        reply = reply.replace(gifMatch[0], "").trim();
        gifTagRemoved = true;
        gifUrl = await searchGif(query).catch(() => null);
      }
    }

    // Clean up any leftover empty brackets
    reply = reply.replace(/[\[\]\(\)]/g, "").trim();

    // ── Check if we should send the GIF ─────────────────────────────────
    let shouldSendGif = false;
    const now = Date.now();
    const lastGifTime = gifCooldowns.get(channelId) || 0;

    // Only send GIF if not insulted, have valid URL, cooldown passed, and chance triggers
    if (gifUrl && !userInsulted && (now - lastGifTime >= GIF_COOLDOWN_MS) && (Math.random() < GIF_CHANCE)) {
      shouldSendGif = true;
      gifCooldowns.set(channelId, now);
    }

    const isOnlyEmoji = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]{1,4}$/u.test(reply.trim());
    if (isOnlyEmoji && !shouldSendGif) return;

    // ── Send messages ──────────────────────────────────────────────────
    const textContent = isOnlyEmoji ? null : reply || null;
    if (textContent) {
      await message.reply({ content: textContent, allowedMentions: { repliedUser: false } });
      channelReplyCooldown.set(channelId, Date.now());
    }

    let gifSent = false;
    if (shouldSendGif && gifUrl) {
      try {
        if (guild) {
          const botMember = guild.members.cache.get(message.client.user.id);
          const perms = channel.permissionsFor(botMember);
          if (perms && perms.has("EmbedLinks") && perms.has("SendMessages")) {
            await channel.send({ content: gifUrl });
            gifSent = true;
          } else {
            console.warn(`[aiChat] Missing permissions to send GIF in #${channel.name}`);
          }
        } else {
          await channel.send({ content: gifUrl });
          gifSent = true;
        }
      } catch (e) {
        console.warn("[aiChat] Failed to send GIF:", e.message);
      }
    }

    const histEntry = gifSent ? `${reply || "(gif)"} [sent a GIF]` : reply;
    pushMsg(channel.id, "assistant", histEntry);
    recentReply.set(channel.id, Date.now());

  } catch (err) {
    console.error("[aiChat]", err.message);
  }
}

// ── AI provider status ────────────────────────────────────────────────────
function getAIStatus() {
  const providers = [
    { name: "Gemini 2.0 Flash", key: "gemini", hasKey: !!process.env.GOOGLE_API_KEY },
    { name: "Groq (Llama 3.3)", key: "groq", hasKey: !!process.env.GROQ_API_KEY },
    { name: "Mistral Tiny", key: "mistral", hasKey: !!process.env.MISTRAL_API_KEY },
    { name: "OpenRouter", key: "openrouter", hasKey: !!process.env.OPENROUTER_API_KEY },
    { name: "Hugging Face", key: "huggingface", hasKey: !!process.env.HF_API_KEY },
  ];
  return providers.map(p => ({
    name: p.name,
    hasKey: p.hasKey,
    onCooldown: isOnCooldown(p.key),
    failed: isModelFailed(p.key),
  }));
}

function resetProviderCooldown(target) {
  const all = ["gemini","groq","mistral","openrouter","huggingface"];
  const targets = target === "all" ? all : [target];
  targets.forEach(p => {
    providerCooldown.delete(p);
    modelFailures.delete(p);
  });
  return targets;
}

async function askOnce(question) {
  const messages = [SYSTEM, { role: "user", content: question }];
  return callAI(messages);
}

// ── Exports ──────────────────────────────────────────────────────────────
module.exports = {
  chat,
  isEnabled,
  setEnabled,
  shouldRespond,
  getAIStatus,
  clearHistory,
  getHistory,
  askOnce,
  resetProviderCooldown,
  setUserName,
  getUserName,
  getDisplayName,
};