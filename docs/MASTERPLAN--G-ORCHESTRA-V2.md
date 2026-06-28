# MASTERPLAN — Road to G-Orchestra v1

> **Series:** WBS top tier (Masterplan → Phase → Epic → Sprint → Task=atom)
> **Status:** Active · **Date:** 2026-06-29 · **Owner:** Boss (CEO)
> **Source of truth:** `orchestration/gks/atoms.gorch.json` (37 atoms) → `node gks/compile.mjs` → `backlog.gorch.json`
> **Design:** [DESIGN--G-ORCHESTRA-V2.md](DESIGN--G-ORCHESTRA-V2.md) · **Decisions:** [ADR-O-002](ADR-O-002--govibe-integration.md)…[ADR-O-006](ADR-O-006--topology-core-faces-a2a.md)

---

## 1. Vision

G-Orchestra v1 = **the governed autonomous multi-agent orchestrator** — a signed Tauri+Rust desktop product that turns docs/specs into shipped code via a fleet of AI agents, while the user steers, approves, and watches from one Mission Control. *Autonomous where safe, human-confirmed where expensive.* นี่คือสิ่งที่ทำให้ต่างจาก OpenHands/Devin: **autonomy ที่ปลอดภัยโดยโครงสร้าง** (cost-cap + gates + borrow-checker).

**Definition of v1 (done):** จาก desktop app เดียว ผู้ใช้ author atoms → build pipeline (drag/edge) → dispatch wave (cloud-plan / local-code) → Verify Gate → ดู cost/trace สด — แบบ local-first, signed, อัปเดตได้.

**4 promises:** Track it like Jira · Easy as Trello · Claim it like Linear · Graph it like Obsidian · Equip it like a game.

---

## 2. Phase roadmap (milestone bands)

| Phase | Theme | Atoms | Est | Exit milestone |
|---|---|---|---|---|
| **P0 — Foundation** | spec-engine + Tauri shell + GenesisDB + safety floor | 9 | 18 | **M0: skeleton runs** — compile atoms, Tauri window เปิด, engine dispatch 1 task ผ่าน gate |
| **P1 — Core MVP** | AtomStore + 4 surfaces + planner/verify/ownership + product shell | 13 | 29 | **M1 = MVP (dogfood)** — author→dispatch→verify→track cost จาก UI ครบ (persona P0: solo founder) |
| **P2 — Autonomy + Visual** | pipeline canvas + AutoLoop + memory/trace + governed workflow | 10 | 32 | **M2 = differentiators** — visual pipeline (drag/edge) + autonomous self-improving loop + DACI workflow |
| **P3 — Commercial + Scale** | cross-OS + multi-host + A2A + marketplace seam | 5 | 13 | **M3 = sellable** — signed cross-platform, multi-host, peer-interop, marketplace seam (persona P2: customer dev) |
| | **รวม** | **37** | **92** | |

**กลยุทธ์การปล่อย:** v1 ship ได้ที่ **M1** (MVP dogfood). P2 = สิ่งที่ทำให้ "ขายได้/ต่างจากคนอื่น". P3 = scale ไปขายจริง.

---

## 3. Build sequence — 5 dependency waves (ลำดับจริงจาก compile)

Phase = milestone band; **Wave = ลำดับ build จริง** (topological, parallelizable ภายใน wave). atoms ใน wave เดียวกันทำขนานได้.

| Wave | atoms (build พร้อมกันได้) |
|---|---|
| **0** | entity--atom-schema · tech_stack--tauri-shell · tech_stack--genesisdb-sidecar · config--cost-cap-tiers |
| **1** | algo--genesis-compile · protocol--engine-ipc · algo--knowledge-adapter · guard--governance-gate · algo--planner-tiering · algo--ownership-borrow-checker · tech_stack--updater · guard--entitlement · tech_stack--cross-platform · config--routing-cloud-local · config--persona-presets |
| **2** | runbook--doc-to-code-pipeline · feature--atom-store · safety--verify-gate-v2 · eval--goldset-harness · module--multi-host · algo--approval-chain · algo--adaptive-decompose |
| **3** | feature--board · feature--loadout · feature--copilot-console · feature--cockpit · audit--telemetry · feature--graph-editable · entity--traceability-graph · feature--pipeline-canvas |
| **4** | feature--node-db-canvas · feature--memoryos · protocol--a2a-surface · feature--marketplace-seam · algo--autoloop · feature--diagram-ingest · ~~protocol--govibe-mcp-bridge~~ (superseded) |

**Critical path (5 ลึก):** `atom-schema → genesis-compile → doc-to-code-pipeline → traceability-graph → autoloop`. autoloop กับ pipeline-canvas/diagram-ingest = ลึกสุด (wave 3-4) → **เริ่ม deps ของมันแต่เนิ่น ๆ**.

---

## 4. Phase → Epic → Sprint breakdown

### P0 — Foundation (18 est)
- **Epic: Spec Engine** — entity--atom-schema, algo--genesis-compile, runbook--doc-to-code-pipeline (GKS core; 2 atoms exists แล้ว)
- **Epic: Runtime Shell** — tech_stack--tauri-shell, protocol--engine-ipc (Tauri v2 + IPC แทน :4577)
- **Epic: Knowledge Backend** — tech_stack--genesisdb-sidecar, algo--knowledge-adapter (N-API + flat-file fallback)
- **Epic: Safety Floor** — config--cost-cap-tiers, guard--governance-gate (guardrail ตั้งแต่วันแรก)
- *Sprints:* **S0.1** spec-engine+shell (10) · **S0.2** knowledge+safety (8)

