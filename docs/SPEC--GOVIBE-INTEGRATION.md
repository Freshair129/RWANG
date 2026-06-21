# SPEC — GoVibe ⇄ G-Orchestration Integration

> **Status:** Approved (2026-06-21, USER/Boss · RUNBOOK Gate 2) — กำกับการสร้าง
> **Direction:** **G-Orchestration เป็นแกน (execution core)** — "ดูด" ความสามารถที่ขาดของ GoVibe เข้ามา
> ไม่ใช่ merge สมมาตร และไม่ย้ายแกนไปอยู่ GoVibe
> **Scope:** `orchestration/` (engine.mjs ฯลฯ). อ้างอิงระบบ GoVibe ที่ `G:\govibe`
> **Governed by:** [ADR-O-002](ADR-O-002--govibe-integration.md)
> **อ้างอิง:** [SPEC--VERIFY-GATE.md](SPEC--VERIFY-GATE.md), [ADR-O-001](ADR-O-001--verify-gate.md),
> `docs/CONCEPT--SUBAGENT-CONTEXT-SCOPING.md`, GoVibe `scripts/mcp/registry.mjs`,
> GoVibe `covibe-roadmap-export.json`, GoVibe `.brain/masterblock/*`

---

## 1. หลักการตัดสินใจ (ทำไม G-Orch เป็นแกน)

ทั้งสองระบบอยู่ **คนละชั้นของ stack** ไม่ใช่คู่แข่งกัน:

| ระบบ | บทบาทจริง | จุดแข็งที่ทดแทนไม่ได้ |
| --- | --- | --- |
| **G-Orchestration** (`orchestration/`) | **execution engine** — รันงานหลาย agent จริง | worker-pool + atomic claim/lease, DAG gating, wave parallelization, model routing, **Verify Gate** (reviewer อิสระ + needs-rework), cost ledger, zero-dep |
| **GoVibe** (`G:\govibe`) | **control plane** — วางแผน/กำกับ/จดจำ | roadmap model + temporal versioning, `.brain` memory, governance gates, RICE/MoSCoW, requirement traceability, MCP server, Mission Control |

**เหตุผลที่เลือก G-Orch เป็นแกน:**
1. ของที่ "ทำงานจริงตอน runtime" (รัน agent, ตรวจคุณภาพ, กัน race) อยู่ที่ G-Orch แล้ว และ **ทดแทนยากกว่า** — GoVibe เรียก agent ผ่าน PowerShell แยกตัว (`run-ather.ps1`, `run-lyra.ps1`) ไม่มี pool/claim/lease/verify
2. G-Orch เป็น **zero external dependency** (Node built-in ล้วน) — ดูด feature เข้ามาได้โดยไม่ลาก React/Vite/ws ของ GoVibe เข้ามา
3. GoVibe ออกแบบให้เชื่อมผ่าน **MCP** อยู่แล้ว (`govibe-mcp-server.mjs`) → integration surface มาตรฐานมีให้ใช้ ไม่ต้อง fork

**หลักการกำกับการดูด (3 ข้อ — ห้ามละเมิด):**
- **P1 — ไม่ทำลายของเดิม:** zero-dep, file-based state, Verify Gate, POLA scoping ต้องคงเดิม. field ใหม่ทุกตัว **optional** (backlog/state เดิมรันต่อได้ไม่แตะ)
- **P2 — ดูดเฉพาะที่ขาด:** absorb เป็น "ไอเดีย+ข้อมูล" มาเขียนใหม่ด้วย Node built-in — **ไม่ import โค้ด GoVibe ตรง ๆ** (กันลาก dependency)
- **P3 — เชื่อม ไม่กลืน:** GoVibe ยังรันเป็นระบบของตัวเองได้ (Mission Control, MCP). G-Orch เชื่อมผ่าน adapter/contract ที่ระบุชัด ไม่ผูกตาย

---

## 2. Capability map — อะไรคงไว้ / อะไรดูดเข้ามา / อะไรเชื่อม

