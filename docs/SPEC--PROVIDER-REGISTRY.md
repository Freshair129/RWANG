# SPEC--PROVIDER-REGISTRY — Role-based Multi-Platform Agent Dispatch

> **ADR:** [ADR-O-005](ADR-O-005--provider-registry.md)
> **Status:** Active
> **Date:** 2026-06-22
> **Impl:** `orchestration/providers.mjs`, `orchestration/config.json`

---

## 1. Overview

Provider Registry แยก orchestrator ออกเป็น 3 ชั้น:

```
┌─────────────────────────────────────────────────────────────┐
│  Routing Table                                              │
│  task.type → role name                                      │
│  (spike→architect, code→coder, scaffold→worker, ...)        │
├─────────────────────────────────────────────────────────────┤
│  Role Definitions                                           │
│  role → { requires: [caps], preferred: [provider:model] }   │
│  resolveForRole() walks preferred chain                     │
├─────────────────────────────────────────────────────────────┤
│  Provider Pool                                              │
│  provider → { capabilities, transport, executor, auth }     │
│  runProvider() dispatches to correct executor               │
└─────────────────────────────────────────────────────────────┘
```

## 2. Capability Tags

Tags เป็น contract ระหว่าง role requirements กับ provider declarations.
Provider **ต้องประกาศซื่อสัตย์** — ถ้าประกาศ `file_edit` แต่ executor ทำไม่ได้จริง
จะเกิด runtime failure.

| Tag | ความหมาย | ใคร declare |
| --- | --- | --- |
| `file_edit` | สร้าง/แก้ไฟล์บนดิสก์ของ project ได้ | claude, codex, antigravity |
| `shell_exec` | รัน shell command ใน project root ได้ | claude, codex |
| `code_review` | ตอบ structured verdict JSON (pass/fail + issues) | claude |
| `text_gen` | สร้างข้อความตาม prompt ได้ (ขั้นต่ำ) | ทุก provider |
| `streaming` | output ไหลทีละ chunk (tail log ได้ระหว่างรัน) | claude, ollama, openrouter |
| `vision` | รับ image/screenshot เป็น input ได้ | openrouter |
| `long_context` | context window ≥32k tokens | claude, openrouter |
| `sandbox` | รัน code ใน isolated sandbox | codex |

### กฎ:
- `text_gen` เป็น **implicit** — ทุก provider มี; ไม่ต้องประกาศใน requires (แต่ต้องประกาศใน capabilities)
- Role ที่ requires `[]` (ว่าง) = accept ทุก provider ที่ enabled
- Capability เป็น **static declaration** — ไม่เปลี่ยนตาม model/tier
  (opus/haiku มี capability เท่ากันเพราะใช้ CLI ตัวเดียว)

## 3. Provider Contract

### 3.1 Config schema (`config.json` → `providers.{name}`)

```jsonc
{
  "enabled": true,              // false = ข้าม provider นี้ทั้งหมด
  "capabilities": ["text_gen", "file_edit", ...],
  "transport": "subprocess" | "http",

  // subprocess providers:
  "command": "claude",          // executable name
  "baseArgs": ["-p", ...],     // args ก่อน --model
  "extraArgs": [...],           // args หลัง --model
  "auth": { ... },             // provider-specific

  // http providers:
  "host": "http://...",
  "auth": { "envKey": "...", "apiKey": "" },

  // ollama-specific:
  "think": false,
  "defaultProfile": "balanced",
  "profiles": { ... }
}
```

### 3.2 Executor contract (`runProvider()` return)

ทุก executor ต้อง return object ที่มี shape นี้:

```typescript
interface ExecutorResult {
  ok: boolean;           // task สำเร็จไหม
  blocked: boolean;      // agent ตอบ BLOCKED
  empty?: boolean;       // output ว่าง (ollama-specific)
  logFile: string;       // path to log file
  code: number;          // exit code (0=success, -1=spawn error)
  provider: string;      // provider name
  usage: {
    cost: number;        // USD (0 for local/free)
    inTok: number;       // input tokens
    outTok: number;      // output tokens
    cache: number;       // cached tokens
  };
}
```

### 3.3 Log file contract