### P1 — Core MVP (29 est) → **= release point**
- **Epic: AtomStore + Surfaces** — feature--atom-store, feature--board, feature--cockpit, feature--loadout, feature--copilot-console, audit--telemetry ("one object, lenses")
- **Epic: Planner + Verify + Ownership** — algo--planner-tiering, safety--verify-gate-v2, algo--ownership-borrow-checker, eval--goldset-harness
- **Epic: Routing** — config--routing-cloud-local (cloud=plan/review · local=code)
- **Epic: Product Shell** — tech_stack--updater, guard--entitlement
- *Sprints:* **S1.1** store+board+cockpit (8) · **S1.2** planner+verify+ownership+routing (11) · **S1.3** loadout+copilot+shell (12*)

### P2 — Autonomy + Visual (32 est)
- **Epic: Visual Canvas** — feature--pipeline-canvas (React Flow), feature--diagram-ingest, feature--graph-editable, feature--node-db-canvas (drag/edge surfaces; reuse `setDeps`/`waves`/`detectCycle`)
- **Epic: Memory + Trace** — entity--traceability-graph, feature--memoryos
- **Epic: Autonomy** — algo--autoloop (build→test→benchmark→refine), algo--adaptive-decompose (ADaPT)
- **Epic: Governed Workflow** — config--persona-presets (9 DACI personas), algo--approval-chain
- *Sprints:* **S2.1** memory+trace (5) · **S2.2** visual canvas (14) · **S2.3** autonomy+governance (11)

### P3 — Commercial + Scale (13 est)
- **Epic: Cross-platform + Multi-host** — tech_stack--cross-platform (napi CI), module--multi-host (fencing-token coordinator)
- **Epic: Interop + Marketplace** — protocol--a2a-surface (Agent Card + A2A-as-provider), feature--marketplace-seam
- *Sprints:* **S3.1** cross-platform+multi-host (6) · **S3.2** interop+marketplace (5)

---

## 5. Effort & role rollup

- **Est:** P0=18 · P1=29 · P2=32 · P3=13 · **รวม 92** (relative points, solo-founder velocity — ไม่ผูกวันที่ ตาม ADR-O-006)
- **Roles:** coder 17 · architect 14 · worker 5 · reviewer 1 → ส่วนใหญ่เป็น cloud-architect (plan/design) + local-coder (impl) ตาม `config--routing-cloud-local`
- **State:** exists 2 · **extend 17** (ต่อยอด engine.mjs เดิม) · **new 18** (โค้ดใหม่) → ~ครึ่งคือ extend ของที่รันได้แล้ว

---

## 6. Sequencing flags / risks (ต้องจัดการ)

1. ⚠️ **Phase inversion:** `feature--loadout` (P1, must) depends on `config--persona-presets` (tagged **P2**). build order ถูกต้องอยู่แล้ว (persona-presets อยู่ wave 1 < loadout wave 3) แต่ **tag เพี้ยน** → แนะนำ **re-tag persona-presets เป็น P1** ให้ phase plan สอดคล้อง (1-field fix ใน atoms.gorch.json).
2. **GenesisDB sidecar (P0) = dependency เสี่ยงสุด** — N-API pre-1.0 win32-only. มี **flat-file fallback บังคับ** (`algo--knowledge-adapter`) → P0 ไม่ block ถ้า binary มีปัญหา.
3. **autoloop + pipeline-canvas + diagram-ingest = ลึกสุด (wave 4)** — deps (traceability, goldset, atom-store) ต้องเสร็จก่อน → จัดเข้า P0/P1 ให้ครบก่อนแตะ P2 autonomy.
4. **Verify-Gate ต้องมาก่อน AutoLoop** — autoloop ใช้ verify-gate + goldset เป็น TEST/BENCHMARK step. อย่าเริ่ม autoloop ก่อน 2 ตัวนี้เขียว.
5. **18 new atoms** = net-new — ใช้ `config--routing-cloud-local` ให้ local LLM ทำ coding ที่แตกย่อยแล้ว (`algo--adaptive-decompose`), cloud ทำ architecture/review เพื่อคุมต้นทุน.

---

## 7. Milestone gates (definition of done ต่อ phase)

| Gate | เงื่อนไขผ่าน |
|---|---|
| **M0** (P0) | `pnpm tauri dev` เปิดหน้าต่าง; compile 37 atoms ผ่าน; engine dispatch 1 task ผ่าน governance gate + cost-cap; GenesisDB หรือ flat-file fallback ทำงาน |
| **M1 = MVP** (P1) | author→dispatch wave→Verify Gate→done ครบจาก UI; cost meter หยุดที่ cap; cloud/local routing ทำงาน; signed installer + updater |
| **M2** (P2) | ลาก node/edge บน pipeline-canvas → DAG จริง; AutoLoop รัน 1 goal จนถึง target/termination โดยไม่ runaway cost; approval-chain เดินครบ role |
| **M3** (P3) | binary signed บน win/mac/linux; 2 host แชร์ claim ผ่าน fencing token; external A2A agent delegate งานเข้ามาได้; loadout pack import ผ่าน |

---

## 8. ทำต่อทันที (next action)

เริ่ม **Wave 0 (P0 S0.1)** ขนานกัน:
- `entity--atom-schema` (exists — formalize TS/JSON-schema + round-trip) · `tech_stack--tauri-shell` (Tauri v2 wrap) · `tech_stack--genesisdb-sidecar` (N-API PoC) · `config--cost-cap-tiers` (extend)

> แต่ละ atom = หน่วยงานที่ dispatch ให้ agent ได้เลย (cloud-architect วาง, local-coder ลงมือ ตาม routing). compile/backlog พร้อมแล้ว — `node orchestrator.mjs next` เพื่อหยิบงานถัดไปตาม wave.