| Capability | เจ้าของเดิม | แผน | โมดูลปลายทางใน G-Orch |
| --- | --- | --- | --- |
| Worker pool, claim/lease, DAG, wave | G-Orch | **KEEP** (แกน) | `engine.mjs` (เดิม) |
| Model routing (type→tier) | G-Orch | **KEEP** | `engine.mjs` `roleFor/modelFor` |
| Verify Gate (reviewer + rework) | G-Orch | **KEEP** + ป้อน outcome เข้า brain | `engine.mjs` `executeWithReview` |
| Cost/usage ledger | G-Orch | **KEEP** + sync เข้า roadmap `tokensUsed` | `usage.jsonl` |
| POLA per-task scope | G-Orch | **KEEP** + เปิดเป็น MCP `docs.resolve` | `scopeFor` |
| **Roadmap model + temporal versioning** | GoVibe | **ABSORB** | §4.1 `roadmap/` layer |
| **`.brain` memory (masterblock/session/rca)** | GoVibe | **ABSORB** | §4.2 `brain/` layer |
| **Governance gates (validate/diff/baseline)** | GoVibe | **ABSORB** | §4.3 pre/post hooks |
| **RICE / MoSCoW prioritization** | GoVibe | **ABSORB** | §4.4 ranking |
| **Agent-role fleet (AGENT.md + policy)** | GoVibe | **ABSORB** (map เข้า routing) | §4.5 role registry |
| **Requirement traceability** | GoVibe | **ABSORB** (เป็น field ใน task) | §3 schema |
| **MCP server interface** | GoVibe | **BRIDGE** (ห่อ engine เป็น MCP) | §5 MCP surface |
| Mission Control dashboard (React) | GoVibe | **BRIDGE** (อ่าน snapshot ผ่าน MCP) | คงไว้ฝั่ง GoVibe |

---

## 3. Data model unification — ขยาย backlog task schema

ปัญหา: task schema ของเรา (`id,title,type,phase,deps,est,accept,model,scope,requireReview`)
**แบนกว่า** ของ GoVibe มาก. GoVibe roadmap task มี field ที่เรายังไม่มีและมีค่า:

### 3.1 เทียบ field (GoVibe roadmap task → G-Orch task)

| GoVibe field | ตัวอย่างจริง | สถานะใน G-Orch | แผน |
| --- | --- | --- | --- |
| `id` | `p0-s0-1` | ✅ มี (`G0.1`) | คงของเรา; เก็บ id GoVibe ที่ `sourceId` |
| `code` | `TSK-CVB01P00010` | ❌ | **เพิ่ม** `code` (traceability key) |
| `text` | "Prototype YouTube IFrame…" | ✅ (`title`) | map `title`↔`text` |
| `symbolLink` | `src/App.tsx` | ❌ | **เพิ่ม** `symbolLink` (task→ไฟล์เป้าหมาย) |
| `complexity` | `high` / `nomal` | ⚠️ (มีแค่ `est`) | **เพิ่ม** `complexity`; เก็บ `est` ไว้ |
| `type` | `FR` / `NFR` | ⚠️ (type เราใช้ routing) | **เพิ่ม** `frnfr`; `type` เดิมยังคุม routing |
| `status` | `stable` | ✅ (runtime status) | คนละความหมาย — เก็บ governance status ที่ `lifecycle` |
| `version` | `1.0.0` | ❌ | **เพิ่ม** `version` (semver ต่อ task) |
| `created_at`/`last_update` | `ts,actor,commit` | ⚠️ (มี `claimedAt`) | **เพิ่ม** `audit{created,updated}` (ts+actor+commit) |
| `changelog` | "Added iframe sandbox…" | ❌ | **เพิ่ม** `changelog[]` (append per mutation) |
| `tokensUsed` | `12040` | ⚠️ (มีใน usage.jsonl) | **sync** จาก ledger → `tokensUsed` บน task |

### 3.2 field ที่เพิ่ม (ทั้งหมด **optional** — backward compatible)

เพิ่มใน `backlog.json` task object (และ mirror ใน `state.json` runtime):

