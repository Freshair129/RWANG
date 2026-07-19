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
| **L1** | local SLM (T1) | ฟรี | VETO + annotate | ไล่ review checklist เชิงโครงสร้าง; จุดที่น่าสงสัยแต่ตัดสินไม่ได้ → **annotate** เป็น structured findings ส่งต่อ (ห้ามสรุปว่า "ผ่าน") |
| **L2** | frontier (T3) | แพง | **PASS/FAIL ตัวจริง** | adversarial judgment ล้วน — semantic correctness, ของที่ "ดูถูกแต่ผิด", ครอบคลุมที่ L0/L1 มองไม่เห็น; ได้ annotations ของ L1 มาช่วยเล็ง |

เหตุที่ห้าม L1 มีอำนาจ PASS: false-PASS ตอน review คือ error ที่แพงที่สุด (หลุดไป ship) และ
local model คือ class เดียวกับผู้ผลิต false-confidence artifacts (tautology test = หลักฐานสด)
— gate ที่ปฏิเสธได้อย่างเดียวจึงประหยัดโดย risk เพิ่ม**ศูนย์**: L1 บอก "ไม่เจอเหตุปฏิเสธ"
≠ "ผ่าน" แปลว่า "ส่งต่อ L2" เท่านั้น

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
