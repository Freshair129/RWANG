# ADR-O-005 — Role-based Provider Registry: multi-platform agent dispatch

> **Series:** ADR-O (orchestrator-scoped)
> **Status:** Approved (2026-06-22, USER/Boss)
> **Date:** 2026-06-22
> **Spec:** [SPEC--PROVIDER-REGISTRY.md](SPEC--PROVIDER-REGISTRY.md)
> **Related:** [ADR-O-001](ADR-O-001--verify-gate.md) (Verify Gate),
> [ADR-O-004](ADR-O-004--role-boundary-native.md) (Role Boundary)

---

## Context

G-Orch ก่อนหน้านี้ dispatch agent ผ่าน **hardcoded 2-branch if/else** ใน `parseModel()`:

```js
if (model.startsWith("ollama:")) → runOllama()
else                             → runClaude()
```

ทุกอย่างที่ไม่ใช่ `ollama:` prefix ถูกสมมติเป็น Claude. ปัญหาที่เกิดขึ้น:

1. **ไม่รองรับ provider ใหม่** — Codex, OpenRouter, Antigravity, หรือ LLM API อื่นเพิ่มไม่ได้
   โดยไม่แก้ engine core
2. **ผูก role กับ platform** — "architect = opus" เป็น hardcode;
   ถ้า Claude ล่ม architect role ตายไปด้วย ไม่มี fallback
3. **ขัด SRS resilience** — SRS §5.2 บังคับว่า G-Sentry/G-Signal ต้องทำงานต่อเมื่อ cloud
   ล่มโดย fallback ไป local SLM; architecture ต้องรองรับ graceful degradation
4. **ไม่มี capability matching** — ทุก task ไปถึง provider เดียวกัน
   ไม่ว่า task จะต้องการ file_edit หรือแค่ text_gen
5. **config กระจาย** — auth, executor, ollama settings อยู่คนละ section ไม่เป็นระบบ

คำถามสถาปัตยกรรม: ควรเป็น **system-based** (1 agent = 1 platform) หรือ
**role-based** (1 agent = 1 บทบาท, provider pluggable)?

## Decision

ใช้ **role-based provider registry** — แยก 3 ชั้นชัดเจน:

```
Task Type  →  Role  →  Provider (via fallback chain + capability matching)
```

### 1. Role layer (WHAT)

5 roles แต่ละตัวประกาศ **required capabilities** + **preferred provider chain** (ลำดับ fallback):

| Role | requires | preferred (fallback order) | ใช้กับ task types |
| --- | --- | --- | --- |
| **architect** | `long_context` | claude:opus → openrouter:claude-sonnet → ollama:gemma4 | spike, plan, architecture, design |
| **coder** | `file_edit` | claude:sonnet → codex:o4-mini → antigravity → ollama:gemma4 | code, impl, test, integration |
| **worker** | `text_gen` | claude:haiku → ollama:gemma4 → openrouter:gemma-3 | scaffold, config, docs |
| **reviewer** | `code_review` | claude:opus → claude:sonnet | Verify Gate (ADR-O-001) |
| **scout** | `text_gen` | ollama:gemma4 → claude:haiku → openrouter:gemma-3 | research, draft |

### 2. Provider layer (WHO)

แต่ละ provider ประกาศ **capabilities** + **transport** + **auth**:

| Provider | Transport | Capabilities | Cost |
| --- | --- | --- | --- |
| **claude** | subprocess (CLI) | file_edit, shell_exec, code_review, streaming, long_context | Plan quota / API key |
| **ollama** | HTTP (local) | text_gen | $0 (local) |
| **codex** | subprocess (CLI) | file_edit, shell_exec, sandbox | OPENAI_API_KEY |
| **openrouter** | HTTP (API) | text_gen, streaming, vision, long_context | OPENROUTER_API_KEY |
| **antigravity** | subprocess | text_gen, file_edit | local session |

### 3. Capability tags (contract)

```
file_edit      — แก้ไฟล์บนดิสก์ได้
shell_exec     — รัน shell command ได้
code_review    — structured review พร้อม verdict JSON
text_gen       — สร้างข้อความ (ขั้นต่ำที่ provider ต้องมี)
streaming      — streaming output
vision         — input รูปภาพ/screenshot
long_context   — context window >32k tokens
sandbox        — sandboxed execution
```

### Resolution algorithm

```
resolveForRole(roleName, config):
  role = config.roles[roleName]
  for each pref in role.preferred:
    parsed = parseModel(pref)              // "claude:opus" → {provider:"claude", model:"opus"}
    providerDef = config.providers[parsed.provider]
    if providerDef.enabled == false: skip
    if role.requires ⊄ providerDef.capabilities: skip
    return parsed                          // first match wins
  return null                              // no provider available
```

### Model string format

```
"provider:model" — canonical
  claude:opus, ollama:gemma4:latest, codex:o4-mini,
  openrouter:anthropic/claude-sonnet-4, antigravity:default

legacy bare names → claude:name (backward compat)
  "opus" → claude:opus, "sonnet" → claude:sonnet
```

## Alternatives considered

