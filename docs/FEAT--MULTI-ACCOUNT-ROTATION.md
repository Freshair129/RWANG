# FEAT — Multi-account rotation (spread quota across plan/key accounts)

Register MULTIPLE accounts per provider; the engine rotates among them per dispatch to spread each
account's plan/quota, and fails over to the next when one hits its usage limit (cooling it down
until its reset). Zero new deps. Core: `accounts.mjs` (10/10 tests). Wired into `providers.mjs`
(`runProvider` selects an account, applies it to the child env, records usage + cooldown).

## How an account is applied (the only spawn-time effect)

Uniform mechanism — applying an account just sets an env var before the provider spawns:

| account kind | field | effect |
|---|---|---|
| **API key** | `{ id, envKey, apiKey }` | `env[envKey] = apiKey` (e.g. `OPENROUTER_API_KEY`, `ANTIGRAVITY_TOKEN`, `OPENAI_API_KEY`) |
| **login dir** | `{ id, configDir }` | `env[provider.accountEnv] = configDir` (a *pre-logged-in* CLI config dir, e.g. `CODEX_HOME`, `CLAUDE_CONFIG_DIR`) |

## Config

`config.json → providers.<name>`:

```jsonc
"codex": {
  "command": "codex",
  "accountEnv": "CODEX_HOME",          // login-dir env (subscription accounts)
  "rotation": "round-robin",           // round-robin | least-used | failover
  "accounts": [
    { "id": "codex-a", "configDir": "~/.codex-a" },
    { "id": "codex-b", "configDir": "~/.codex-b" }
  ]
},
"openrouter": { "apiKeyEnv": "OPENROUTER_API_KEY", "accounts": [ { "id": "or-1", "envKey": "OPENROUTER_API_KEY" } ] },
"antigravity": {
  "command": "agy", "apiKeyEnv": "ANTIGRAVITY_TOKEN", "rotation": "round-robin",
  "accounts": [ { "id": "ag-a", "envKey": "ANTIGRAVITY_TOKEN" }, { "id": "ag-b", "envKey": "ANTIGRAVITY_TOKEN" } ]
}
```

**Secrets stay out of git.** Keys live in `accounts.local.json` (gitignored), merged by `id` onto
`config.json` at load. See `accounts.example.json`. A provider with **no** `accounts[]` behaves
exactly as before (single-account, unchanged).

## Rotation & cooldown

- **round-robin** (default) — spread evenly across live accounts. **least-used** — pick the lowest-
  usage account this window. **failover** — use the first until it limits, then the next.
- On a **usage-limit / rate-limit signal**, the account is **cooled down** until its reset and
  skipped; rotation continues on the rest. The signal is parsed per provider by `parseLimit()`:
  HTTP **429** (+ `resetMs`), or CLI text (`rate limit` / `usage limit` / `quota exceeded` /
  `too many requests` / `try again in 30m` → parses the reset window).
- **All accounts cooling down** → `runProvider` returns `{ blocked, code:-2 }` so the caller can
  downgrade (e.g. to local Ollama) or wait — it never silently fails.
- State (rotation index + per-account `uses`/`cost`/`tokens`/`cooldownUntil`) persists to
  `store/.accounts-state.json` (gitignored).

## Per-provider setup (this box)

- **Codex (2 ChatGPT-plan accounts)** ✅ working path. One-time login per dir:
  `CODEX_HOME=~/.codex-a codex` (login), `CODEX_HOME=~/.codex-b codex` (login). Then the engine
  rotates `CODEX_HOME` per dispatch — quota is spread across both plans.
- **OpenRouter (1 key)** ✅ put the key in `accounts.local.json`; single account, no rotation needed.
- **Antigravity (`agy` CLI, 2 tokens)** 🟢 wired: command is `agy`, headless dispatch is
  `agy --headless --approve auto -p "<prompt>" --model <m>` (config `baseArgs` + `promptMode: "arg"`;
  set `promptMode: "stdin"` if your `agy` build reads the prompt on stdin), and `ANTIGRAVITY_TOKEN`
  rotates per account. Remaining one-time setup: **install the `agy` CLI** (the in-repo install is
  the GUI IDE only — get the CLI from `antigravity.google/docs/cli/install`), put the two tokens in
  `accounts.local.json`, and confirm the exact `--approve` policy value once `agy` is on PATH.

> ⚠️ Rotating multiple subscriptions to extend a combined usage limit may breach the provider's ToS
> (OpenAI / Google). These are your accounts; the mechanism is provided — the policy call is yours.

## Inspect (you can check + manage accounts)

- **CLI:** `node orchestrator.mjs accounts` — prints every provider's accounts with `● live` /
  `○ cooldown <m>m`, `uses`, `tokens`, and `cost`.
- **API:** `GET /api/accounts` (server.mjs) returns the same per-account status as JSON — the data
  hook for a Cockpit/Loadout tile (per-account usage bar + cooldown).
- **Add an account:** drop it in `config.json → providers.<name>.accounts[]` (id + `configDir` for a
  login dir, or id + `envKey` for a key), put any secret in `accounts.local.json`. No code change.

## Tests

`node --test accounts.test.mjs` — registry merge, env application (apiKey + login-dir + per-account
`envKey` override), round-robin spread, cooldown skip, failover, least-used, all-cooling→null,
limit parsing (429 + CLI text + reset window), usage accumulation, and an end-to-end
select→limit→failover→persist cycle. Regression (ownership / approval-chain / knowledge / autoloop)
stays green; `providers.mjs` imports cleanly.
