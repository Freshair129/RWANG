# ADR-O-002 — GoVibe integration: G-Orchestration เป็นแกน ดูด control-plane ของ GoVibe เข้ามา

> **Series:** ADR-O (orchestrator-scoped — แยกจาก ADR-01..07 ของตัวผลิตภัณฑ์ G-Maiden)
> **Status:** Approved (2026-06-21, USER/Boss · RUNBOOK Gate 3) · **Superseded-in-part by [ADR-O-006](ADR-O-006--topology-core-faces-a2a.md)** (2026-06-29 — Mission Control ย้าย in-house; GoVibe เปลี่ยนจาก live control-plane → reference-only. ส่วน "G-Orch เป็น execution core + absorb capability" ยังคงอยู่)
> **Date:** 2026-06-21
> **Spec:** [SPEC--GOVIBE-INTEGRATION.md](SPEC--GOVIBE-INTEGRATION.md)
> **Related:** [ADR-O-001](ADR-O-001--verify-gate.md) (Verify Gate)

---

## Context

มีสองระบบที่พัฒนาแยกกันและกำลังจะ integrate:

- **G-Orchestration** (`orchestration/`) — execution engine ที่รันจริงแล้ว: worker pool, atomic
  claim/lease, DAG dependency gating, wave parallelization, model routing (opus/sonnet/haiku/ollama),
  **Verify Gate** (reviewer อิสระ + needs-rework), cost ledger. **Zero external dependency** (Node
  built-in). จุดอ่อน: ไม่มีหน่วยความจำข้ามรัน, ไม่มี roadmap model, ไม่มี governance/traceability,
  ไม่มี MCP surface.

- **GoVibe** (`G:\govibe`) — control plane: Mission Control (React+Vite+ws), roadmap model พร้อม
  **temporal/bitemporal versioning** (field: `code`, `symbolLink`, `version`, `changelog`,
  `tokensUsed`, FR/NFR), `.brain` memory (masterblock RICE/MoSCoW, session, RCA), governance gates
  (`docs:validate`, `diff:check`, `roadmap:validate`, `baseline:check`), agent-role fleet
  (AGENT.md: JANUS/ATHER/LYRA/THESEUS), และ **MCP server** (`govibe-mcp-server.mjs`) เป็น integration
  surface. จุดอ่อน: รัน agent ผ่าน PowerShell แยกตัว — ไม่มี pool/claim/lease/Verify Gate.

สองระบบอยู่ **คนละชั้นของ stack** ไม่ใช่คู่แข่ง: G-Orch เก่ง "ลงมือรัน + ตรวจ", GoVibe เก่ง
"วางแผน + กำกับ + จำ".

## Decision

ทำ integration โดยให้ **G-Orchestration เป็นแกน (execution core)** แล้ว **ดูด (absorb)** ความสามารถ
control-plane ของ GoVibe เข้ามาเป็นโมดูลแยกที่เขียนใหม่ด้วย Node built-in:

1. **ขยาย task schema** ให้มี field ของ GoVibe (`code`, `symbolLink`, `version`, `changelog`,
   `complexity`, `frnfr`, `rice`, `moscow`, `trace`, `audit`, `tokensUsed`) — **optional ทั้งหมด**
2. **เพิ่มโมดูล** (เปิด/ปิดที่ config): roadmap layer + temporal versioning, brain/memory + feedback
   จาก Verify Gate, governance gates (pre/post-dispatch hook), RICE/MoSCoW ranking, agent-role registry
3. **เปิด MCP surface** ห่อ `engine.mjs` เป็น MCP tools (เทียบ `govibe.*`) เพื่อให้ Mission Control ของ
   GoVibe เชื่อมมาสั่ง execution จริงได้โดยไม่ต้องเขียน UI ใหม่
4. ทำเป็นเฟส **M0–M5** ที่แต่ละเฟสส่งมอบได้เองและไม่ทำของเดิมพัง

กำกับด้วยหลักการ 3 ข้อ: **(P1)** ไม่ทำลายของเดิม — zero-dep/file-based/Verify Gate/POLA คงเดิม,
field ใหม่ optional; **(P2)** ดูดเฉพาะที่ขาด, เขียนใหม่ ไม่ import โค้ด GoVibe; **(P3)** เชื่อมผ่าน
contract/MCP ไม่กลืน — GoVibe ยังรันเป็นระบบของตัวเองได้.

## Alternatives considered

| ทางเลือก | ทำไมไม่เลือก |
| --- | --- |
| **GoVibe เป็นแกน, G-Orch เป็น backend** | ของที่ทดแทนยาก (pool/claim/lease/Verify Gate) อยู่ที่ G-Orch; ย้ายแกนไป GoVibe = ลาก React/Vite/ws เข้ามาในเส้นทาง execution + เสี่ยงทำ Verify Gate ที่ทดสอบแล้วพัง |
| **Merge สมมาตรเป็นระบบเดียว** | ต้นทุนสูง, สอง source-of-truth ขัดกัน, เสี่ยง zero-dep แตก; ไม่มีฝ่ายไหนเป็นเจ้าของชัด |
| **ปล่อยแยกกัน เชื่อมหลวม ๆ ด้วยไฟล์ export** | ได้ roadmap viz แต่ไม่ได้ closed loop (outcome ไม่ไหลกลับ brain/roadmap), ไม่ได้ governance/traceability บน execution จริง |

## Consequences

**บวก:**
- G-Orch ได้ memory + roadmap + governance + traceability โดยยังคง zero-dep ในแกน
- Mission Control (React) ของ GoVibe กลายเป็นหน้าสั่ง execution จริงผ่าน MCP — ไม่ต้องเขียน UI ใหม่
- closed loop: roadmap → backlog → dispatch → Verify Gate → state/roadmap → brain (เรียนรู้ข้ามรัน)
- traceability ปิดช่อง "done ≠ ผ่าน" ต่อยอดจาก ADR-O-001

**ลบ / ต้นทุน:**
- task schema ใหญ่ขึ้น (กันด้วย optional + bitemporal เก็บที่ `history.jsonl` ไม่ copy ทุก version)
- มี roadmap.json + backlog.json เป็นคนละบทบาท (แผน vs derived) — ต้องมีกติกาห้ามแก้ backlog มือเมื่อ
  roadmap เปิด
- โมดูลใหม่ 6 ตัว เพิ่มผิวที่ต้องดูแล (กันด้วย config เปิด/ปิด + เฟส M0–M5)

## Compliance / กันพัง

- Verify Gate (ADR-O-001) และ worker pool เดิม **ต้องรันผ่านทุกเฟส** — เป็น regression gate ของ
  integration เอง
- ห้าม import โค้ด GoVibe ตรง ๆ เข้า `orchestration/` (P2) — absorb เป็นข้อมูล/ไอเดียเท่านั้น
- governance gate ต้องมีสวิตช์ `blockOn: error|warn|off` กันทำ progress ค้าง
