# SPEC — Local-Model Anti-Error Loop (knowledge-grounded dispatch)

> **Status:** Approved (2026-06-21, USER/Boss · RUNBOOK Gate 2) — กำกับการสร้าง
> **Scope:** `orchestration/` — ใช้ GenesisDB เป็น knowledge backend เพื่อ **ลด failure ของ local model /
> microtask** (เป้าหมายหลัก ไม่ใช่ generic memory)
> **Governed by:** [ADR-O-001](ADR-O-001--verify-gate.md) (Verify Gate), [ADR-O-003](ADR-O-003--backend-store.md)
> (GenesisDB = optional knowledge backend)
> **อ้างอิง failure จริง:** `docs/GUIDE--SMALL-MODEL-PROMPTING.md`,
> [REPORT--prompt-fix-before-after.md](REPORT--prompt-fix-before-after.md)

---

## 1. ปัญหา — failure mode ที่ยังเหลือหลัง Verify Gate

จาก GUIDE + REPORT (ภาคสนามจริง) local model / microtask ผิดพลาดแบบนี้:

| Failure mode | mitigation ปัจจุบัน | **ช่องว่างที่ยังเหลือ** |
| --- | --- | --- |
| Hallucinate API จริง (`setup-rust@v3`), ลืม `pnpm` | Verify Gate จับ → needs-rework | ❌ **รอบหน้าทำผิดเดิมซ้ำ** — ไม่มี memory ของความผิด |
| Context overflow / attention collapse (ส่งไฟล์เต็ม → แก้มั่ว) | POLA `scope.docs` + `budgetTokens` (เดาเอง) | ❌ scope **ด้วยมือ** ไม่แม่น; budget เกินจริงบ่อย |
| Blank-page syndrome (from-scratch → pattern ขยะ) | GUIDE: scaffolding-first | ❌ scaffold static; **ไม่มี exemplar จริง**จากงานที่เคยผ่าน |
| Repetition loop / forgetting | GUIDE: micro-task, anti-loop prompt | ⚠️ ลดได้แต่ยังเกิดเมื่อ context ไม่คม |
| Empty counted as done | Verify Gate content-check (แก้แล้ว) | ✅ ปิดแล้ว |

**แก่นช่องว่าง:** ระบบ **"จับ" error ได้** (Verify Gate) แต่ local model **"เรียนรู้ไม่ได้"** —
RCA ถูกเขียนเป็น `.md` แต่ไม่เคยถูก **ดึงกลับเข้า prompt** ของรอบถัดไป. บวกกับ `maxReworkRounds: 1`
(ลองรอบเดียวแล้ว escalate) → ความผิดเดิมวนกลับมาเรื่อย ๆ.

---

## 2. แนวคิด — closed anti-error loop

เปลี่ยน knowledge backend (GenesisDB, ADR-O-003) จาก "ที่เก็บความจำเฉย ๆ" เป็น **วงปิดกันผิดซ้ำ**:

```
   ┌──────────────────── inject grounded context ◄─────────────────┐
   ▼                                                               │
dispatch(local/microtask) ──► produce ──► Verify Gate ──pass──► done
                                              │ fail                │
                                              ▼                     │
                                  store failure as node+embedding ──┘
                                  (task คล้ายรอบหน้า → retrieve "❌ X")
```

3 กลไก (map ตรงกับ GenesisDB API จาก `index.d.ts`):

| กลไก | แก้ failure | GenesisDB primitive |
| --- | --- | --- |
| **G1 — Ground:** ดึง context ที่คมพอดี budget | overflow, blank-page | `retrieveContext(targetId, tier, budget, fuzzy)` → `ContextPackage{tokenEstimate, reasoningPath}` (GRL H0–H5) |
| **G2 — Remember:** เก็บความผิดทุกครั้งที่ Verify Gate ตีกลับ | ทำผิดซ้ำ | `addNode{labels:["failure"], embedding, props:{issue, fix}}` + `addEdge{rel:"failed_with"}` |
| **G3 — Retrieve:** ก่อน dispatch ดึง "ความผิด/ตัวอย่าง" ที่คล้าย task นี้ | ทำผิดซ้ำ, hallucinate | `hybridSearch{queryVector, k, alpha}` บน failure/passed nodes |

---

## 3. Prompt-injection contract (ต่อยอด `buildPrompt`)

ก่อน dispatch local/microtask, ประกอบ prompt จาก (ตามลำดับ):

```
[ROLE / SMALL_MODEL_RULES]          ← เดิม (GUIDE: one-action, ≤150 บรรทัด, surgical, escalate)
[SCAFFOLD]                          ← เดิม (task.scope.scaffold)
[GROUNDED CONTEXT]                  ← G1: retrieveContext(budget = scope.budgetTokens)
[❌ PAST MISTAKES — ห้ามทำ]          ← G3: top-k failure nodes ที่คล้าย task นี้ (เช่น "ห้ามใช้ actions/setup-rust@vN — ไม่มีจริง; ใช้ dtolnay/rust-toolchain")
[✅ EXEMPLAR (optional)]             ← G3: passed task ที่คล้าย เป็น few-shot
[TASK + ACCEPTANCE]                 ← เดิม
```

**กติกาคุม overflow (แก้ failure mode หลัก):** ผลรวม token ของ prompt **ต้อง ≤ `scope.budgetTokens`**
โดยใช้ `ContextPackage.tokenEstimate` เป็นมาตรวัด. ถ้าเกิน → ตัด EXEMPLAR ก่อน, แล้ว GROUNDED CONTEXT
(เลื่อน tier ลง H0→H1), เก็บ PAST MISTAKES ไว้เสมอ (สำคัญสุดต่อการกันผิดซ้ำ).

---

