// accounts-admin.mjs — write-side of the Account Pool (login / manage), used by server.mjs.
//
// Read-side (monitor) lives in accounts.mjs (accountsStatus). This module holds the MUTATIONS the
// UI triggers — all localhost-only (the server guards the routes):
//   setAccountKey  — paste an API key/token for a key-based account -> accounts.local.json (gitignored)
//   resetCooldown  — clear a cooled-down account's cooldown so rotation uses it again
//   resetUsage     — zero an account's usage counters (uses/cost/tokens)
//   setProviderEnabled / setRotation — flip a provider on/off or change its rotation policy (config.json)
//   startLogin     — spawn the interactive CLI OAuth login for a login-dir account (codex/claude)
//
// Secrets are NEVER logged or returned. config.json is preserved byte-for-shape (BOM kept).
// Zero-dependency Node ESM.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { expandHome, DEFAULT_STATE_PATH, DEFAULT_SECRETS_PATH } from "./accounts.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONFIG_PATH = join(__dir, "config.json");

// ── tiny BOM-tolerant JSON read/write (config.json ships with a UTF-8 BOM) ────────────────────
function readJson(path, fallback = {}) {
  try { return JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, "")); }
  catch { return fallback; }
}
function writeJson(path, obj, { bom = false } = {}) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, (bom ? "﻿" : "") + JSON.stringify(obj, null, 2) + "\n");
}
function hasBom(path) {
  try { return readFileSync(path, "utf8").charCodeAt(0) === 0xfeff; } catch { return false; }
}

// ── validation helpers ───────────────────────────────────────────────────────────────────────
const ID_RE = /^[a-zA-Z0-9._-]{1,64}$/;
function assertId(id) { if (!ID_RE.test(String(id || ""))) throw new Error(`invalid account id: ${id}`); }
function findAccount(config, provider, id) {
  const prov = config.providers?.[provider];
  if (!prov) throw new Error(`unknown provider: ${provider}`);
  const acc = (prov.accounts || []).find((a) => a.id === id);
  if (!acc) throw new Error(`unknown account: ${provider}/${id}`);
  return { prov, acc };
}

// ── setAccountKey: store a pasted key/token in accounts.local.json (merge by id) ──────────────
export function setAccountKey(
  { provider, id, apiKey, envKey } = {},
  { secretsPath = DEFAULT_SECRETS_PATH, configPath = DEFAULT_CONFIG_PATH } = {},
) {
  assertId(id);
  if (!provider || !apiKey) throw new Error("provider and apiKey are required");
  // resolve the env var this key rides on: explicit > config account envKey > provider apiKeyEnv
  const config = readJson(configPath);
  const prov = config.providers?.[provider] || {};
  const cfgAcc = (prov.accounts || []).find((a) => a.id === id) || {};
  const key = envKey || cfgAcc.envKey || prov.apiKeyEnv || prov.auth?.envKey || null;

  const sec = readJson(secretsPath);
  sec[provider] = sec[provider] || { accounts: [] };
  sec[provider].accounts = sec[provider].accounts || [];
  const list = sec[provider].accounts;
  const existing = list.find((a) => a.id === id);
  const entry = { id, apiKey, ...(key ? { envKey: key } : {}) };
  if (existing) Object.assign(existing, entry); else list.push(entry);
  writeJson(secretsPath, sec); // no BOM for the local secrets file
  return { ok: true, provider, id, envKey: key, stored: true };
}

// ── mutate the per-account state file (cooldown / usage) ───────────────────────────────────────
function mutateState(statePath, provider, id, fn) {
  assertId(id);
  const state = readJson(statePath);
  const ps = (state[provider] = state[provider] || { rrIndex: 0, accounts: {} });
  ps.accounts = ps.accounts || {};
  const a = (ps.accounts[id] = ps.accounts[id] || { uses: 0, cost: 0, tokens: 0, cooldownUntil: 0 });
  fn(a);
  writeJson(statePath, state);
  return { ok: true, provider, id, account: a };
}
export function resetCooldown({ provider, id } = {}, { statePath = DEFAULT_STATE_PATH } = {}) {
  return mutateState(statePath, provider, id, (a) => { a.cooldownUntil = 0; a.lastLimitAt = 0; });
}
export function resetUsage({ provider, id } = {}, { statePath = DEFAULT_STATE_PATH } = {}) {
  return mutateState(statePath, provider, id, (a) => { a.uses = 0; a.cost = 0; a.tokens = 0; });
}

// ── flip a provider on/off or change rotation policy (config.json, BOM preserved) ─────────────
const ROTATIONS = new Set(["round-robin", "least-used", "failover"]);
export function setProviderEnabled({ provider, enabled } = {}, { configPath = DEFAULT_CONFIG_PATH } = {}) {
  const config = readJson(configPath);
  if (!config.providers?.[provider]) throw new Error(`unknown provider: ${provider}`);
  config.providers[provider].enabled = !!enabled;
  writeJson(configPath, config, { bom: hasBom(configPath) });
  return { ok: true, provider, enabled: !!enabled };
}
export function setRotation({ provider, rotation } = {}, { configPath = DEFAULT_CONFIG_PATH } = {}) {
  if (!ROTATIONS.has(rotation)) throw new Error(`invalid rotation: ${rotation}`);
  const config = readJson(configPath);
  if (!config.providers?.[provider]) throw new Error(`unknown provider: ${provider}`);
  config.providers[provider].rotation = rotation;
  writeJson(configPath, config, { bom: hasBom(configPath) });
  return { ok: true, provider, rotation };
}