| ทางเลือก | ทำไมไม่เลือก |
| --- | --- |
| **A. System-based (1 agent = 1 platform)** | Claude ล่ม = architect ตาย; เพิ่ม provider = ต้องสร้าง agent ใหม่; ขัด SRS resilience; ไม่มี fallback chain |
| **B. คง 2-branch if/else + เพิ่ม provider ทีละตัว** | n providers = n branches in parseModel; ไม่มี capability matching; config กระจายไม่เป็นระบบ |
| **C. Full plugin system (dynamic loading)** | Over-engineer สำหรับ 5 providers; เพิ่ม complexity ที่ไม่จำเป็น; ยังไม่มี use case ที่ต้อง hot-plug provider |
| **D. ใช้ LangChain/LiteLLM เป็น abstraction** | ลาก dependency ใหญ่เข้ามา; ขัด zero-dep principle (ADR-O-003 P1); G-Orch ต้อง control prompt/auth/cost ละเอียดกว่าที่ wrapper library ให้ |

## Consequences

**ดี:**

- **Resilience** — role fallback chain ตรง SRS: coder ลอง claude:sonnet → codex → ollama อัตโนมัติ
  เมื่อ provider ล่ม
- **เพิ่ม provider ง่าย** — เขียน `runXxx()` + config section + ประกาศ capabilities; ไม่แก้ engine core
  (ดู [GUIDE--ADDING-PROVIDER](GUIDE--ADDING-PROVIDER.md))
- **Capability matching ป้องกัน mis-dispatch** — task ที่ต้อง `file_edit` ไม่ถูกส่งไป
  text-only provider (ollama/openrouter) โดยบังเอิญ
- **Config เป็นระบบ** — ทุก provider อยู่ใน `providers{}`, ทุก role อยู่ใน `roles{}`;
  Verify Gate ใช้ `reviewerRole` แทน hardcoded tier map
- **Cost optimization** — scout/worker roles เลือก ollama (ฟรี) ก่อน claude;
  ใช้ claude เฉพาะที่ต้องการ capability สูง
- **ไม่เพิ่ม dependency** — ยังเป็น Node.js built-in ล้วน (ADR-O-003 P1 ไม่กระทบ)

**แลกมา:**

- **Prompt divergence** — text-only providers (ollama, openrouter) ได้ prompt format ต่างจาก
  full-agent providers (claude, codex) → ต้องดูแล `buildPrompt()` 2 สาขา
  (`TEXT_ONLY_PROVIDERS` set)
- **Health check latency** — `providersInfo()` probe ทุก enabled provider;
  ถ้า provider ตอบช้า UI จะรู้สึกหน่วง → mitigate ด้วย timeout per-probe
- **Codex/OpenRouter/Antigravity executors เป็น initial impl** — ยังไม่ผ่าน production use;
  ต้อง battle-test แต่ละตัว (โดยเฉพาะ result parsing + cost tracking)
- **Migration** — backlog entries ที่ pin `model: "local"` ต้อง migrate เป็น
  `model: "ollama:gemma4-rust-coder:latest"` (ทำแล้ว 4 tasks)

## Implementation files

| File | Role |
| --- | --- |
| `orchestration/providers.mjs` | **NEW** — provider registry, parseModel, resolveForRole, runProvider dispatch, 5 executors, health checks |
| `orchestration/config.json` | **MOD** — `providers{}` + `roles{}` sections replace old `models`/`executor`/`auth`/`ollama` |
| `orchestration/engine.mjs` | **MOD** — imports providers.mjs; modelFor uses resolveForRole; runAgent delegates to runProvider; reviewerModelFor uses reviewerRole |
| `orchestration/auto-wave.mjs` | **MOD** — supervisor uses `providers.claude` config, not `CONFIG.executor` |
| `orchestration/server.mjs` | **MOD** — adds `GET /api/providers` endpoint |
| `.govibe/.agents/agent-registry.yaml` | **MOD** — v2.0 with real role definitions, capability tags, provider declarations |
| `orchestration/backlog.json` | **MOD** — `model: "local"` → `model: "ollama:gemma4-rust-coder:latest"` (4 tasks) |

## Compliance / links

- SRS §5.2 resilience → fallback chain ของ role resolution
- ADR-O-001 (Verify Gate) → reviewer ใช้ `reviewerRole` แทน `reviewerByTier` map
- ADR-O-003 P1 (zero-dep) → ไม่เพิ่ม external dependency
- ADR-O-004 (role boundary) → ถัง B "cross-vendor" moat ขยายจริงแล้ว
- CONCEPT--SUBAGENT-CONTEXT-SCOPING → `TEXT_ONLY_PROVIDERS` gets inline rules, full-agent gets doc paths

## Revisit when

- Provider ต้องใช้จริงมากกว่า 5 → พิจารณา dynamic plugin loading
- Claude Code native teams support multi-vendor → ประเมิน bridge vs replace
- ต้องการ runtime health-based auto-failover (ไม่ใช่แค่ config-time fallback) →
  เพิ่ม circuit breaker pattern ใน resolveForRole
