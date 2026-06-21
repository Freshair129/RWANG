# ADR-O-003 — Backend store: flat-file core + GenesisDB เป็น optional backend ของ brain/memory/context

> **Series:** ADR-O (orchestrator-scoped)
> **Status:** Approved (2026-06-21, USER/Boss · RUNBOOK Gate 3)
> **Date:** 2026-06-21
> **Spec:** [SPEC--GOVIBE-INTEGRATION.md](SPEC--GOVIBE-INTEGRATION.md)
> **Related:** [ADR-O-001](ADR-O-001--verify-gate.md) (Verify Gate), [ADR-O-002](ADR-O-002--govibe-integration.md) (GoVibe integration)
> **External system:** GenesisDB / GKS ที่ `G:\GenesisBlock_Dev\GenesisBlock`
> (npm `@freshair129/gks-genesis-block-native`)

---

## Context

[SPEC--GOVIBE-INTEGRATION.md](SPEC--GOVIBE-INTEGRATION.md) เสนอให้ orchestrator ดูดความสามารถ control-plane
ของ GoVibe เข้ามา (roadmap, brain/memory, temporal versioning, traceability, context scoping). ตอนเขียน spec
สมมติว่าต้อง **hand-roll ด้วย flat file** (เช่น §3.3 bitemporal = replay `history.jsonl` เอง, §4.2 brain =
ไฟล์ .md, POLA budget = ตัด context เอง).

ต่อมาพบว่า **GenesisDB มีอยู่จริงและรันได้** — embedded local-first **hybrid graph + vector engine** (Rust,
"advanced prototype", benchmarked) ที่ทำสิ่งที่ spec จะ hand-roll **ได้ native + เร็วกว่า**:

| สิ่งที่ spec จะ hand-roll | GenesisDB ให้ native (จาก `index.d.ts`) |
| --- | --- |
| §3.3 temporal versioning (`history.jsonl`) | bitemporal: `validFrom/validTo`, `QueryInput.asOf`, `supersedeNode`, `LogicalClock`, `recordedAt` |
| §4.2 brain/memory (.md) | property graph + embeddings: `addNode/addEdge`, `detectCommunities`, `SuperNode.drift`, `getMetaHistory` |
| POLA `scope.budgetTokens` (ตัดเอง) | `retrieveContext(targetId, tier, budget, fuzzy)` → `ContextPackage{tokenEstimate, reasoningPath}` + `ScalingTier H0–H5` |
| §8 traceability `symbolLink`/`trace` | edges จริง (code↔doc↔task) + `calculateStructuralGaps` |
| governance gate | `proposeConsensus/submitVote`, `getMerkleRoot`, `semanticVerify` |

interface ที่เชื่อมได้: REST (Axum `/v1/*` :3000), **N-API** (มี binary `index.win32-x64-msvc.node` คอมไพล์แล้ว),
MCP (`mcp/server.js`), Python SDK, Go SDK.

**ต้องตัดสิน:** อะไรเก็บที่ไหน — ไม่ให้ขัด **P1 (zero external dependency ของแกน)** ใน
[ADR-O-002](ADR-O-002--govibe-integration.md) และไม่ทำ Verify Gate/worker-pool ที่ทดสอบแล้วพัง.

---

## Decision

แบ่ง store เป็น **2 ชั้นชัดเจน**:

### 1. Execution core → **flat-file เดิม (zero-dep, บังคับ)**
สถานะ hot-path ของ orchestrator คงอยู่ที่ไฟล์ Node built-in เหมือนเดิม **ไม่แตะ**:
- `state.json` (runtime task state), `backlog.json` (task defs), `.state.lock` (atomic claim), `logs/`, `usage.jsonl`
- เหตุผล: claim/lease/DAG/Verify Gate เป็นเส้นทางวิกฤต ทดสอบแล้ว และต้องรันได้แม้ไม่มี GenesisDB
  (resilience เดียวกับหลักการ G-Signal ของตัวผลิตภัณฑ์)

### 2. Knowledge layer (brain / memory / temporal / context / traceability) → **optional GenesisDB backend**
ชั้นความรู้ที่ §3.3/§4.2/§8 ของ spec พูดถึง ใช้ backend สลับได้ที่ config:

```jsonc
"store": {
  "core": "file",                         // คงที่ — execution state
  "knowledge": "file",                    // "file" | "genesisdb"  (ดีฟอลต์ file)
  "genesisdb": {
    "transport": "napi",                  // "napi" | "rest" | "mcp"
    "path": "G:/GenesisBlock_Dev/GenesisBlock/data/orch.gdb",
    "restUrl": "http://127.0.0.1:3100",   // ใช้เมื่อ transport=rest (ดู §port ด้านล่าง)
    "vectorDim": 1024
  }
}
```

- `knowledge: "file"` (ดีฟอลต์) → พฤติกรรมตาม spec เดิม (flat-file). **zero-dep ยังครบ**
- `knowledge: "genesisdb"` → brain/temporal/context/traceability persist+query ผ่าน GenesisDB
- โค้ดเข้าผ่าน **adapter interface เดียว** (`store/knowledge.mjs` มี 2 implementation: `fileStore`, `genesisStore`)
  — engine เรียก method กลาง (`recordOutcome`, `queryContext`, `asOf`, `linkTrace`) ไม่ผูกกับ backend ตรง ๆ

