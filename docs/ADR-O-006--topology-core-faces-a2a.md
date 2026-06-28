# ADR-O-006 — Topology: One Rust Core / Four Faces · Mission Control in-house · GoVibe = reference · A2A seam

> **Series:** ADR-O (orchestrator-scoped)
> **Status:** Approved (2026-06-29, USER/Boss)
> **Date:** 2026-06-29
> **Amends:** [ADR-O-002](ADR-O-002--govibe-integration.md) (Mission Control location + GoVibe-as-live-peer)
> **Extends:** [ADR-O-005](ADR-O-005--provider-registry.md) (A2A remote agent = provider ชนิดใหม่)
> **Related:** [DESIGN--G-ORCHESTRA-V2.md](DESIGN--G-ORCHESTRA-V2.md) §0.5/§3/§9.3, [ADR-O-003](ADR-O-003--backend-store.md) (zero-dep core), [ADR-O-004](ADR-O-004--role-boundary-native.md)

---

## Context

ระหว่าง re-scope G-Orchestra v2 (Tauri+Rust product สำหรับ dev คนอื่น) มีคำถาม topology ที่ค้าง และ ADR-O-002 (2026-06-21) ตัดสินไว้ก่อนที่จะ re-scope — ต้อง amend:

1. **ADR-O-002 ให้ GoVibe เป็น Mission Control (React) ขับ G-Orch ผ่าน MCP** และ "absorb" control-plane เข้ามา โดย GoVibe ยังรันเป็นระบบของตัวเอง (P3). แต่ v2 เป็น product ที่ขายให้ dev → ต้องมี **UI ของตัวเอง (signed desktop, local-first)** ไม่พึ่ง UI ภายนอก
2. โจทย์ใหม่จาก USER: ขับ G-Orch **ผ่าน Claude Code โดยไม่พึ่ง third party** (MCP), มี **Mission Control ในตัว**, ทำงานทั้ง **desktop + web**, เน้น **visual pipeline (drag + edge)**, และต้อง **ติดต่อ A2A** ได้
3. คำสั่ง USER: **GoVibe = reference เท่านั้น ไม่ใช่ core / ไม่ใช่ live dependency** (ดูด design มา reimplement native)
4. atom `protocol--govibe-mcp-bridge` (B15) ต้องเก็บไว้ **เพื่อ A2A** ไม่ใช่เพื่อผูก GoVibe

ปัญหาที่ต้องเคลียร์: core อยู่ภาษาอะไร (Rust/Py)? desktop กับ web แชร์ core ยังไง? MCP กับ A2A ต่างกันยังไง? Mission Control อยู่ที่ไหน? GoVibe สัมพันธ์แบบไหน?

## Decision

### 1. One Rust Core, Four Faces

`g-orch-core` (Rust crate) = แกนเดียว: DAG scheduler · claim/lease **borrow-checker** · governance gates · cost-cap · AtomStore · provider routing · **`OrchestratorPort` (freeze ที่ §9.3)**. มี **4 หน้า** ต่อเข้า core เดียวกัน:

| Face | ตัว | บทบาท | transport |
| --- | --- | --- | --- |
| **A. Tauri desktop** | Rust shell + React webview | **= Mission Control** (Live Cockpit + Pipeline Canvas + Copilot) | `invoke`/`emit` |
| **B. Headless daemon** | `g-orch-daemon` (axum) link core เดียวกัน | web / remote cockpit (control + monitor) | HTTP + WS |
| **C. MCP server** | `rmcp` link core | **Claude Code = director** ขับด้วย NL | MCP tools |
| **D. A2A surface** | A2A endpoint | peer-agent interop (fleet อื่น ↔ G-Orch) | JSON-RPC + SSE |

Frontend ไม่รู้ว่าคุยกับใคร เพราะ implement `OrchestratorPort` 2 transport (Tauri invoke / daemon HTTP-WS).

### 2. Stack — Rust + TS/React, ไม่เอา Python

- **Core = Rust** (single signed binary; claim/lease *คือ* ownership problem; ไม่ bundle Python runtime)
- **Frontend = TypeScript + React + Vite** (codebase เดียว ใช้ทั้ง webview + browser); **React Flow (`@xyflow/react`)** สำหรับ Pipeline Canvas (drag node + edge), Sigma.js สำหรับ knowledge graph
- **Desktop-first Tauri + web via shared daemon** (core crate เดียว 2 binary)
- **ไม่เอา Python core** — packaging/signing นรก, GIL, 3 crash domains; embeddings/judge ไป Ollama อยู่แล้ว

### 3. Mission Control in-house *(amends ADR-O-002)*

Live Cockpit + Pipeline Canvas + Copilot Console อยู่ **ใน Tauri app ของ G-Orchestra เอง** — **ไม่ใช่** React app ของ GoVibe ขับผ่าน MCP อีกต่อไป

### 4. GoVibe = reference-only *(refines ADR-O-002 P3)*

ดูด *design* ของ GoVibe (10-system decomposition, agent personas/DACI, governance workflow, mission contract) มา **reimplement native เป็น atom** — **ไม่ผูก runtime, ไม่ import code, ไม่ MCP-bridge ไปหา GoVibe**. เอกสาร GoVibe ที่อ้างอิงวางใน `ref/govibe/` (read-only, ไม่ใช่ source of truth)

