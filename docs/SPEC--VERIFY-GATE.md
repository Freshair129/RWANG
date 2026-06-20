# SPEC — Verify Gate (per-task code review)

> **Status:** Proposed (ยังไม่ implement — เอกสารนี้กำกับการสร้าง)
> **Scope:** orchestration/ (multi-agent task orchestrator) — ไม่ใช่ตัวผลิตภัณฑ์ G-Maiden
> **Governed by:** [ADR-O-001](ADR-O-001--verify-gate.md)
> **อ้างอิง:** `docs/CONCEPT--SUBAGENT-CONTEXT-SCOPING.md` (reviewer scoping),
> `docs/02-Engineering-Spec.md` §7 (Definition of Done), `docs/GUIDE--SMALL-MODEL-PROMPTING.md`

---

## 1. ปัญหา (ทำไมต้องมี)

ตอนนี้ orchestrator mark task เป็น `done` จาก **สัญญาณว่า "ทำจบ"** เท่านั้น:
- claude: exit 0 + ไม่เจอ `BLOCKED:`
- ollama: มี content (ไม่ empty) + ไม่ BLOCKED

**ไม่มีการตรวจว่า output ถูกต้อง/ตรง acceptance จริงไหม.** ผลคือ `done` = "จบ" ไม่ใช่ "ผ่าน" —
หลอกตาเวลาดู progress (เช่น G0.3 ขึ้น done ทั้งที่มี GitHub Action ปลอม `actions/setup-rust@v3`
และลืม `pnpm` prefix). โดยเฉพาะ output จาก local model ที่เป็น draft.

**Verify Gate** แทรกขั้น **review โดย agent อิสระ** ระหว่าง "produce" กับ "done" เพื่อให้
`done` แปลว่า "ผ่าน acceptance แล้ว".

---

## 2. Workflow (state machine)

```
                    ┌─────────────────────────── rework loop (≤ maxReworkRounds) ──────────────┐
                    ▼                                                                           │
 todo ──claim──► running ──produce──► reviewing ──review──►  ┌── pass ──► done                  │
   ▲                                      │                  └── fail ──► needs-rework ──re-dispatch (แนบ issues)
   │                                      │
   └──────────── release ─────────────────┘   (empty/BLOCKED จาก produce = ข้าม review → failed ทันที)
```

สถานะใหม่ที่เพิ่ม: **`reviewing`**, **`needs-rework`**
(ของเดิม: `todo / claimed / running / done / failed`)

### กติกาเปลี่ยนสถานะ
1. produce เสร็จ + `ok && !empty && !blocked` → เข้า **`reviewing`** (ถ้า `requireReview`); ไม่งั้น → `done` เลย
2. reviewer ตัดสิน:
   - **pass** → `done`
   - **fail** → `needs-rework` (แนบ `issues[]` ลง log)
3. ถ้า `autoRework` เปิด: `needs-rework` → re-dispatch worker เดิม โดยแนบ issues เข้า prompt → วนข้อ 1
   จนกว่า **pass** หรือครบ **`maxReworkRounds`** → ค้างที่ `needs-rework` ให้คนดู (surface, ไม่เงียบ)
4. produce ที่ `empty / BLOCKED` → `failed` ทันที ไม่เข้า review (ไม่มีอะไรให้ตรวจ)

---

## 3. Reviewer agent

### 3.1 ความเป็นอิสระ (ห้ามตรวจงานตัวเอง)
- reviewer **ต้องคนละ model tier กับ worker** — worker ตรวจงานตัวเองจะลำเอียง (เหมือน CONCEPT ว่า
  subagent ตั้ง scope เองไม่ได้)
- mapping เริ่มต้น (`config.review.reviewerByTier`):

  | worker | reviewer |
  | --- | --- |
  | local (ollama) | `sonnet` |
  | haiku | `sonnet` |
  | sonnet | `opus` |
  | opus | `opus` (หรือ skip — งานวางแผน reviewer เท่ากันพอ) |

### 3.2 Scope แคบ (POLA)
reviewer ได้เฉพาะ:
- `task.title` + `task.accept` (เกณฑ์ผ่าน)
- **output ของ task นั้น** (จาก log) — ไม่ใช่ทั้ง repo
- `scope.docs` ของ task (ถ้าจำเป็นต่อการตรวจ; orchestrator-only ถูกกรองออกเหมือนเดิม)

ไม่โหลดบริบทอื่นเกินจำเป็น (ลด token + blast radius ตาม CONCEPT)

### 3.3 Adversarial framing
prompt ให้ reviewer **พยายามหาข้อผิด** ก่อน ไม่ใช่หาเหตุผลให้ผ่าน — default เป็น `fail` เมื่อไม่มั่นใจ
(จาก pattern adversarial-verify). สำหรับ task สำคัญอาจใช้ reviewer หลายตัว (majority vote) — เฟสถัดไป.