ทุก executor ต้องเขียน log file ที่:
- **Header line:** `# {task_id} · {worker} · {provider}:{model} · started {ISO timestamp}`
- **Body:** streaming output (stdout/content) เขียนลงสด
- **Footer:** `# exit {code}` หรือ `# done · {inTok} in / {outTok} out tokens`
- **BLOCKED detection:** ถ้า output match `/^[\s>*-]*BLOCKED:/m` → เขียน escalation note

### 3.4 Prompt routing

Prompt building แบ่ง provider เป็น 2 กลุ่มตาม capability:

| กลุ่ม | Providers | Prompt style |
| --- | --- | --- |
| **Full-agent** | claude, codex, antigravity | ชี้ doc paths ให้ agent อ่านเอง; ไม่ inline |
| **Text-only** (`TEXT_ONLY_PROVIDERS`) | ollama, openrouter | Inline scaffold + small-model rules; ไม่ให้โหลดไฟล์เอง |

ดู `engine.mjs` → `buildPrompt()` สำหรับ implementation.

## 4. Role Definitions

### 4.1 Config schema (`config.json` → `roles.{name}`)

```jsonc
{
  "description": "human-readable purpose",
  "requires": ["cap1", "cap2"],     // required capabilities
  "preferred": [                     // fallback chain (first match wins)
    "claude:opus",
    "openrouter:anthropic/claude-sonnet-4",
    "ollama:gemma4"
  ]
}
```

### 4.2 Resolution algorithm (`resolveForRole`)

```
INPUT:  roleName, config
OUTPUT: { provider, model, roleName } | null

1. role = config.roles[roleName]
2. if !role or !role.preferred → return null
3. for each pref in role.preferred:
   a. parsed = parseModel(pref)
   b. provDef = config.providers[parsed.provider]
   c. if provDef is missing or enabled === false → continue
   d. required = role.requires (default [])
   e. caps = provDef.capabilities (default [])
   f. if every item in required is in caps → return { ...parsed, roleName }
   g. else → continue (capability mismatch)
4. return null (no provider available for this role)
```

### 4.3 Override precedence (highest → lowest)

```
1. state.tasks[id].modelOverride   — UI assign (runtime)
2. task.model (backlog)            — pin ใน backlog.json
3. resolveForRole(routing[type])   — role-based resolution
```

Override ที่ระดับ 1 และ 2 ข้าม capability check (ถือว่าผู้ใช้รู้ว่าทำอะไร).

## 5. Model String Format

### Canonical: `provider:model`

```
claude:opus                          → Claude CLI, model=opus
claude:sonnet                        → Claude CLI, model=sonnet
ollama:gemma4-rust-coder:latest      → Ollama HTTP, model=gemma4-rust-coder:latest
codex:o4-mini                        → Codex CLI, model=o4-mini
openrouter:anthropic/claude-sonnet-4 → OpenRouter API, model=anthropic/claude-sonnet-4
antigravity:default                  → Antigravity CLI, default model
```

### Legacy (backward compat)

Bare names (ไม่มี `:` prefix ที่ตรงกับ known provider) → `claude:{name}`:

```
opus    → claude:opus
sonnet  → claude:sonnet
haiku   → claude:haiku
```

### Parsing (`parseModel`)

```
INPUT:  model string
OUTPUT: { provider, model } | null

1. if null/empty → return null
2. find first ":" in string
3. if found and prefix is in KNOWN_PREFIXES → split at ":"
4. else → return { provider: "claude", model: input }
```

`KNOWN_PREFIXES = { claude, ollama, codex, openrouter, antigravity }`

## 6. Auth Model

### 6.1 Claude — dual mode (Plan quota / API key)

```jsonc
"auth": {
  "mode": "plan",      // "plan" = subscription quota, "apikey" = API billing
  "apiKey": ""          // ว่าง = ใช้ env ANTHROPIC_API_KEY
}
```

- `plan` mode: ลบ `ANTHROPIC_API_KEY` + `ANTHROPIC_AUTH_TOKEN` ออกจาก child env
- `apikey` mode: ตั้ง `ANTHROPIC_API_KEY` ให้ child process
- สลับได้สดผ่าน UI + `setAuthMode()` API

### 6.2 HTTP providers — API key

```jsonc
"auth": {
  "envKey": "OPENROUTER_API_KEY",  // env var name
  "apiKey": ""                      // override (config > env)
}
```

