# SPEC — Review Cascade (local veto → frontier judgment)

> **Status:** Draft (2026-07-19) — convention บังคับใช้กับ spec ใหม่ทุกตัวตั้งแต่ G2/G3
> **อ้างอิง:** [SPEC--VERIFY-GATE](SPEC--VERIFY-GATE.md) · [SPEC--ACCESS-SCOPE-ENFORCEMENT](SPEC--ACCESS-SCOPE-ENFORCEMENT.md) ·
> หลักฐานเชิงประจักษ์: run `g1-doc-graph-20260719` (T7 opus ×3 รอบ ≈ $1.8 — สองรอบแรกตายกับประเด็น
> mechanical ที่ script จับได้ฟรี; ขณะเดียวกัน T1 local คือผู้เขียน tautology test ที่ซ่อนบั๊ก
> `collisions()` dead-code — พิสูจน์ทั้ง "ทำไมต้องมีชั้นถูก" และ "ทำไมชั้นถูกห้ามมีอำนาจ PASS")

---

## 1. หลักการ: อำนาจไม่สมมาตร (veto-not-pass)

Review แบ่งเป็น 3 ชั้น เรียงจากถูกไปแพง — **ชั้นถูกมีอำนาจปฏิเสธ (VETO) แต่ไม่มีอำนาจอนุมัติ (PASS)**:

| Layer | ผู้ทำ | ต้นทุน | อำนาจ | งาน |
| --- | --- | --- | --- | --- |
| **L0** | script (deterministic) | ฟรี | VETO | re-run verify_command ทุก task · `git diff` grep หา write นอก scope · เช็ค artifact/changelog-row ที่ spec บังคับ · exit code ของ scanner/gates |
| **L1** | **panel of narrow local checkers** (T1 ×3–5) | ฟรี | VETO + annotate | แต่ละ checker ตอบ**คำถามแคบเรื่องเดียว** — แตก judgment ให้กลายเป็น checklist ซึ่งเป็นโซนที่ local เชื่อถือได้; ผลรวม merge ด้วย script (ดู §1.1) |
| **L2** | frontier (T3) | แพง | **PASS/FAIL ตัวจริง** | adversarial judgment ล้วน — semantic correctness, ของที่ "ดูถูกแต่ผิด", ครอบคลุมที่ L0/L1 มองไม่เห็น; ได้ annotations ของ L1 มาช่วยเล็ง |

เหตุที่ห้าม L1 มีอำนาจ PASS: false-PASS ตอน review คือ error ที่แพงที่สุด (หลุดไป ship) และ
local model คือ class เดียวกับผู้ผลิต false-confidence artifacts (tautology test = หลักฐานสด)
— gate ที่ปฏิเสธได้อย่างเดียวจึงประหยัดโดย risk เพิ่ม**ศูนย์**: L1 บอก "ไม่เจอเหตุปฏิเสธ"
≠ "ผ่าน" แปลว่า "ส่งต่อ L2" เท่านั้น

### 1.1 L1 = panel design (v0.2.0 — ตามทิศ Boss: "แยกกันตรวจทีละส่วนแล้วเอาผลมารวม")

L1 ไม่ใช่ "ผู้รีวิว" หนึ่งตัว แต่เป็น **panel ของ checkers เฉพาะด้าน** ตัวละคำถามแคบเรื่องเดียว:

| Checker (ตัวอย่างชุดสาย doc-graph) | คำถามแคบที่ตอบ |
| --- | --- |
| `scope-diff` | diff มี write นอก write-scope ของ spec ไหม |
| `verify-rerun` | verify_command ทุก task ยัง exit 0 ไหม (จริง ๆ เป็น script/L0) |
| `prose-meaning` (ต่อไฟล์) | old vs new ของไฟล์นี้ ความหมายเปลี่ยนไหม (link/format-only?) |
| `link-spotcheck` | ลิงก์ที่แก้ N ตัวสุ่ม resolve ไปเป้าจริงไหม |
| `test-vacuity` (ต่อ assertion ใหม่) | assertion นี้มีทาง FAIL ได้ไหม — ตัวจับ tautology โดยตรง |