### 5. Claude Code = director + executor (no third-party)

- **Director:** Claude Code session (interactive) ต่อ MCP (Face C) — author atoms, สั่ง wave, brainstorm (ถูก, คุยอย่างเดียว)
- **Executor:** `claude -p` headless ที่ core spawn — ทำงานจริง (metered + ผ่าน gate, `CREATE_NO_WINDOW` บน Windows)
- ไม่มี third-party agent framework

### 6. A2A surface เก็บไว้ + generalize *(extends ADR-O-005)*

- **supersede atom `protocol--govibe-mcp-bridge` → `protocol--a2a-surface`** (open standard, consumer-agnostic; GoVibe = first ref consumer)
- **A2A remote agent = Provider ชนิดใหม่ใน Provider Registry (ADR-O-005)** — transport `a2a` (JSON-RPC), capabilities ตาม Agent Card → borrow-checker / gates / cost-cap / Verify Gate ทำงานเหมือน `claude -p`/`ollama` ทุกประการ
- **MCP ≠ A2A:** MCP = แนวตั้ง (Claude Code director เรียก tool ของ G-Orch); A2A = แนวนอน (agent ↔ agent peer). G-Orch เป็น A2A **ทั้ง server** (โฆษณา Agent Card ที่ `/.well-known/agent-card.json`) **และ client** (delegate ออกผ่าน registry)

## Alternatives considered

| ทางเลือก | ทำไมไม่เลือก |
| --- | --- |
| **GoVibe เป็น Mission Control (ADR-O-002 เดิม)** | product ขายให้ dev ต้องมี UI signed desktop + local-first ของตัวเอง; 2 UI / 2 source-of-truth; live coupling เปราะ |
| **Python core** | packaging/signing นรกตอนขาย, GIL, 3 runtime; ไม่จำเป็น (embeddings ไป Ollama) |
| **Web-only ไม่มี desktop** | browser spawn `claude -p` ไม่ได้; ขัด local-first/secrets |
| **เก็บ GoVibe MCP bridge แบบผูก GoVibe** | เป็น coupling เฉพาะเจ้า; generalize เป็น A2A open standard ได้ทั้ง GoVibe + ใครก็ได้ |
| **ตัด A2A ทิ้ง** | เสีย peer interop + multi-host future; USER ต้องการ A2A |
| **A2A เป็น subsystem แยก** | over-build; A2A agent = แค่ provider type + 1 endpoint บน daemon ที่มีอยู่แล้ว |

## Consequences

**บวก:**
- core เดียว หลายหน้า; UI ไม่เห็นว่าฝั่งไหนเป็น Rust/Node (OrchestratorPort §9.3 freeze)
- Claude Code ขับ + ทำงาน → ไม่มี third-party agent framework (ตรงโจทย์ "no third party")
- A2A agent เสียบเข้า provider registry เดิม → guardrails ทั้งหมดใช้ซ้ำ ไม่ต้องสร้าง subsystem
- Mission Control in-house → signed desktop, local-first, ขายได้
- GoVibe = ref → ไม่มี live dependency ให้ดูแล, สถาปัตย์ง่ายลง

**ลบ / ต้นทุน:**
- **Director↔Executor recursion** (Claude Code สั่ง orchestrator ที่ spawn Claude Code) = เสี่ยงบานปลายค่าใช้จ่าย → **บังคับ cost-cap + gate บน MCP path ด้วย**, director ห้าม spawn เอง
- **Web face ทำได้แค่ control/monitor** — execute อยู่ daemon/desktop เท่านั้น (security boundary ถาวร)
- 2 graph lib (React Flow + Sigma) เพิ่ม bundle — ยอมรับ (คนละงาน)
- ต้อง build MCP server (rmcp) + A2A surface เพิ่ม = ผิวใหม่ที่ต้อง battle-test

## Compliance / กันพัง

- **Amends ADR-O-002:** Mission Control ย้ายเข้า in-house; GoVibe เปลี่ยนจาก live control-plane → reference. ส่วน "G-Orch เป็น execution core + absorb capability" ของ ADR-O-002 **ยังอยู่**
- **Extends ADR-O-005:** เพิ่ม provider transport `a2a`; resolution algorithm เดิมไม่เปลี่ยน
- **ADR-O-003 (zero-dep core) คงหลัก** — Rust core, ไม่ลาก framework หนัก
- **Atom action:** supersede `protocol--govibe-mcp-bridge` → `protocol--a2a-surface` (ตาม B1: broaden = supersede ไม่ใช่ rename); core ใช้ `OrchestratorPort` เดียวทุก face
- gate pre-dispatch (guard--governance-gate) ต้องครอบ **ทุก** entry: GUI / daemon / MCP / A2A

## Revisit when

- Claude Code ออก native multi-agent teams → ประเมิน director/executor split ใหม่
- A2A spec เปลี่ยนสาระสำคัญ (Agent Card / task lifecycle)
- `module--multi-host` (P3) ลง → A2A อาจ overlap กับ coordinator/fencing
- web face ต้องการ execute จริง → ต้องออกแบบ remote-executor + auth model แยก