## 4. Data model — failure/task เป็น node ใน GenesisDB

map ผ่าน adapter `store/knowledge.mjs` (ADR-O-003) ไม่ผูก engine กับ backend ตรง:

```jsonc
// task → node
addNode({ labels:["task"], lang:"th",
  props:{ id:"G0.3", type:"config", title:"...", accept:"..." },
  embedding: embed(title + accept) })          // ใช้ค้นหา "task คล้าย"

// Verify Gate fail → failure node + edge
addNode({ labels:["failure"],
  props:{ issue:"hallucinated actions/setup-rust@v3", severity:"critical",
          fix:"ใช้ dtolnay/rust-toolchain แทน", model:"ollama:gemma4-rust-coder" },
  embedding: embed(issue + task.title) })
addEdge({ from:"G0.3", to:<failureId>, rel:"failed_with", causedBy:<reviewVerdictId> })
```

- **bitemporal** (`validFrom`/`asOf`/`supersedeNode`): เมื่อ fix แล้ว → `supersedeNode` ความผิดเก่า →
  retrieve เห็นว่า "เคยผิด แต่ fix แล้วเป็น Y" (ไม่ใช่แค่ "เคยผิด")
- **community/drift** (`detectCommunities`, `SuperNode.drift`): จัดกลุ่มความผิดที่เกิดบ่อย → สัญญาณว่า
  ควรแก้ที่ scaffold/GUIDE ระดับระบบ ไม่ใช่ราย task

---

## 5. ทำไมต้อง vector/embedding ตั้งแต่เฟสแรก (ตอบคำถามที่ค้าง)

กลไก G3 "ดึงความผิด/ตัวอย่างที่**คล้าย** task นี้" = **semantic similarity** ไม่ใช่ graph traversal —
graph-only ตอบ "task ไหนผิดแบบเป๊ะ ๆ id เดียวกัน" ได้ แต่ตอบ "task อื่นที่งานคล้ายกันเคยผิดยังไง" ไม่ได้.
ดังนั้น **ต้องมี `hybridSearch` (vector + lexical) ตั้งแต่ L1** — embedding ไม่ใช่ของ optional ในสเปกนี้.

**แหล่ง embedding** (ต้องตัดสิน — ดูท้ายเอกสาร): `bge-m3` 1024-dim (ตรงกับ benchmark GenesisDB,
`vectorDim:1024`) ผ่าน Ollama local (`/api/embeddings`) — ฟรี, on-device, ไม่กินโควต้า Claude.
GenesisDB มี Thai-aware lexical matching อยู่แล้ว → `alpha` ผสม vector↔lexical ช่วยงานไทย.

---

## 6. Degrade path (รักษา P1 zero-dep ของแกน)

`store.knowledge = "file"` (ดีฟอลต์) → ปิด G1/G2/G3, fallback เป็น **GUIDE static + Verify Gate เดิม** —
orchestrator ยังรัน pool+verify ได้ครบ (ไม่ต้องมี GenesisDB/embedding). เปิด `genesisdb` เมื่อพร้อม.
หลักเดียวกับ resilience ของ G-Signal: ฟีเจอร์เสริมหายได้ แกนต้องรอด.

---

## 7. Acceptance

- **กันผิดซ้ำ:** task ที่เคย fail ด้วย hallucinated API `X` → รัน task **คล้ายกัน**รอบถัดไป, prompt มีบรรทัด
  "❌ ห้ามใช้ X" และ output ไม่ทำผิดเดิม (วัดเทียบ before/after แบบ REPORT)
- **กัน overflow:** prompt ที่ inject แล้ว `tokenEstimate ≤ scope.budgetTokens` ทุกครั้ง
- **resilience:** `knowledge=file` → pool + Verify Gate ผ่านเหมือนเดิม (regression gate)
- **retrieval ตรง:** `hybridSearch` คืน failure ที่เกี่ยวจริง (สุ่มตรวจ top-k ด้วยมือ)

---

## 8. Migration (เฟส L0–L3 — เสริมจาก ADR-O-003 follow-ups)

| เฟส | ขอบเขต | ได้อะไร | แตะ prompt ไหม |
| --- | --- | --- | --- |
| **L0 — Failure write-only** | Verify Gate fail → `addNode(failure)` + edge (G2) | เริ่มสะสมความจำความผิด | ❌ ไม่แตะ (ปลอดภัยสุด) |
| **L1 — Failure retrieval** | ก่อน dispatch → `hybridSearch` → inject "❌ past mistakes" (G3) | **กันผิดซ้ำ** (คุณค่าหลัก) | ✅ เพิ่ม block เดียว |
| **L2 — Context grounding** | `retrieveContext(tier,budget)` แทน manual `scope.docs` (G1) | context คม, กัน overflow | ✅ แทน section |
| **L3 — Verified exemplar** | `hybridSearch` passed task → few-shot (G3) | กัน blank-page/hallucinate | ✅ optional block |

ลำดับนี้เอา **L0 (เก็บ ไม่เสี่ยง) → L1 (กันผิดซ้ำ ผลตรงเป้าสุด)** ก่อน. L2/L3 เพิ่มความคมเมื่อพิสูจน์ L1 แล้ว.

---

## 9. ของที่ต้องตัดสินก่อนเริ่ม L0

- **แหล่ง embedding:** `bge-m3` ผ่าน Ollama local (แนะนำ) หรือแหล่งอื่น — ต้องมีก่อน L1
- **นิยาม "คล้าย":** `hybridSearch` `k` + `alpha` (สัดส่วน vector↔lexical) เริ่มที่เท่าไร (เสนอ k=3, alpha=0.5)
- **threshold inject:** similarity ต่ำกว่าเท่าไรไม่ inject (กัน noise) — เสนอเริ่ม 0.6
