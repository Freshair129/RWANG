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
import { fileURLToPath } from "node:url";
import { readLoginIdentity } from "./account-identity.mjs";

const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000; // 1h if a provider gives no reset time
const __acctdir = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_STATE_PATH = join(__acctdir, "store", ".accounts-state.json");
export const DEFAULT_SECRETS_PATH = join(__acctdir, "accounts.local.json");

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
export function pickAccount(provider, pstate, { now = Date.now(), rotationOverride = null } = {}) {
  const accounts = provider?.accounts || [];
  if (!accounts.length) return null;
  const st = pstate || {};
  const acc = st.accounts || {};
  const live = accounts.filter((a) => !((acc[a.id]?.cooldownUntil || 0) > now));
  if (!live.length) return null; // all cooling down -> caller escalates (downgrade/local/pause)

  // rotationOverride lets a workload pick its own policy (article's insight): cache-heavy roles run
  // "failover" (sticky → preserve prompt cache); quota-heavy/parallel roles run "round-robin".
  const pol = rotationOverride || provider.rotation || "round-robin";
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
const WINDOW_RETAIN_MS = 7 * 24 * 60 * 60 * 1000; // keep 7 days of events for the 5h/7d windows
export function noteResult(pstate, accId, { cost = 0, tokens = 0, limited = false, resetMs, now = Date.now() } = {}) {
  pstate.accounts = pstate.accounts || {};
  const a = (pstate.accounts[accId] = pstate.accounts[accId] || { uses: 0, cost: 0, tokens: 0, cooldownUntil: 0 });
  a.uses += 1; a.cost += cost; a.tokens += tokens; a.lastUsedAt = now;
  // rolling event log powering the 5h / 7d usage windows (pruned to 7d, capped)
  a.events = (a.events || []).filter((e) => e.at >= now - WINDOW_RETAIN_MS);
  a.events.push({ at: now, tokens, cost });
  if (a.events.length > 2000) a.events = a.events.slice(-2000);
  if (limited) { a.cooldownUntil = now + (resetMs || DEFAULT_COOLDOWN_MS); a.lastLimitAt = now; }
  return pstate;
}

// sum usage within a trailing time window
export function windowUsage(events, now, ms) {
  const from = now - ms;
  let uses = 0, tokens = 0, cost = 0;
  for (const e of events || []) if (e.at >= from) { uses++; tokens += e.tokens || 0; cost += e.cost || 0; }
  return { uses, tokens, cost };
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
export function selectAccount(providerName, provider, statePath, { now = Date.now(), rotationOverride = null } = {}) {
  const state = loadState(statePath);
  const pstate = (state[providerName] = state[providerName] || { rrIndex: 0, accounts: {} });
  const account = pickAccount(provider, pstate, { now, rotationOverride });
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

// ── read-only status view (CLI `accounts` + GET /api/accounts) ───────────────────────────────
export function accountsStatus(config, statePath = DEFAULT_STATE_PATH, { now = Date.now(), secretsPath = DEFAULT_SECRETS_PATH } = {}) {
  // Read secrets too so `configured` reflects a pasted key/token — but only its PRESENCE is
  // surfaced (the apiKey value itself is never returned).
  const reg = loadAccounts(config, { secretsPath });
  const state = loadState(statePath);
  const H5 = 5 * 60 * 60 * 1000, D7 = 7 * 24 * 60 * 60 * 1000;
  return Object.entries(reg).map(([provider, prov]) => {
    const ps = state[provider] || { accounts: {} };
    // optional per-provider usage caps (uses count) → UI draws a % bar. config.providers.<p>.usage
    const uconf = config.providers?.[provider]?.usage || {};
    return {
      provider, rotation: prov.rotation,
      enabled: config.providers?.[provider]?.enabled !== false,
      limit5h: uconf.limit5h ?? null, limit7d: uconf.limit7d ?? null,
      accounts: prov.accounts.map((a) => {
        const u = (ps.accounts || {})[a.id] || {};
        const cd = u.cooldownUntil || 0;
        // kind drives the UI: login-dir accounts need a browser OAuth (codex/claude);
        // key accounts need a pasted token (antigravity/openrouter). configured = secret/dir present.
        const kind = a.configDir ? "login" : "key";
        // authed = REALLY usable: login accounts read the CLI credential file (email/plan too);
        // key accounts are authed once a token is set. This replaces the misleading "live" (=cooldown).
        const ident = kind === "login" ? readLoginIdentity(provider, a.configDir) : { authed: !!a.apiKey };
        // antigravity authenticates via the Antigravity IDE (Google keyring) — `agy -p` works with no
        // token, so treat it as authed (identity is fetched live by agy; not readable from disk here).
        const keyringAuth = provider === "antigravity";
        return {
          id: a.id, kind, configured: !!(a.configDir || a.apiKey),
          // codex/claude have an interactive CLI login (dir) → login button. antigravity uses the IDE keyring.
          canLogin: ["codex", "claude"].includes(provider), keyringAuth,
          authed: keyringAuth ? true : (!!ident.authed), email: ident.email || null, plan: ident.plan || (keyringAuth ? "Antigravity IDE (keyring)" : null), tier: ident.tier || null,
          live: !(cd > now), cooldownUntil: cd, cooldownMs: Math.max(0, cd - now),
          uses: u.uses || 0, cost: u.cost || 0, tokens: u.tokens || 0,
          w5h: windowUsage(u.events, now, H5), w7d: windowUsage(u.events, now, D7),
        };
      }),
    };
  });
}