กติกา panel:
1. **หนึ่ง checker = หนึ่งคำถาม** — การแตกแบบนี้คือ Narrow Rails ฝั่ง review: แปลง judgment
   เป็น checklist ให้อยู่ในโซนที่ T1 เชื่อถือได้; คำถามที่เขียนให้แคบไม่ได้ = เป็นของ L2 ตั้งแต่ต้น
2. **Independence** — checkers ไม่เห็น output กันเองก่อนรายงาน (กัน anchor bias);
   ขนานเชิง logic (physical จะ serialize ตาม VRAM ก็ได้ ผลเท่ากัน)
3. **Merge ด้วย script ไม่ใช่ LLM** — รวมเป็น `review-pre.json` เดียว:
   `{vetoes: [{checker, ...}], annotations: [{checker, ...}]}` — veto จากตัวไหนก็ได้ = fail-fast
4. **Union ของ checklist ≠ review** — ปัญหา cross-cutting อยู่ระหว่างด้าน
   (vacuous test = "tests ผ่าน"✓+"scope ถูก"✓ แต่ผิด) → PASS ยังเป็นของ L2 เท่านั้น
5. **ขนาด panel: 3–5 ด้าน** — ทุก checker มีต้นทุน checklist ที่ต้อง maintain; ซอยเกิน =
   orchestration overhead โดย marginal catch ต่ำ (W-axis discipline)

## 2. Task template convention (ใช้ใน spec ตั้งแต่ G2/G3)

Review หนึ่งงานแตกเป็นสอง task:

```yaml
  - id: X-R-pre          # L0+L1 รวมใน task เดียว (executor = T1 local)
    tier_hint: T1
    description: >
      PRE-REVIEW (veto-only): (a) re-run every prior task's verify_command and record
      exit codes; (b) git-diff scope check per the spec's write-scope constraint;
      (c) walk the mechanical checklist items lifted from the adversarial review;
      (d) emit findings JSON {vetoes: [], annotations: []} at <tools-path>/review-pre.json.
      ANY veto -> this task FAILS (fail-fast; the adversarial review never runs).
      Zero vetoes -> PASS means "no objection found, escalate" — NEVER "approved".
    verify_command: "<script that exits 0 iff vetoes == [] and all reruns green>"

  - id: X-R-adv          # L2 — อำนาจตัดสินจริง
    tier_hint: T3
    depends_on: [X-R-pre]
    description: >
      ADVERSARIAL REVIEW: consume review-pre.json annotations; judge semantic
      correctness / plausible-but-wrong artifacts / spec-intent coverage.
      Mechanical items already covered by X-R-pre are NOT re-litigated unless
      an annotation flags them. PASS/FAIL with file:line evidence.
```

กติกา:
1. **L2 รันเฉพาะเมื่อ R-pre เขียว** (`depends_on`) — fail-fast ประหยัดรอบแพง
2. checklist ของ R-pre ต้อง**ยกมาจาก** ข้อ mechanical ใน adversarial review เดิม (ไม่คิดใหม่)
   — R-adv เหลือเฉพาะข้อ judgment
3. `review-pre.json` เป็น artifact ของ run — R-adv ต้องอ่านและอ้างถึง
4. Escalation เดิมยังใช้: R-pre เอง fail ซ้ำ → ladder ปกติ; แต่ R-pre ที่ veto ถูกต้อง
   ไม่ใช่ task failure — มันคือ gate ทำงาน (fix แล้ววน R-pre ใหม่ ไม่ escalate)

## 3. อนาคต (ยังไม่ทำ)

- [ ] `orchestrator/run.js`: auto-inject R-pre ก่อน review-role task ที่ tier ≥ T3
      (ให้ cascade เป็น default ไม่ต้องเขียนใน spec)
- [ ] เก็บสถิติ veto-rate ของ L1 ต่อ run ลง ledger — วัดว่าชั้นนี้คุ้มจริงเท่าไหร่

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-19 | ร่างแรก: 3-layer cascade, veto-not-pass rule, task template R-pre/R-adv, หลักฐานจาก G1 T7 ×3 + tautology incident |
| 0.2.0 | 2026-07-19 | §1.1 L1 = **panel of narrow checkers** (ทิศ Boss): หนึ่ง checker หนึ่งคำถาม, independence, script-merge, union≠review, ขนาด 3–5 — เพิ่ม `test-vacuity` checker เป็นตัวจับ tautology ตรง ๆ |
