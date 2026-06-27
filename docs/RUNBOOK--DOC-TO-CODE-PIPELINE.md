# RUNBOOK — Doc-to-Code Pipeline

> **Status:** Active (2026-06-27)
> **Scope:** G-Orchestra orchestration layer — ไม่ใช่ runtime G-Maiden
> **อ้างอิง:** `engineering-spec.md` §7 (Orchestrator, Roles, Providers),
> `SPEC--VERIFY-GATE.md` (Verify Gate state machine),
> `orchestration/gks/backlog.gorch.json` (atom/backlog schema)

pipeline นี้คือ **closed loop** ที่เปลี่ยน intent เป็น code และส่ง trace กลับเข้า graph เสมอ:

```
Intent (Copilot/Spec)
       ↓  Step 1 — Spec Authoring
Author Atoms  (id, h_tier, type, accept, deps)
       ↓  Step 2 — Atom Authoring
Genesis Compile  (GKS-001/002/003 validation)
       ↓  Step 3 — Compile → backlog.gorch.json
Agent Claims  (role resolution → provider dispatch)
       ↓  Step 4 — Dispatch
Build  (scoped by H-tier / POLA docs)
       ↓  Step 5 — Implementation
Verify Gate  (independent reviewer, structured verdict)
       ↓  Step 6 — Review
Record Outcome + Trace → Graph
       Step 7 — Feedback
```

---

## Step 1 — Spec Authoring (Intent)

**Owner:** Human / Copilot / GoVibe spec editor

Intent เริ่มจาก:
- Product doc (PRD/SRS) — requirement ภาษาธรรมชาติ
- Copilot-assisted spec session
- GoVibe domain spec card

Output: requirement text พร้อมใช้เป็น input ของ Step 2.
ต้องระบุ **H-tier** ก่อนออกจาก step นี้ — H-tier ควบคุม blast radius ทั้งหมดใน pipeline.

---

## Step 2 — Author Atoms

**Owner:** Genesis Block atom model / GoVibe

Spec ถูกย่อยเป็น **atom** — unit พื้นฐานของ Genesis Block (spec = task = graph-node = DB-record):

```jsonc
{
  "id": "<kebab-case-slug>",          // ไม่ซ้ำ, ไม่เปลี่ยน (GKS-001)
  "title": "...",
  "type": "architecture|code|docs|scaffold|spike|...",
  "phase": "P0|P1|P2",
  "deps": ["<dep-id>"],               // ต้อง acyclic (GKS-002)
  "est": 2,                           // ชั่วโมงประมาณ
  "accept": "...",                    // acceptance criteria — agent ต้องทำได้
  "scope": {
    "budgetTokens": 8000,
    "needs": ["<doc-path>"],          // POLA: อ่านได้เฉพาะนี้
    "excludes": []
  },
  "moscow": "must|should|could|wont",
  "state": "todo|exists|extend|blocked"
}
```

### H-tier (context_scaling_tier H0–H6)

| Tier | ขอบเขต | ตัวอย่าง |
| --- | --- | --- |
| H0 | System-level NFR / ADR | latency 300ms, privacy-first |
| H1 | Domain / module boundary | G-Sentry, G-Signal, G-Orch |
| H2 | Feature spec | genesis-compile algorithm |
| H3 | Implementation task | ฟังก์ชัน compile() |
| H4 | Sub-task / code unit | parser function |
| H5 | Inline change / patch | typo fix |
| H6 | Micro-edit | config value |

H-tier ของ atom กำหนดว่า agent ใน Step 5 แตะไฟล์ไหนได้ — H3 ห้ามแก้ ADR (H0).

---

## Step 3 — Genesis Compile → Backlog

**Owner:** `algo--genesis-compile` / `orchestration/gks/compile.mjs`

compile algorithm อ่าน atoms แล้ว validate และ emit:

```
node gks/compile.mjs
  ├─ GKS-001: unique id — fail loudly on dup
  ├─ GKS-002: acyclic deps — fail loudly on cycle
  ├─ GKS-003: dep chain > 6 hops — warn (ไม่ fail)
  └─ emit → orchestration/gks/backlog.gorch.json
```

backlog entry สอดคล้องกับ atom schema ด้านบน.
tasks ที่ deps ยังไม่ `done` จะไม่ถูก dispatch ใน Step 4.

---

## Step 4 — Agent Claims

**Owner:** G-Orchestra engine (`orchestration/engine.mjs`)

engine ทำ poll loop:
1. หา tasks ที่ `state: "todo"` และ deps ครบ (`done`)
2. resolve role จาก `task.type` → provider (engineering-spec §7.1–7.3):

   ```
   task.model (เช่น "claude:sonnet")
     → Role (coder/worker/reviewer/architect/scout)
     → Provider fallback chain → first match wins
   ```

3. set `state: "running"` (claim — ป้องกัน double-pickup)
4. spawn agent พร้อม prompt ที่มี: title, accept, scope.needs, H-tier

---

## Step 5 — Build Scoped by H-tier

**Owner:** Provider ที่ resolve แล้ว (Claude / Codex / Ollama)

agent ได้รับ:
- atom spec พร้อม acceptance criteria
- POLA doc list (`scope.needs`) — อ่านได้เฉพาะที่ระบุ
- H-tier boundary — กำหนดว่าแก้ไฟล์ไหนได้

**กฎ H-tier enforcement:**
- H3 task → แก้ module ตัวเองได้ ห้ามแก้ H0 ADR
- H2 task → สร้าง module ใหม่ได้ ห้ามแก้ H1 boundary
- H0 task → ต้อง architect role เท่านั้น

output: code/docs/config ตาม acceptance criteria.

---

## Step 6 — Verify Gate