### 3. Transport ที่แนะนำ: **N-API in-process**
- เลือก `napi` เป็นค่าเริ่ม: เร็วระดับ µs, ไม่ต้องเปิด server, มี binary คอมไพล์แล้ว, **เลี่ยง port conflict**
- `rest`/`mcp` เป็นทางเลือกเมื่ออยากแยก process / ให้ GoVibe Mission Control แชร์ instance เดียวกัน

### 4. แก้ port conflict :3000
GenesisDB REST default **:3000** ชนกับ **Dota 2 GSI listener ของ G-Maiden (:3000)** — GSI ถูกกำหนดโดย Valve
ย้ายยาก. ดังนั้น:
- ใช้ **N-API** (ไม่เปิด port เลย) เป็นหลัก → ไม่มีปัญหา
- ถ้าจำเป็นต้อง REST → รัน GenesisDB server ที่ port อื่น (เช่น `:3100`) ผ่าน config; **GSI คง :3000 เสมอ**

---

## Alternatives considered

| ทางเลือก | ทำไมไม่เลือก |
| --- | --- |
| **flat-file ทั้งหมด** (hand-roll bitemporal/vector/context เอง) | reinvent ของที่ GenesisDB ทำแล้ว+benchmarked; ไม่มี vector search/community/traceability graph จริง; `history.jsonl` replay ช้าเมื่อโต |
| **GenesisDB เป็น store ของแกนด้วย** (แทน state.json/lock) | ทำลาย P1 zero-dep บน hot path; ผูก claim/lease/Verify Gate เข้ากับ native addon; แตก resilience (แกนต้องรันได้แม้ DB ล่ม) |
| **REST-only (เปิด server เสมอ)** | ชน port :3000 กับ GSI; network hop ทุกครั้งที่ดึง context; ต้องดูแล process เพิ่ม |
| **บังคับใช้ GenesisDB (ไม่มี fallback)** | dev ที่ไม่มี GenesisDB รัน orchestrator ไม่ได้; ขัดหลัก "ดูดเฉพาะที่ขาด, เปิด/ปิดได้" |

---

## Consequences

**บวก:**
- แกน execution ยัง zero-dep + resilient (รันได้แม้ไม่มี GenesisDB) — ไม่กระทบ Verify Gate/pool
- เปิด GenesisDB เมื่อพร้อม → ได้ bitemporal, vector search, GRL context (H0–H5 + token budget), traceability
  graph, governance native — แทน hand-roll หลายส่วนใน spec
- adapter เดียว → สลับ backend ได้โดยไม่แก้ engine; ทดสอบด้วย fileStore, รันจริงด้วย genesisStore
- N-API in-process เลี่ยง port :3000 + เร็วสุด
- ปูทางสถาปัตยกรรม 3 ชั้น (G-Orch execution ↔ GenesisDB backend ↔ GoVibe Domain B/C เป็น viewer) เชื่อมผ่าน MCP

**ลบ / ต้นทุน:**
- เมื่อเปิด `genesisdb` orchestrator มี dependency บน native addon (platform binary) — จำกัดเฉพาะชั้น knowledge,
  ปิดได้
- ต้องดูแล mapping schema (task/brain → node/edge/embedding ของ GenesisDB)
- vector embedding ต้องมีแหล่งสร้าง (bge-m3 1024-dim ตาม benchmark) — เพิ่ม dependency ตอนใช้ semantic search
- สอง code path (file/genesis) ต้องทดสอบทั้งคู่

---

## Compliance / กันพัง

- **P1 (zero-dep core):** state.json/backlog.json/.state.lock/Verify Gate **ห้าม**ย้ายไป GenesisDB
- **Fallback บังคับ:** `knowledge` ดีฟอลต์ = `file`; ทุกฟีเจอร์ที่ใช้ GenesisDB ต้องมี degrade path เป็น flat-file
  หรือ "ปิดฟีเจอร์อย่างสุภาพ" (เหมือน cloud-loss ของ G-Signal)
- **Port :3000 สงวนให้ GSI:** GenesisDB ห้ามยึด :3000; ใช้ napi หรือ port อื่น
- **P2 (ไม่ import โค้ด GoVibe):** ยังคง — GenesisDB เป็นคนละ repo, เชื่อมผ่าน interface (napi/rest/mcp) ไม่ copy โค้ด
- **Regression gate:** worker-pool + Verify Gate ต้องผ่านทั้งโหมด `file` และ `genesisdb`

---

## Follow-ups (ออกเป็น task หลัง ADR นี้ผ่าน)

- เพิ่ม section "Knowledge backend (GenesisDB)" ใน [SPEC--GOVIBE-INTEGRATION.md](SPEC--GOVIBE-INTEGRATION.md);
  ตัด/แทนที่ §3.3 (`history.jsonl`) และ §4.2 ที่ hand-roll
- นิยาม adapter interface `store/knowledge.mjs` (`recordOutcome/queryContext/asOf/linkTrace`)
- PoC: `require` N-API addon → `addNode/hybridSearch/retrieveContext` พิสูจน์ round-trip กับ orchestrator
- กำหนด schema mapping: task/session/rca → NodeInput(labels, props, embedding); deps/trace → EdgeInput(rel)
- ตัดสินแหล่ง embedding (bge-m3) สำหรับ semantic search (หรือเริ่มด้วย graph-only ไม่มี vector ก่อน)
