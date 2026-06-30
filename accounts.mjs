// accounts.mjs — multi-account registry + rotation for quota-spreading across plan/key accounts.
//
// A provider (codex, antigravity, openrouter, claude) can register MULTIPLE accounts; the engine
// rotates among them per dispatch to spread each account's plan/quota, and fails over to the next
// when one hits its usage limit (cooling it down until its reset). Mechanism is uniform: applying
// an account just sets an env var before spawn —
//   apiKey accounts  -> env[envKey]          (OPENAI_API_KEY / OPENROUTER_API_KEY / ANTIGRAVITY_TOKEN)
//   login accounts   -> env[accountEnv]=dir  (CODEX_HOME / CLAUDE_CONFIG_DIR: a pre-logged-in dir)
//
// Secrets live in accounts.local.json (gitignored), merged by id onto the public config.
// State (rotation index + per-account usage/cooldown) persists to store/.accounts-state.json.
// Zero-dependency Node ESM.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, isAbsolute, resolve } from "node:path";

const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000; // 1h if a provider gives no reset time

export function expandHome(p) {
  if (!p) return p;
  const e = p.replace(/^~(?=[\\/]|$)/, homedir());
  return isAbsolute(e) ? e : resolve(e);
}

// ── registry: merge public provider.accounts[] with the gitignored secrets file ──────────────
export function loadAccounts(config, { secretsPath = null, secrets = null } = {}) {
  let sec = secrets;
  if (!sec && secretsPath && existsSync(secretsPath)) {
    try { sec = JSON.parse(readFileSync(secretsPath, "utf8")); } catch { sec = null; }
  }
  sec = sec || {};
  const out = {};
  for (const [name, prov] of Object.entries(config.providers || {})) {
    const listed = prov.accounts || [];
    if (!listed.length) continue;
    const secList = (sec[name]?.accounts) || [];
    const secById = Object.fromEntries(secList.map((a) => [a.id, a]));
    out[name] = {
      command: prov.command || name,
      rotation: prov.rotation || "round-robin",
      accountEnv: prov.accountEnv || null, // e.g. CODEX_HOME / CLAUDE_CONFIG_DIR
      apiKeyEnv: prov.apiKeyEnv || prov.auth?.envKey || null,
      accounts: listed.map((a) => ({ ...a, ...(secById[a.id] || {}) })),
    };
  }
  return out;
}

// ── apply one account to a child env (the only spawn-time effect) ────────────────────────────
export function applyAccount(account, provider, env = {}) {
  if (!account) return env;
  if (account.apiKey) {
    const key = account.envKey || provider?.apiKeyEnv;
    if (key) env[key] = account.apiKey;
  }
  if (account.configDir && provider?.accountEnv) {
    env[provider.accountEnv] = expandHome(account.configDir);
  }
  return env;
}

// ── pick the next usable account (skips cooling-down ones) ───────────────────────────────────
// state shape per provider: { rrIndex, accounts: { [id]: { uses, cost, tokens, cooldownUntil } } }
export function pickAccount(provider, pstate, { now = Date.now() } = {}) {
  const accounts = provider?.accounts || [];
  if (!accounts.length) return null;
  const st = pstate || {};
  const acc = st.accounts || {};
  const live = accounts.filter((a) => !((acc[a.id]?.cooldownUntil || 0) > now));
  if (!live.length) return null; // all cooling down -> caller escalates (downgrade/local/pause)

  const pol = provider.rotation || "round-robin";
  if (pol === "failover") return live[0];
  if (pol === "least-used") {
    return live.reduce((m, a) =>
      (acc[a.id]?.uses || 0) < (acc[m.id]?.uses || 0) ? a : m, live[0]);
  }
  // round-robin over the LIVE set
  const idx = ((st.rrIndex || 0)) % live.length;
  return live[idx];
}

export function advanceRR(pstate, liveCount) {
  pstate.rrIndex = ((pstate.rrIndex || 0) + 1) % Math.max(1, liveCount);
  return pstate;
}

// ── detect a usage-limit / rate-limit signal from a dispatch result ──────────────────────────
// result: { code, status, text } (text = combined stdout+stderr for CLIs). Returns {limited, resetMs?}.
const LIMIT_RE = /rate.?limit|usage limit|quota (?:exceeded|reached)|too many requests|429|insufficient_quota|try again (?:later|in)|limit reached/i;
export function parseLimit(providerName, result = {}) {
  if (result.status === 429) {
    const reset = Number(result.resetMs ?? result.retryAfterMs ?? 0) || undefined;
    return { limited: true, resetMs: reset };
  }
  const text = result.text || "";
  if (LIMIT_RE.test(text)) {
    // try to read a "try again in 37m" / "reset in 1200s"
    const m = text.match(/(?:try again in|reset[^0-9]*)\s*(\d+)\s*(s|sec|seconds|m|min|minutes|h|hours)/i);
    let resetMs;
    if (m) {
      const n = Number(m[1]); const u = m[2].toLowerCase();
      resetMs = n * (u.startsWith("h") ? 3600e3 : u.startsWith("m") ? 60e3 : 1000);
    }
    return { limited: true, resetMs };
  }
  return { limited: false };
}

// ── record the outcome of a dispatch onto the account state ──────────────────────────────────
export function noteResult(pstate, accId, { cost = 0, tokens = 0, limited = false, resetMs, now = Date.now() } = {}) {
  pstate.accounts = pstate.accounts || {};
  const a = (pstate.accounts[accId] = pstate.accounts[accId] || { uses: 0, cost: 0, tokens: 0, cooldownUntil: 0 });
  a.uses += 1; a.cost += cost; a.tokens += tokens; a.lastUsedAt = now;
  if (limited) { a.cooldownUntil = now + (resetMs || DEFAULT_COOLDOWN_MS); a.lastLimitAt = now; }
  return pstate;
}

// ── file-backed state convenience (load → mutate → save) ─────────────────────────────────────
export function loadState(statePath) {
  try { return JSON.parse(readFileSync(statePath, "utf8")); } catch { return {}; }
}
export function saveState(statePath, state) {
  const dir = dirname(statePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

// One-call selection helper for the dispatch layer:
//   const sel = selectAccount(name, registry[name], statePath)
//   applyAccount(sel.account, registry[name], childEnv)
//   ... run ...
//   sel.note({ cost, tokens, limited, resetMs })   // persists usage + cooldown + advances RR
export function selectAccount(providerName, provider, statePath, { now = Date.now() } = {}) {
  const state = loadState(statePath);
  const pstate = (state[providerName] = state[providerName] || { rrIndex: 0, accounts: {} });
  const account = pickAccount(provider, pstate, { now });
  return {
    account,
    note(outcome = {}) {
      if (account) noteResult(pstate, account.id, { ...outcome, now: outcome.now ?? Date.now() });
      const liveCount = (provider.accounts || []).filter(
        (a) => !((pstate.accounts[a.id]?.cooldownUntil || 0) > (outcome.now ?? Date.now()))).length;
      advanceRR(pstate, liveCount || 1);
      saveState(statePath, state);
    },
  };
}