**Owner:** G-Orchestra `reviewer` role (claude:opus → claude:sonnet)

ตาม `SPEC--VERIFY-GATE.md` — state machine:

```
running ──produce──► reviewing ──review──► pass → done
                                      └──► fail → needs-rework ──re-dispatch──► (รอบ Step 5 ใหม่)
```

reviewer เป็น **agent อิสระ** (คนละ tier กับ worker):

| worker | reviewer |
| --- | --- |
| ollama / haiku | sonnet |
| sonnet | opus |
| opus | opus |

reviewer ตรวจ:
1. Acceptance criteria ครบทุกข้อ
2. ไม่ละเมิด NFR (latency/CPU/RAM/FPS จาก engineering-spec §8)
3. ไม่ scope bleed (แก้ไฟล์นอก H-tier boundary)

**reviewer ต้องคืน JSON เสมอ** (anti-error: reviewer output ไม่เป็น JSON = treated as fail):

```json
{
  "verdict": "pass | fail",
  "score": 0,
  "issues": [
    { "severity": "critical | major | minor", "area": "correctness|nfr|scope", "detail": "...", "fix": "..." }
  ],
  "summary": "หนึ่งบรรทัด"
}
```

มี `critical` issue → fail เสมอ แม้ reviewer บอก pass.

---

## Step 7 — Record Outcome + Trace to Graph

**Owner:** GenesisDB / GKS (via MCP) + G-Log (SQLite local)

เมื่อ Verify Gate pass:
- `state: "done"` ใน backlog
- outcome node เขียนเข้า GKS graph: `{ atom_id, commit_sha, verdict, ts_ms }`
- G-Log entry: `decisions` table — module, payload, outcome (privacy-first: local only, engineering-spec §6)
- parent atoms ถูก unblock (deps satisfied → downstream tasks เข้า queue)

เมื่อ fail หรือ blocked:
- `state: "failed"` หรือ `"needs-rework"` (rework loop ≤ maxReworkRounds)
- findings แนบใน log
- dependency chain คั่งอยู่จนกว่าจะแก้

---

## Worked Example — Atom `algo--genesis-compile`

ตาม end-to-end ของ atom นี้ซึ่งเสร็จแล้ว (`state: "exists"`):

### E1 — Intent

SRS §3.1: G-Sentry ต้องการ backlog compilation step เพื่อเปลี่ยน spec atoms เป็น engine tasks ที่ runnable.

### E2 — Atom Authored

```json
{
  "id": "algo--genesis-compile",
  "title": "Genesis Compile (decompose runtime) — read atoms -> validate GKS-001/002/003 -> assemble backlog + render canonical Markdown",
  "type": "code",
  "phase": "P0",
  "deps": ["entity--atom-schema"],
  "est": 2,
  "accept": "`node gks/compile.mjs` validates + emits backlog.gorch.json + atom .md; fails loudly on dup id / cycle / unresolved dep.",
  "scope": { "budgetTokens": 8000 },
  "moscow": "must",
  "state": "todo"
}
```

H-tier: **H2** (feature spec — สร้าง module ใหม่ใน `orchestration/gks/`)

### E3 — Genesis Compile

`node gks/compile.mjs` ผ่าน GKS-001 (id unique), GKS-002 (acyclic: `entity--atom-schema` → `algo--genesis-compile`), GKS-003 (2 hops, ไม่ warn).
Emit: `orchestration/gks/backlog.gorch.json` พร้อม task นี้และ downstream (`runbook--doc-to-code-pipeline`).

### E4 — Agent Claims

engine พบ `algo--genesis-compile` — deps: `entity--atom-schema` เป็น `state: "exists"` (ครบ).
`task.model` → role `coder` → provider `claude:sonnet` (engineering-spec §7.1).
State → `running`.

### E5 — Build (H2 scoped)

agent อ่าน scope docs (engineering-spec §7, TDD §2), เขียน `orchestration/gks/compile.mjs`.
ไม่แตะ ADR (H0), ไม่แตะ module boundary อื่น (H1).
Output: script ที่ทำ GKS-001/002/003 validation + emit backlog.

### E6 — Verify Gate

reviewer (claude:opus — tier เหนือ sonnet) ตรวจ:
- ✅ `node gks/compile.mjs` runs, emits valid JSON
- ✅ fails loudly on dup id (GKS-001)
- ✅ fails loudly on cycle (GKS-002)
- ✅ warns on >6 hops (GKS-003), ไม่ fail
- ✅ ไม่แก้ไฟล์นอก `orchestration/gks/`

```json
{ "verdict": "pass", "score": 95, "issues": [], "summary": "compile() validates all GKS rules and emits correct backlog" }
```

### E7 — Recorded to Graph

- `algo--genesis-compile` → `state: "done"`
- GKS node: `{ atom_id: "algo--genesis-compile", verdict: "pass" }`
- G-Log: `{ module: "compile", outcome: "pass" }` (local only)
- `runbook--doc-to-code-pipeline` (deps satisfied) เข้า queue → Step 4 ต่อไป

---

## Quick Reference — Owning Module per Step

| Step | ชื่อ | Module / File |
| --- | --- | --- |
| 1 | Spec Authoring | Human / GoVibe / Copilot |
| 2 | Author Atoms | Genesis Block atom schema |
| 3 | Compile to Backlog | `orchestration/gks/compile.mjs` |
| 4 | Agent Claims | `orchestration/engine.mjs` |
| 5 | Build (H-tier scoped) | Provider (claude/codex/ollama) |
| 6 | Verify Gate | `engine.mjs` + `reviewer` role |
| 7 | Record + Trace | GenesisDB/GKS (MCP) + `glog` (SQLite) |
