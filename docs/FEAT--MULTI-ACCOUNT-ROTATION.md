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

## Per-provider setup (this box — 9 seats: codex ×3, antigravity ×5, claude ×1)

- **Codex (3 ChatGPT-plan seats)** ✅ working path — login dirs. One-time login per dir:
  `CODEX_HOME=~/.codex-1 codex login` (then `-2`, `-3`), or click **login** in the Account Pool UI.
  Each dir keeps its own refresh token that auto-renews → **login once, lasts long** (no proxy/VM).
  The engine rotates `CODEX_HOME` per dispatch, spreading quota across all three plans.
- **Claude (1 seat)** ✅ login dir `CLAUDE_CONFIG_DIR=~/.claude` — already your logged-in CLI. In the
  pool for monitoring; `rotation: failover` (single seat, nothing to spread).
- **OpenRouter (1 key)** ✅ paste the key in the UI (or `accounts.local.json`); single account.
- **Antigravity (`agy` CLI, 5 seats)** 🟡 **keyring caveat — read this.** `agy`'s interactive login is
  stored in the **OS keyring** (Windows Credential Manager) = **ONE slot per OS user**. So the
  config-dir-swap trick that works for codex/claude does **not** give 5 concurrent agy seats. The only
  per-account path on a single box is **`ANTIGRAVITY_TOKEN`** (the CI/non-interactive token) — which is
  exactly what our `envKey` rotation applies. Paste one token per seat (UI or `accounts.local.json`).
  **OPEN RISK:** confirm you can actually obtain 5 tokens for subscription accounts — if a subscription
  seat can't mint a token, only one agy seat is usable at a time on one OS user (alternatives: separate
  OS users, or accept a single agy seat). Also: **install the `agy` CLI** (the in-repo install is the
  GUI IDE only — get the CLI from `antigravity.google/docs/cli/install`), and note the known
  **non-TTY stdout drop** on `agy -p` under CI/cron (final output can vanish while exit=0).
  Dispatch is `agy --headless --approve auto -p "<prompt>" --model <m>` (config `baseArgs` +
  `promptMode: "arg"`; set `promptMode: "stdin"` if your build reads the prompt on stdin).

> ⚠️ Rotating multiple subscriptions to extend a combined usage limit may breach the provider's ToS
> (OpenAI / Google). These are your accounts; the mechanism is provided — the policy call is yours.

## Account Pool UI — login + manage + monitor in one place (:4577 → 🔑 Account Pool)

A single tab in the dashboard for the whole pool. Read side polls `GET /api/accounts` every 4s;
write side is **localhost-only** (`isLocal(req)` guards every `POST /api/accounts/*`).

- **Monitor** — per-account card: `● live` / `⏳ cooldown Nm`, `uses`, tokens, `$cost`; per-provider
  header shows `configured/total` + cooling count.
- **Manage** — rotation dropdown (round-robin / least-used / failover) and enable/disable per provider
  (writes `config.json`, BOM-preserving, and syncs the running engine's in-memory config +
  drops the provider registry cache so it takes effect immediately); **clear cooldown** and
  **reset usage** per account (writes `store/.accounts-state.json`).
- **Login** — two kinds:
  - **key accounts** (openrouter, antigravity) → a paste-token field per card → `POST /api/accounts/key`
    writes `accounts.local.json` (merge by id). The token value is **never** returned by any GET.
  - **login-dir accounts** (codex, claude) → a **login / re-login** button → `POST /api/accounts/login`
    spawns the CLI OAuth (`CODEX_HOME=<dir> codex login` / `CLAUDE_CONFIG_DIR=<dir> claude /login`) with
    the right dir env; the browser flow completes outside, then the card flips to `● live` on next poll.

Endpoints (all POSTs localhost-only): `POST /api/accounts/key` `{provider,id,apiKey}` ·
`POST /api/accounts/login` `{provider,id}` · `POST /api/accounts/manage`
`{action: enable|disable|rotation|reset-cooldown|reset-usage, provider, id?, rotation?}`.
Logic lives in `accounts-admin.mjs` (6 unit tests, `accounts-admin.test.mjs`).

## Inspect (CLI)

- **CLI:** `node orchestrator.mjs accounts` — prints every provider's accounts with `● live` /
  `○ cooldown <m>m`, `uses`, `tokens`, and `cost`.
- **Add an account:** drop it in `config.json → providers.<name>.accounts[]` (id + `configDir` for a
  login dir, or id + `envKey` for a key), put any secret in `accounts.local.json` (or paste in the UI).
  No code change.

## Tests

`node --test accounts.test.mjs` — registry merge, env application (apiKey + login-dir + per-account
`envKey` override), round-robin spread, cooldown skip, failover, least-used, all-cooling→null,
limit parsing (429 + CLI text + reset window), usage accumulation, and an end-to-end
select→limit→failover→persist cycle. Regression (ownership / approval-chain / knowledge / autoloop)
stays green; `providers.mjs` imports cleanly.