```jsonc
{
  // --- เดิม (ไม่แตะ) ---
  "id": "G0.1", "title": "...", "type": "scaffold", "phase": "0",
  "deps": ["S-1"], "est": 1, "accept": "...", "model": "...", "scope": {...},

  // --- absorb จาก GoVibe (optional ทั้งหมด) ---
  "code": "TSK-GVM00P00010",        // traceability key (สเกลตามโปรเจกต์)
  "symbolLink": "src-tauri/src/main.rs", // ไฟล์/symbol เป้าหมายหลักของ task
  "complexity": "high",              // low|nomal|high  (signal ของ routing + RICE effort)
  "frnfr": "FR",                     // FR|NFR  (กำกับ traceability ไป SRS)
  "version": "1.0.0",                // semver ต่อ task; bump เมื่อ done/rework
  "lifecycle": "draft",              // draft|approved|stable|deprecated (governance status)
  "rice": { "reach": 3, "impact": 2, "confidence": 0.8, "effort": 1 }, // §4.4
  "moscow": "must",                  // must|should|could|wont
  "trace": {                         // §8 requirement traceability
    "prd": ["PRD §G-Signal"],
    "srs": ["R-02", "latency budget §1"],
    "test": ["G3.6"]
  },
  "audit": {                         // bitemporal-lite
    "created": { "at": "2026-06-21T09:00:00+07:00", "by": "EVA", "commit": "a3f2b1c" },
    "updated": { "at": "2026-06-21T16:22:00+07:00", "by": "orch", "commit": "d4e5f6g" }
  },
  "changelog": [                     // append-only; เขียนโดย engine ตอนเปลี่ยน lifecycle/version
    { "v": "1.0.0", "at": "...", "by": "sonnet", "note": "first pass passed Verify Gate" }
  ],
  "tokensUsed": 12040                // sync จาก usage.jsonl (สะสมต่อ task)
}
```

> **กติกา backward-compat:** engine อ่าน task ที่ไม่มี field ใหม่ได้ตามเดิม. field ใหม่มีผลเฉพาะเมื่อโมดูล §4 เปิดใช้.
> ไม่มี field ใหม่ตัวใดที่ "บังคับ" สำหรับ dispatch/verify ของเดิม.

### 3.3 Temporal versioning (bitemporal-lite)

GoVibe ใช้ bitemporal (`asOfValidAt` / `asOfRecordedAt`). เราดูดมาแบบเบา:
- **เก็บประวัติที่ append-only log** `orchestration/roadmap/history.jsonl` (1 บรรทัด = 1 mutation: `{taskId, field, old, new, validAt, recordedAt, by, commit}`)
- snapshot "as-of" คำนวณโดย replay log จนถึง `recordedAt` ที่ขอ — ไม่เก็บ full copy ทุก version (กัน state โต)
- รองรับคำถามแบบ GoVibe: *"roadmap เป็นยังไง ณ commit X / วันที่ Y"*

---

## 4. โมดูลใหม่ใน G-Orch (ดูดจาก GoVibe)

ทุกโมดูลเป็น **ไฟล์ .mjs แยก** + เรียกจาก `engine.mjs` ผ่าน hook — ไม่บวมแกนเดิม, เปิด/ปิดได้ที่ `config.json`.

### 4.1 Roadmap layer → generate backlog
**ไฟล์:** `orchestration/roadmap/roadmap.json` (source of truth ระดับแผน), `roadmap/importer.mjs`, `roadmap/exporter.mjs`

- **importer:** อ่าน GoVibe export (`covibe-roadmap-export.json` shape: `phases.{pN}.tasks[]`) → แปลงเป็น `backlog.json` (map field ตาม §3.1) + ตั้ง `code/symbolLink/frnfr/trace`
- **exporter:** อ่าน `state.json` (สถานะรัน + verdict + tokensUsed) → เขียนกลับเป็น roadmap snapshot (Markdown + JSON) แบบ `govibe.roadmap.export`
- **closed loop:** roadmap → backlog → (dispatch/verify) → state → exporter → roadmap (อัปเดต `status/version/changelog/tokensUsed`)

config:
```jsonc
"roadmap": { "enabled": true, "source": "roadmap/roadmap.json", "codePrefix": "TSK-GVM" }
```

### 4.2 Brain / memory layer
**ไฟล์:** `orchestration/brain/` — โครงตาม GoVibe `.brain`:
- `masterblock/` — กรอบคิดถาวร (RICE, MoSCoW, scope-creep, small-model-prompting) — **copy ข้อความ ไม่ลิงก์โค้ด**
- `session/<date>-<topic>.md` — สรุป session (เขียน**อัตโนมัติ**ตอนจบ pool: task ที่ done/rework, cost, lesson)
- `rca/<taskId>-<n>.md` — เขียน**อัตโนมัติ**เมื่อ Verify Gate ตี `needs-rework`/`failed`: เก็บ verdict issues + reject reason เป็น RCA
- `inbound/` — คิวความรู้รอประมวล