// set the 5h/7d usage caps (uses count) that draw the per-account bar; null/absent clears one
export function setUsageLimit({ provider, limit5h, limit7d } = {}, { configPath = DEFAULT_CONFIG_PATH } = {}) {
  const config = readJson(configPath);
  if (!config.providers?.[provider]) throw new Error(`unknown provider: ${provider}`);
  const norm = (v) => (v === null || v === undefined || v === "" || !(Number(v) > 0) ? null : Number(v));
  const usage = { ...(config.providers[provider].usage || {}) };
  if (limit5h !== undefined) { const n = norm(limit5h); if (n === null) delete usage.limit5h; else usage.limit5h = n; }
  if (limit7d !== undefined) { const n = norm(limit7d); if (n === null) delete usage.limit7d; else usage.limit7d = n; }
  if (Object.keys(usage).length) config.providers[provider].usage = usage; else delete config.providers[provider].usage;
  writeJson(configPath, config, { bom: hasBom(configPath) });
  return { ok: true, provider, limit5h: usage.limit5h ?? null, limit7d: usage.limit7d ?? null };
}

// ── startLogin: spawn the interactive CLI OAuth login ──────────────────────────────────────────
// Two shapes:
//   login-dir (codex/claude): keep a refresh token per config dir (CODEX_HOME / CLAUDE_CONFIG_DIR).
//   keyring   (antigravity):  `agy auth login` → Google OAuth stored in the OS keyring (single global
//                             session, no dir). agy then works without a token.
// Returns a descriptor (never the token). openrouter/openai-image are key-only → use setAccountKey.
// NOTE: antigravity is NOT here — `agy` has no `auth login` subcommand (running it just drops into
// the interactive agent and hangs). agy authenticates via the Antigravity IDE (Google keyring), so
// `agy -p` already works with no token; the pool surfaces that instead of a broken login button.
const LOGIN_SPEC = {
  codex:  { cmd: "codex",  args: ["login"], envKey: "CODEX_HOME" },
  claude: { cmd: "claude", args: ["/login"], envKey: "CLAUDE_CONFIG_DIR" },
};
export const LOGIN_PROVIDERS = Object.keys(LOGIN_SPEC); // who shows a login button

export function startLogin({ provider, id } = {}, { config, spawnFn = spawn, root = __dir } = {}) {
  assertId(id);
  const spec = LOGIN_SPEC[provider];
  if (!spec) {
    return { ok: false, provider, id, interactive: false,
      hint: `${provider} is key-based — paste its token via setAccountKey (no browser login)` };
  }
  const { acc } = findAccount(config, provider, id);
  const env = { ...process.env };
  let cmdline = `${spec.cmd} ${spec.args.join(" ")}`;
  let inner = cmdline;
  if (!spec.keyring) {
    // login-dir: CODEX_HOME/CLAUDE_CONFIG_DIR must EXIST before login; normalize() fixes mixed slashes
    if (!acc.configDir) throw new Error(`${provider}/${id} has no configDir to log into`);
    const dir = normalize(expandHome(acc.configDir));
    try { mkdirSync(dir, { recursive: true }); } catch { /* best-effort */ }
    env[spec.envKey] = dir;
    cmdline = `${spec.envKey}=${acc.configDir} ${cmdline}`;
    inner = `set "${spec.envKey}=${dir}" && ${spec.cmd} ${spec.args.join(" ")}`;
  }
  let started = false, error = null;
  try {
    let child;
    if (process.platform === "win32") {
      // open a VISIBLE terminal so the OAuth CLI can print the device URL, open the browser, and
      // stay alive for the callback (a detached stdio:"ignore" spawn shows nothing / never opens it).
      child = spawnFn("cmd", ["/c", "start", `${provider} login`, "cmd", "/k", inner], {
        cwd: root, env, detached: true, stdio: "ignore",
      });
    } else {
      child = spawnFn(spec.cmd, spec.args, { cwd: root, env, shell: true, detached: true, stdio: "ignore" });
    }
    child.on?.("error", () => {});
    child.unref?.();
    started = true;
  } catch (e) { error = e.message; }
  return {
    ok: started, provider, id, interactive: true, keyring: !!spec.keyring, command: cmdline, error,
    hint: started
      ? `เปิดหน้าต่าง terminal ให้ login ${provider}/${id} แล้ว — ทำ OAuth ในนั้น (browser จะเด้ง). ถ้าไม่เด้ง รันเอง: ${cmdline}`
      : `เปิด login ไม่ได้ — รันในเทอร์มินัลเอง: ${cmdline}`,
  };
}