### 3.4 Output schema (structured)
reviewer ต้องคืน JSON ตามนี้ (บังคับรูปแบบ):

```json
{
  "verdict": "pass | fail",
  "score": 0,
  "issues": [
    { "severity": "critical | major | minor", "area": "correctness|security|nfr|style", "detail": "...", "fix": "..." }
  ],
  "summary": "หนึ่งบรรทัด"
}
```

### 3.5 กติกาตัดสิน (decision rule)
- `verdict == "pass"` **และ** ไม่มี issue `severity == "critical"` → **pass**
- มี critical ใด ๆ → **fail** (ต่อให้ reviewer บอก pass ก็ตาม — กันลำเอียง)
- major ปล่อยผ่านได้แต่ log ไว้; ปรับได้ด้วย `config.review.failOn` (`critical` | `major`)

---

## 4. Config (ที่จะเพิ่มใน `config.json`)

```json
"review": {
  "enabled": true,
  "requireReviewDefault": true,
  "failOn": "critical",
  "autoRework": true,
  "maxReworkRounds": 1,
  "reviewerByTier": { "ollama": "sonnet", "haiku": "sonnet", "sonnet": "opus", "opus": "opus" },
  "skipForDraft": true
}
```

override ต่อ task ใน backlog: `task.requireReview: false` (เช่น งาน draft local ที่ตั้งใจให้คนเกลาต่อ
อยู่แล้ว — `skipForDraft` ทำให้ task ที่ pin `model:"local"` ข้าม review โดยอัตโนมัติได้)

---

## 5. Telemetry & quality signal
- บันทึก verdict + issues ลง log แยก (`logs/<id>.<worker>.review.log`) และนับใน usage ledger
  (reviewer ก็กิน token — claude tier)
- **review-reject count เป็นสัญญาณคุณภาพ:** task ยากที่ผ่าน review รอบเดียวโดยไม่มี issue เลย
  = น่าสงสัย (reviewer หละหลวม) — ตาม CONCEPT §"why escalation is load-bearing"
- UI: badge สถานะ `reviewing` (สีเหลือง pulse), `needs-rework` (ส้ม) + ดู verdict ใน modal

---

## 6. Edge cases
| กรณี | พฤติกรรม |
| --- | --- |
| reviewer ใช้ไม่ได้ (cloud หลุด/ไม่มี tier) | ค้างที่ `reviewing` + log เตือน; ไม่ auto-pass (fail-safe) |
| reviewer ตอบ BLOCKED | treat เป็น fail + surface (ขาดบริบทตรวจ) |
| produce empty/BLOCKED | `failed` ก่อนถึง review |
| ครบ maxReworkRounds ยังไม่ผ่าน | ค้าง `needs-rework` ให้คนตัดสิน (ไม่วนไม่จบ) |
| ต้นทุน token | review เพิ่ม ~1 agent/task — ปิดได้ด้วย `requireReview:false` หรือ `skipForDraft` |

---

## 7. Engine integration (จุดที่ต้องแก้ — implementation note)
- เพิ่มสถานะ `reviewing` / `needs-rework` (ไม่อยู่ใน ACTIVE; needs-rework แสดงปุ่ม re-run/release)
- `runAgent` ของ worker เสร็จ → ถ้า `requireReviewFor(task)` → `setStatus(reviewing)` → `runReview(task)`
- `runReview(task)`: build reviewer prompt (scope §3.2) → spawn `claude -p --model <reviewerTier>`
  ด้วย StructuredOutput schema §3.4 → parse verdict → decision rule §3.5
- `requireReviewFor(task)`: `task.requireReview ?? !(skipForDraft && isLocalPinned(task)) ?? requireReviewDefault`
- rework: re-dispatch worker เดิม โดย `buildPrompt` แนบ section "ROUND N — แก้ตาม issues:" + issues[]
- runPool/dispatchOne เรียก path ใหม่นี้แทนการ setStatus(done) ตรง ๆ

---

## 8. Verification (ของ feature นี้เอง)
- [ ] task ที่ output ผิด acceptance ต้องได้ `needs-rework` ไม่ใช่ `done`
- [ ] reviewer ต้องคนละ tier กับ worker เสมอ (ไม่มี self-review)
- [ ] reviewer prompt มีเฉพาะ acceptance + output + scope.docs (ไม่มี orchestrator-only, ไม่มีทั้ง repo)
- [ ] rework loop หยุดที่ maxReworkRounds (ไม่วนไม่จบ)
- [ ] `requireReview:false` / draft → ข้าม review ได้จริง
- [ ] reviewer ใช้ไม่ได้ → ค้าง reviewing ไม่ auto-pass