**feedback hook:** ใน `executeWithReview()` (Verify Gate) เมื่อ verdict = fail → `brain/writeRca(task, verdict)`; เมื่อจบ `runPool()` → `brain/writeSession(summary)`.
นี่คือ G-Log ของ orchestrator เอง (แยกจาก G-Log ของตัวเกม — privacy-first ยังคง local).

### 4.3 Governance gates (pre-dispatch / post-done hooks)
ดูดจาก GoVibe `scripts/docs/*` (`validate-docs`, `diff-check`, `validate-roadmap-containers`, `baseline:check`) — เขียนใหม่เป็น Node built-in:
**ไฟล์:** `orchestration/gates/` — `docsValidate.mjs`, `diffCheck.mjs`, `roadmapValidate.mjs`

- **pre-dispatch gate:** ก่อน `dispatchOne` — เช็ค task มี `accept`/`trace` ครบ (doc-first), `symbolLink` ชี้ไฟล์จริง
- **post-done gate:** หลัง Verify Gate pass — เช็ค diff อยู่ในขอบเขต `symbolLink`/`scope` (surgical-diff, กัน scope creep), roadmap container ถูกต้อง
- gate fail → task ไม่เป็น `done` แต่เป็น `needs-rework` (ต่อยอด state machine เดิมของ Verify Gate)

config:
```jsonc
"gates": { "preDispatch": ["docsValidate"], "postDone": ["diffCheck", "roadmapValidate"], "blockOn": "error" }
```

### 4.4 Prioritization (RICE / MoSCoW)
**ไฟล์:** `orchestration/rank.mjs`
- คำนวณ `riceScore = reach*impact*confidence/effort` ต่อ task (จาก field §3.2)
- ปรับ `readyTasks()` ให้ **เรียงตาม** `moscow` (must→should→could) แล้ว `riceScore` — ก่อนแจกเข้า pool
- ของเดิม (deps gating, wave) ยังเป็นตัวกรอง "ทำได้ไหม"; RICE/MoSCoW เป็นตัวกำหนด "ทำอันไหนก่อน" ภายใน wave เดียวกัน

### 4.5 Agent-role fleet
ดูดแนวคิด `.agents/*/AGENT.md` ของ GoVibe (JANUS/ATHER/LYRA/THESEUS) เข้ามาเป็น **role registry บาง ๆ**:
**ไฟล์:** `orchestration/roles.json` — map `roleName → { tier, systemPreamble, policyDocs[] }`
- routing ปัจจุบัน (type→architect/coder/worker) ยังอยู่ แต่ role เพิ่ม **persona/policy preamble** เข้า prompt (เช่น auditor ใช้ `RCA-Standard`, devops ใช้ release-gate checklist)
- ไม่สร้าง agent process ใหม่ — แค่ปรับ `buildPrompt()` ให้แทรก role preamble + policy ที่ scope ให้

### 4.6 MCP server surface (BRIDGE)
**ไฟล์:** `orchestration/mcp/server.mjs` — JSON-RPC over stdio (โครงเดียวกับ GoVibe `govibe-mcp-server.mjs`, แต่ห่อ `engine.mjs`)
ทำให้ Mission Control / Claude / ระบบอื่นเรียก orchestrator ผ่าน MCP มาตรฐานได้ (ดู §5)

---

## 5. Interface contract — MCP tools ที่ G-Orch จะ expose

จับคู่ tool ของ GoVibe เข้ากับ engine function เพื่อให้ **Mission Control เรียก G-Orch แทน PowerShell scripts ได้**:

