// Reusable name resolution for commands that take a <user> or <role> argument
// as free text instead of a strict mention. Matches, in priority order:
//   1. Exact mention / snowflake ID
//   2. Exact username / role name (case-insensitive)
//   3. Exact display name / nickname (case-insensitive)
//   4. Partial match (prefix or substring)
//   5. Fuzzy, typo-tolerant match (edit distance)
// Only ever reads guild.members.cache / guild.roles.cache — never calls
// .fetch(), so this stays fast and makes no extra Discord API requests.

const MIN_SCORE = 40;  // floor to be considered a candidate at all
const SOLO_MIN  = 50;  // minimum score to auto-trust a single lone candidate
const AUTO_MIN  = 55;  // minimum top score to auto-pick among multiple candidates
const AUTO_GAP  = 15;  // top must lead the runner-up by at least this much to auto-pick

function normalize(s) {
  return (s ?? "").toString().toLowerCase().trim();
}

// Classic Levenshtein edit distance, iterative single-row DP (fast for the
// short strings — usernames/nicknames/role names — this is used on).
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

// 0-100 score for how well `query` matches `target`.
function scoreMatch(query, target) {
  const q = normalize(query);
  const t = normalize(target);
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 85 + Math.round(10 * (q.length / t.length));
  if (t.includes(q) || q.includes(t)) {
    const overlap = Math.min(q.length, t.length);
    const base = Math.max(q.length, t.length);
    return 75 + Math.round(10 * (overlap / base));
  }
  const dist = levenshtein(q, t);
  const maxLen = Math.max(q.length, t.length);
  const similarity = 1 - dist / maxLen;
  return similarity > 0 ? Math.round(similarity * 70) : 0; // capped below substring matches
}

function decide(scored) {
  const viable = scored.filter((s) => s.score >= MIN_SCORE);
  if (!viable.length) return { status: "not_found", match: null, candidates: [] };

  const top = viable[0];
  const topTies = viable.filter((v) => v.score === top.score);
  if (topTies.length > 1) return { status: "ambiguous", match: null, candidates: viable.slice(0, 5) };

  if (top.score === 100) return { status: "found", match: top.item, candidates: viable };

  const rest = viable.slice(1);
  if (!rest.length) {
    return top.score >= SOLO_MIN
      ? { status: "found", match: top.item, candidates: viable }
      : { status: "not_found", match: null, candidates: viable };
  }

  const second = rest[0];
  if (top.score >= AUTO_MIN && top.score - second.score >= AUTO_GAP) {
    return { status: "found", match: top.item, candidates: viable };
  }
  return { status: "ambiguous", match: null, candidates: viable.slice(0, 5) };
}

function bestMatch(query, entries, getNames) {
  const q = normalize(query).replace(/^[@&]/, "");
  const scored = [];
  for (const item of entries) {
    let best = 0;
    for (const name of getNames(item)) {
      if (!name) continue;
      const s = scoreMatch(q, name);
      if (s > best) best = s;
      if (best === 100) break; // can't do better than exact
    }
    if (best > 0) scored.push({ item, score: best });
  }
  scored.sort((a, b) => b.score - a.score);
  return decide(scored);
}

// ── Public API ─────────────────────────────────────────────────────────────

// Returns { status: "found"|"ambiguous"|"not_found", match, candidates }
// `match` is a GuildMember when found. `candidates` is [{ item, score }].
function resolveMember(guild, query) {
  if (!guild || !query) return { status: "not_found", match: null, candidates: [] };
  const raw = query.toString().trim();

  const mentionId = raw.match(/^<@!?(\d{15,21})>$/)?.[1] ?? (/^\d{15,21}$/.test(raw) ? raw : null);
  if (mentionId) {
    const member = guild.members.cache.get(mentionId);
    if (member) return { status: "found", match: member, candidates: [{ item: member, score: 100 }] };
  }

  return bestMatch(raw, [...guild.members.cache.values()], (m) => [
    m.user.username,
    m.user.globalName,
    m.nickname,
  ]);
}

// Same shape, `match` is a Role. Excludes @everyone from fuzzy candidates
// (still resolvable via an explicit mention/ID).
function resolveRole(guild, query) {
  if (!guild || !query) return { status: "not_found", match: null, candidates: [] };
  const raw = query.toString().trim();

  const mentionId = raw.match(/^<@&(\d{15,21})>$/)?.[1] ?? (/^\d{15,21}$/.test(raw) ? raw : null);
  if (mentionId) {
    const role = guild.roles.cache.get(mentionId);
    if (role) return { status: "found", match: role, candidates: [{ item: role, score: 100 }] };
  }

  return bestMatch(
    raw,
    [...guild.roles.cache.values()].filter((r) => r.id !== guild.id),
    (r) => [r.name]
  );
}

// Short "did you mean...?" text for an ambiguous result — deliberately plain
// text, not an embed, to stay out of the way.
function formatAmbiguous(result, kind = "member") {
  const lines = result.candidates.slice(0, 5).map(({ item }, i) => {
    const label = kind === "role" ? item.name : (item.nickname || item.user.globalName || item.user.username);
    const mention = kind === "role" ? `<@&${item.id}>` : `<@${item.id}>`;
    return `${i + 1}. ${mention} — \`${label}\``;
  });
  return `❓ Not sure which ${kind} you meant — could be:\n${lines.join("\n")}\n> Try again with an exact mention.`;
}

module.exports = { resolveMember, resolveRole, formatAmbiguous, scoreMatch };