Resolution: `config.auth.apiKey || process.env[config.auth.envKey]`

### 6.3 Local providers (Ollama, Antigravity)

ไม่ต้อง auth — ใช้ local process/server ตรง.

## 7. Health Check

`checkHealth(providerName, config)` → `{ up: boolean, reason?: string, ...extra }`

| Provider | Method | Timeout | Extra data |
| --- | --- | --- | --- |
| claude | spawn `claude --version` | 5s | `version` |
| ollama | `GET {host}/api/tags` | 1.5s | `models[]` |
| codex | spawn `codex --version` | 5s | `version` |
| openrouter | `GET {host}/models` with auth | 5s | — |
| antigravity | spawn `antigravity --version` | 5s | `version` |

### API endpoint

```
GET /api/providers → { [name]: { enabled, up, capabilities, ...health } }
```

## 8. Usage Tracking

ทุก executor return `usage` object. Engine บันทึกลง `usage.jsonl`:

```jsonc
{ "t": <epoch_ms>, "id": "<task_id>", "model": "<provider:model>",
  "mode": "<provider_name>", "cost": <usd>, "in": <tokens>, "out": <tokens>, "cache": <tokens> }
```

- Claude: cost จาก `total_cost_usd` ใน stream-json result
- Ollama: cost = 0 เสมอ
- OpenRouter: cost = 0 (ยังไม่ parse billing จาก response headers; TODO)
- Codex/Antigravity: cost = 0 (ยังไม่มี billing integration)

## 9. Verify Gate Integration

ADR-O-001 Verify Gate เปลี่ยนจาก `reviewerByTier` map เป็น role-based:

```
เดิม:  reviewerTierFor(workerModel) → lookup CONFIG.review.reviewerByTier
ใหม่:  reviewerModelFor(_) → resolveForRole(CONFIG.review.reviewerRole)
```

`reviewerRole` default = `"reviewer"` → preferred chain `[claude:opus, claude:sonnet]`.

ข้อดี: reviewer resolution ใช้ fallback chain เหมือน worker — ถ้า opus ไม่ได้ ใช้ sonnet.
ข้อจำกัด: reviewer ต้องมี `code_review` capability → ปัจจุบันเฉพาะ claude
(codex/openrouter/ollama ยังไม่มี structured verdict JSON).

## 10. Error Handling

| Scenario | Behavior |
| --- | --- |
| Provider disabled | `resolveForRole` skips → ลอง provider ถัดไปใน chain |
| Provider enabled แต่ down | `runProvider` fails → task status = `failed` |
| No provider available for role | `modelFor` returns `null` → task skipped (manual) |
| Capability mismatch | `resolveForRole` skips provider → ลองตัวถัดไป |
| API key missing (HTTP provider) | Executor returns `{ ok: false }` + log note |
| Spawn error (subprocess) | Executor catches → `{ ok: false, code: -1 }` |
| BLOCKED output | Executor detects pattern → `{ ok: false, blocked: true }` |

## 11. Migration from v1 Config

| v1 field | v2 equivalent | Migration |
| --- | --- | --- |
| `models.architect: "opus"` | `roles.architect.preferred[0]: "claude:opus"` | ย้ายเป็น role definition |
| `models.local: "ollama:x"` | `roles.worker.preferred` / task pin | ย้ายเข้า role หรือ backlog |
| `executor.command: "claude"` | `providers.claude.command` | ย้ายเข้า provider section |
| `executor.baseArgs` | `providers.claude.baseArgs` | ย้ายเข้า provider section |
| `auth.mode` | `providers.claude.auth.mode` | ย้ายเข้า provider section |
| `ollama.enabled` | `providers.ollama.enabled` | ย้ายเข้า provider section |
| `ollama.host` | `providers.ollama.host` | ย้ายเข้า provider section |
| `review.reviewerByTier` | `review.reviewerRole: "reviewer"` | role-based แทน tier map |
| backlog `model: "local"` | `model: "ollama:gemma4-rust-coder:latest"` | explicit provider:model |

## 12. Config Reference

ดู [config.json](../config.json) สำหรับ live config.
ดู [GUIDE--ADDING-PROVIDER](GUIDE--ADDING-PROVIDER.md) สำหรับการเพิ่ม provider ใหม่.