| MCP tool (เทียบ GoVibe) | engine.mjs ปลายทาง | หมายเหตุ |
| --- | --- | --- |
| `orch.roadmap.load` (≈`govibe.roadmap.load`) | `roadmap/importer` + `snapshot()` | คืน roadmap+สถานะรัน; รองรับ `asOf` |
| `orch.roadmap.update` (≈`govibe.roadmap.update`) | `setStatus/assign` + `history.jsonl` | mutation: node.update/assignment/handoff/verification |
| `orch.roadmap.export` (≈`govibe.roadmap.export`) | `roadmap/exporter` | เขียน snapshot → docs/roadmap |
| `orch.agent.run` (≈`govibe.agent.run`) | `dispatchOne()` / `runAgent()` | รัน 1 task จริง (มี Verify Gate); mode: doc/plan/audit/atomic |
| `orch.wave.run` *(ใหม่)* | `runPool({mode,max})` | รัน wave/auto — ของที่ GoVibe ไม่มี |
| `orch.docs.resolve` (≈`govibe.docs.resolve`) | `scopeFor()` | คืน scoped docs (POLA, orchestrator-only ถูกกรอง) |
| `orch.snapshot` *(ใหม่)* | `snapshot()` | progress/counts/waves/usage live |
| `orch.workspace.validate` (≈`govibe.workspace.validate`) | `gates/*` | รัน governance gates |

> Mission Control ของ GoVibe (React + ws) ชี้มาที่ MCP นี้ได้เลย → ได้ roadmap viz ของ GoVibe + execution จริงของ G-Orch โดยไม่ต้องเขียน UI ใหม่

---

## 6. Flow รวม — closed loop

```
        GoVibe Mission Control (roadmap viz, React)
                    │  เรียกผ่าน MCP (§5)
                    ▼
 ┌──────────────────────────────────────────────────────────┐
 │  G-Orchestration (แกน)                                     │
 │                                                            │
 │  roadmap.json ──importer(§4.1)──► backlog.json             │
 │       ▲                              │                     │
 │       │                     rank(§4.4) RICE/MoSCoW         │
 │       │                              │                     │
 │       │                     readyTasks → claim/wave        │
 │       │                              │                     │
 │  exporter(§4.1)            pre-gate(§4.3) ──► dispatch      │
 │       ▲                              │       (runAgent)    │
 │       │                              ▼                     │
 │       │                     Verify Gate (เดิม) ──pass──┐    │
 │       │                              │ fail            │    │
 │       │                     post-gate(§4.3)            │    │
 │       │                              │                 ▼    │
 │  state.json ◄────── done/version/changelog/tokensUsed ─┘    │
 │       │                              │ fail                 │
 │       └──► brain(§4.2): session log  └──► brain: RCA        │
 └──────────────────────────────────────────────────────────┘
```

หนึ่งรอบ: **roadmap (วางแผน+กำกับ) → backlog (จัดลำดับ) → dispatch (รัน) → verify (ตรวจ) → state/roadmap (บันทึก) → brain (เรียนรู้)**

---

## 7. แผน migrate เป็นเฟส (M0–M5)

แต่ละเฟส **ส่งมอบได้เอง** และ **ไม่ทำของเดิมพัง** (Verify Gate + pool เดิมต้องรันผ่านทุกเฟส).

| เฟส | ขอบเขต | Acceptance | ความเสี่ยงต่อของเดิม |
| --- | --- | --- | --- |
| **M0 — Schema extend** | เพิ่ม field §3.2 (optional) ใน schema + engine อ่านผ่าน | backlog เดิมรัน pool+verify ผ่านไม่แตะ; task ที่มี field ใหม่ก็รันได้ | ต่ำ (optional ล้วน) |
| **M1 — Roadmap importer/exporter (§4.1)** | GoVibe export → backlog; state → roadmap snapshot | import `covibe-roadmap-export.json` ได้ backlog ที่ dispatch ได้จริง; export กลับครบ field | ต่ำ (โมดูลแยก) |
| **M2 — Brain feedback (§4.2)** | hook session log + RCA จาก Verify Gate | จบ pool มี session md; needs-rework สร้าง RCA อัตโนมัติ | ต่ำ (write-only hook) |
| **M3 — Governance gates (§4.3)** | pre/post gate ต่อ state machine | task ขาด trace ถูก block ก่อน dispatch; diff นอก scope → needs-rework | กลาง (แทรก state) — มี `blockOn` ปิดได้ |
| **M4 — RICE/MoSCoW ranking (§4.4)** | `readyTasks` เรียงตาม priority | task `must` ออกก่อน `could` ภายใน wave; ไม่ละเมิด deps | ต่ำ (จัดลำดับเท่านั้น) |
| **M5 — MCP server (§4.6, §5)** | ห่อ engine เป็น MCP; Mission Control เชื่อม | Mission Control เรียก `orch.wave.run`/`orch.snapshot` ได้ | ต่ำ (surface ใหม่, ไม่แตะ core) |

