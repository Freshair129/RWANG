# ADR-O-001 — Verify Gate: independent per-task code review before `done`

> **Series:** ADR-O (orchestrator-scoped — แยกจาก ADR-01..07 ของตัวผลิตภัณฑ์ G-Maiden ใน
> `docs/03-Technical-Design-Document.md`)
> **Status:** Approved (2026-06-21, USER/Boss · RUNBOOK Gate 3)
> **Date:** 2026-06-21
> **Spec:** [SPEC--VERIFY-GATE.md](SPEC--VERIFY-GATE.md)

---

## Context

orchestrator (`orchestration/`) แจกจ่าย task ให้ AI worker (Claude tiers หรือ local Ollama) แล้ว
mark `done` จาก **สัญญาณการทำจบ** เท่านั้น (exit code / มี output / ไม่ BLOCKED) — **ไม่ได้ตรวจ
ความถูกต้องเทียบ `acceptance`**.

ผลที่สังเกตจริง: task `G0.3` ขึ้น `done` ทั้งที่ output มีข้อผิด (`actions/setup-rust@v3` เป็น action
ที่ไม่มีจริง, ลืม `pnpm` prefix). output จาก local model เป็น "draft" โดยธรรมชาติ — `done` จึง
สื่อความหมายผิด ("จบ" ≠ "ผ่าน") และทำให้ progress ที่เห็นเชื่อถือไม่ได้.

เอกสารออกแบบเรียกร้องการตรวจอยู่แล้ว (`docs/02-Engineering-Spec.md` §7 Definition of Done,
`CONCEPT--SUBAGENT-CONTEXT-SCOPING` §"why escalation is load-bearing") แต่ยังไม่ถูก wire เข้า runtime.

## Decision

แทรก **Verify Gate** ระหว่าง "produce" กับ "done": หลัง worker ผลิต output จะ spawn
**reviewer agent อิสระ** (คนละ model tier กับ worker) มาตรวจ output เทียบ `acceptance` แล้วคืน
verdict แบบ structured. task เป็น `done` **ก็ต่อเมื่อผ่าน review** (ไม่มี critical issue); ไม่ผ่าน →
`needs-rework` พร้อม issues (auto re-dispatch ได้สูงสุด `maxReworkRounds` รอบ).

หลักการบังคับ:
1. **ห้าม self-review** — reviewer ต้องคนละ tier (worker local/haiku → reviewer sonnet; sonnet → opus)
2. **Reviewer scope แคบ (POLA)** — เห็นเฉพาะ acceptance + output + scope.docs ของ task นั้น ไม่ใช่ทั้ง repo
3. **Adversarial** — reviewer พยายามหาข้อผิดก่อน, default `fail` เมื่อไม่มั่นใจ
4. **Fail-safe** — reviewer ใช้ไม่ได้ → ค้าง `reviewing` ไม่ auto-pass
5. **ไม่วนไม่จบ** — ครบ maxReworkRounds → ค้าง `needs-rework` ให้คน (surface ไม่เงียบ)

## Alternatives considered

| ทางเลือก | ทำไมไม่เลือก |
| --- | --- |
| **A. คงเดิม (ไม่ review)** | `done` หลอกตา; draft ผิด ๆ ผ่านได้ — ปัญหาที่กำลังแก้ |
| **B. self-review (worker ตรวจเอง)** | ลำเอียง — โมเดลเดียวกันมองไม่เห็นข้อผิดตัวเอง; ขัด CONCEPT (independence) |
| **C. human-only review** | ไม่ scale กับ 45 task / fan-out; คนกลายเป็นคอขวด |
| **D. static check อย่างเดียว** (lint/compile) | จับได้แค่ syntax ไม่จับ "ตรง acceptance ไหม / action ปลอม / logic"; เสริมได้แต่ไม่พอ |
| **E. judge panel หลายตัวทุก task** | แพง token เกินจำเป็นสำหรับงานทั่วไป — เก็บไว้เป็น opt-in งานสำคัญ (เฟสถัดไป) |

## Consequences

**ดี**
- `done` มีความหมายจริง = "ผ่าน acceptance" → progress เชื่อถือได้
- จับ draft ผิดของ local model อัตโนมัติก่อนสะสมเป็นหนี้
- review-reject count เป็น quality signal (ตาม CONCEPT)
- เข้ากับ pattern เดิม (POLA scope, model-tier routing, BLOCKED escalation)

**แลกมา**
- **+1 agent/task** (reviewer ใช้ token tier claude เสมอ แม้ worker เป็น local ฟรี) → ต้นทุนเพิ่ม
  → บรรเทาด้วย `requireReview:false` ต่อ task และ `skipForDraft` (งาน local draft ข้าม review ได้)
- เพิ่ม latency ต่อ task (รีวิวก่อนปิด)
- reviewer เองอาจผิด (false fail/pass) → บรรเทาด้วย adversarial framing + human escalation ที่ปลายทาง
- เพิ่มความซับซ้อน state machine (`reviewing`, `needs-rework`)

## Compliance / links
- POLA reviewer scoping → `docs/CONCEPT--SUBAGENT-CONTEXT-SCOPING.md`
- Definition of Done ที่ gate ควรบังคับ → `docs/02-Engineering-Spec.md` §7
- discipline ของ output ที่ reviewer ตรวจ → `docs/GUIDE--SMALL-MODEL-PROMPTING.md`
- รายละเอียด workflow/schema/config/edge-case → [SPEC--VERIFY-GATE.md](SPEC--VERIFY-GATE.md)

## Revisit when
- ต้นทุน review สูงเกินรับ → พิจารณา static-check-first แล้วค่อย agent-review เฉพาะที่ผ่าน static
- ต้องการความเชื่อมั่นสูงขึ้นในงานสำคัญ → ยก reviewer เป็น judge panel (majority vote)
- มี escalate() round-trip จริง (ตาม CONCEPT) → ผูก needs-rework เข้ากับ escalation API