> ลำดับนี้เอา "ของที่ความเสี่ยงต่ำ + ปลดล็อกถัดไป" ก่อน. M0 เป็นฐานของทุกเฟส. M5 ทำเมื่ออยากให้ Mission Control คุมจริง.

---

## 8. Requirement Traceability (ดูดจาก GoVibe governance)

ห่วงโซ่ที่ต้องตามรอยได้ตั้งแต่ต้นน้ำถึงปลายน้ำ:

```
PRD/SRS  ──►  roadmap task (frnfr, code)  ──►  backlog task (trace.prd/srs)
   ▲                                                      │
   │                                              dispatch + Verify Gate
   │                                                      │
test (trace.test) ◄── verdict/changelog ◄── state ◄───────┘
```

- `task.trace.srs` ผูกกับเลข requirement จริง (เช่น `R-02`, "latency budget §1" ที่มีใน backlog แล้ว)
- `task.frnfr` แยก FR/NFR เพื่อให้ NFR (เช่น latency/CPU gate) ตามรอยไป SRS §non-functional
- Verify Gate verdict + `changelog` = หลักฐานว่า acceptance ถูกตรวจ (ปิดช่อง "done ≠ ผ่าน" ที่ ADR-O-001 แก้)

---

## 9. ความเสี่ยง & การกัน

| ความเสี่ยง | ผล | การกัน |
| --- | --- | --- |
| ลาก dependency ของ GoVibe (React/Vite/ws) เข้าแกน | ทำลาย zero-dep | **P2:** เขียนใหม่ด้วย Node built-in; ห้าม import โค้ด GoVibe |
| field schema บวม ทำ state.json หนัก | I/O ช้า | bitemporal เก็บที่ `history.jsonl` (append) ไม่ copy ทุก version |
| governance gate เข้มไป → task ค้าง | progress หยุด | `gates.blockOn` ปรับ `error|warn|off`; ค่าเริ่ม warn |
| roadmap ของ GoVibe (CoVibe demo) คนละโปรเจกต์กับ G-Maiden | mapping เพี้ยน | importer เป็น adapter ต่อ schema; map ผ่าน config `codePrefix`/field-map |
| MCP surface เปิดช่องสั่งงานโดยไม่ตั้งใจ | dispatch หลุด | MCP `actor` required (เหมือน GoVibe); reuse auth-mode + permission ของ executor เดิม |
| 2 source of truth (roadmap.json vs backlog.json) ขัดกัน | งงว่าใครจริง | roadmap = แผน (คน/Mission Control แก้); backlog = derived (importer สร้าง); ห้ามแก้ backlog มือเมื่อ roadmap เปิด |

---

## 10. Out of scope (รอบนี้ไม่ทำ)

- ไม่ย้าย Mission Control (React UI) มาเขียนใหม่ใน G-Orch — เชื่อมผ่าน MCP เท่านั้น
- ไม่ทำ distributed/multi-host (lock ยังเป็น single-host file lock เดิม)
- ไม่ดูด GoVibe agent runner PowerShell scripts (`run-*.ps1`) — แทนด้วย `orch.agent.run` ที่ผ่าน Verify Gate
- ไม่แตะ G-Log / privacy ของ **ตัวเกม G-Maiden** — brain ของ orchestrator เป็นคนละชั้น (เมตาเรื่องการพัฒนา ไม่ใช่ข้อมูลผู้เล่น)

---

## ภาคผนวก A — checklist เริ่ม M0 (schema extend)

- [ ] เพิ่ม field §3.2 เป็น optional ใน `backlog.json` 1 task (เช่น `G3.4`) เพื่อ smoke test
- [ ] `engine.mjs` อ่าน task ที่มี field ใหม่ได้ และ task ที่ไม่มีก็ยังรัน
- [ ] รัน Verify Gate เดิมบน task ที่มี field ใหม่ → ต้อง pass เหมือนเดิม
- [ ] เขียน `roadmap/SCHEMA.md` นิยาม field กลาง (เป็น `$schema` ของ backlog ใหม่)
