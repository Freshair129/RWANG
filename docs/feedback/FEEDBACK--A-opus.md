# FEEDBACK — Agent A: Claude Opus
> reviewer: claude-opus (Agent tool subagent, fresh context) · 2026-07-03T02:53:21+0700
---

รีวิวอิสระ บริบทสด — ไม่มีส่วนเขียนเอกสาร ทุก claim อ้าง section จริง วิจารณ์ตรง จุดอ่อนมีค่ากว่าคำชม

**หมายเหตุการอ้างชื่อเอกสาร:** DOC-1 = `SPEC--AGENT-RUNTIME-GOVERNANCE.md` (governance) · DOC-2 = `SPEC--LOCAL-LLM-DISPATCH-V2.md` (dispatch)

---

## 1. Actionability ต่อฉบับ — ส่วนไหนลงมือได้จริง ส่วนไหนยัง "ลอย"

### DOC-1 (Governance)

**ลงมือได้จริง (มี schema/command/acceptance ครบ):**
- **§2 Governance Matrix** — เป็นจุดแข็งที่สุดของเอกสาร แต่ละแถวมีครบ 4 ช่อง (intent / guard / audit / acceptance test) และ acceptance เป็น falsifiable จริง (เช่น "จำลอง push → ถูก block + มี event", "mark pass มือเปล่า → ถูกจับ") ตารางนี้ implement ได้ทันที
- **§6 G6 governance_lint** — มี `governance.yaml` schema ตัวอย่างจริง (§8 บรรทัด 160-166) + acceptance ที่ทดสอบได้ ("ลบ guard file → lint fail → run เริ่มไม่ได้") นี่คือส่วน actionable ที่สุดรองจาก §2
- **§7 G5 "5 คำถาม"** — ระบุ field ใหม่ชัด (`files[]`, `verify{}`, `approved_by`) + มีตัวอย่าง `jq` (บรรทัด 149) acceptance "รัน query 5 ข้อกับ run จริง" ตรวจได้
- **§3.2 restart protocol** — prompt template ตายตัวเขียนไว้เป็นบล็อกจริง (บรรทัด 76-84) + `state_check.py` มี exit-contract ชัด (บรรทัด 86)

**ยัง "ลอย":**
- **§4 `drift_check.py`** — หัวใจของ G2/G7 แต่ข้อ (ก) "ไฟล์ปรากฏใน `git diff <run-branch>`" ยังไม่นิยามว่าเทียบกับ base ไหน (branch point? main? last-commit?) และ (ข) "verify_command รันซ้ำแล้วยังผ่าน" — การรัน verify ซ้ำ **ทุก task ทุก phase boundary** คือของแพงมากบนงานยาว ตัว cache-by-diff-hash พูดถึงลอย ๆ ไม่มี schema ว่า cache อยู่ที่ไหน invalidate เมื่อไร
- **§9.1 fresh-context verifier** — บทบาทชัด แต่ "spawn ทุก N tasks (default 5)" ไม่ได้บอกว่า verifier ใช้ model tier ไหน (ต้นทุน?) และ finding→`evidence_command`→gate ยังไม่มีตัวอย่าง evidence_command จริงสักอัน (ต่างจาก DOC-2 ที่ให้ regex/command จริง)
- **§9.2 holdout** — แนวคิดดี แต่ "gate รัน case ที่โมเดลไม่เคยเห็น" ไม่ได้บอก **กลไกบังคับความลับ** ว่าอะไรกัน holdout ไม่ให้รั่วเข้า prompt (แค่บอก "อยู่ใน `tests/holdout/`") ถ้า worker agent อ่าน repo ได้ทั้งหมด มันก็เห็น holdout — ไม่มี guard ที่ enforce การแยกนี้ (ดู §3 ด้านล่าง)
- **§10 ตารางปรับ prompt** — actionable ต่ำ เป็น checklist ของ "สิ่งที่ควรแก้ใน run.js" แต่ไม่มี acceptance ว่าจะรู้ได้ยังไงว่าแก้แล้ว (เช่น "เลิกโทน CRITICAL: You MUST" — จะ lint ยังไงว่า prompt ไม่มีคำนี้?)

### DOC-2 (Dispatch)

**ลงมือได้จริง — เอกสารนี้ actionable กว่าชัดเจน** เพราะมาจาก dispatch จริง 3 ครั้ง (บรรทัด 5):
- **§3 FR-1 smoke-test** — มี command จริง (บรรทัด 97-100), เกณฑ์ S1-S5 เป็น regex/ตัวเลขจับต้องได้ (บรรทัด 107-111), `smoke_tasks.json` มี 3 task พร้อม golden answer (บรรทัด 114-116) — implement ได้ทันทีวันนี้
- **§4 FR-2 pick_model** — schema `model_stats.jsonl` จริง (บรรทัด 133-135), logic 6 ข้อเป็น deterministic เรียงลำดับชัด (บรรทัด 146-152), acceptance "รันซ้ำ input เดิม → output ตรงกัน byte-ต่อ-byte" (บรรทัด 157) เป็น spec ที่ดีมาก
- **§8 FR-6 eligibility** — checklist E1-E6 + taxonomy 5 ชนิด (บรรทัด 254-260) + acceptance ที่ให้ output JSON จริง (บรรทัด 263-265)
- **§9.2 config table** — ค่า param จริงทุกตัว (temperature 0.1, num_ctx 8192, num_predict ≥2000) พร้อมที่มา

**ยัง "ลอย" ใน DOC-2:**
- **§6 FR-4 recall_mistakes** — pipeline bge-m3 ชัด แต่ cosine threshold 0.5 (บรรทัด 206) เป็นเลขลอยไม่มีที่มา และ "ledger < 10 entries → ข้าม embedding" (บรรทัด 208) ตัดเลขมาเฉย ๆ — เอกสารเองยอมรับใน open question ว่าต้อง calibrate (บรรทัด 338)
- **§5.2 FR-3 A/B** — "โหมด json ผ่าน ≥ โหมด fence → เปิด" ไม่ได้บอกว่า "ผ่าน" วัดจาก sample กี่ครั้ง (3 task × 2 โหมด = n เล็กมาก อาจ noise)

---

## 2. Coverage ปัญหา 7 ข้อ — ตารางคะแนน (0=ไม่แตะ, 1=แตะบางส่วน, 2=มีกลไก+acceptance)

| # | ปัญหา | DOC-1 | DOC-2 | เหตุผลสั้น |
|---|---|:---:|:---:|---|
| 1 | Context loss | **2** | 0 | DOC-1 §3: External State Contract (5 ไฟล์บังคับ) + restart protocol + `state_check.py` + kill-restart acceptance ครบ · DOC-2 ไม่แตะ (งาน micro-task ไฟล์เดียวไม่มี long-horizon โดยออกแบบ) |
| 2 | State drift | **2** | 1 | DOC-1 §4: `drift_check.py` re-derive จาก git artifact + acceptance ("mark pass มือเปล่า → จับ") · DOC-2 แตะทางอ้อม: gate re-run assertion จริง (§10.1) เป็น anti-drift ระดับ task เดียว ไม่มี cross-task reconcile |
| 3 | Uncontrolled tool use | **2** | 1 | DOC-1 §5: 4 class + enforcement 3 ชั้นซ้อน (no-cred / hook / spec-halt) + acceptance ต่อ class · DOC-2 §8 E6 กันงาน security/การเงิน + §10 "ห้าม dispatch stateful" — จำกัด scope แต่ไม่มี runtime tool-gate |
| 4 | No deterministic coordination | **2** | 1 | DOC-1 §6: ownership + `owners_check.py` (fail-fast ที่ route) + waves + worktree · DOC-2 §4.1 writer เดียว `dispatch.py` + maxRework=1 กัน race บางส่วน แต่ไม่มี multi-agent ownership (dispatch เป็น single-worker per task โดยธรรมชาติ) |
| 5 | No auditability | **2** | **2** | DOC-1 §7: "5 คำถาม" map ทุกข้อกับ field + jq + acceptance · DOC-2 §4.1 `model_stats.jsonl` + §6.1 `ledger.jsonl` append-only schema จริง + acceptance ("ตรวจสอบย้อนหลังได้") — ทั้งคู่แข็ง |
| 6 | Prompt-only ไม่พอ | **2** | 1 | DOC-1 §8 G6: `governance_lint.py` เป็น meta-guard บังคับให้ทุก policy มี guard file จริง + guard_test ผ่าน — นี่คือ "runtime = law" ที่จับต้องได้ · DOC-2 §10 invariant "gate deterministic เสมอ" เป็น runtime-law แต่ครอบแค่ verify ไม่ครอบ policy อื่น |
| 7 | Long-horizon quality decay | **2** | 1 | DOC-1 §9 G7: holdout + fresh verifier + verify-claims + decay_metrics (§9.4) + acceptance "ปลูก hardcode → จับ ≥1 ชั้น" · DOC-2 §10.3 "local pass ≠ merge, hardening review ชั้นบน" + smoke regression (§3.3) จับ decay ของ *โมเดล* ไม่ใช่ของ *งานยาว* |

**สรุปคะแนน:** DOC-1 = 14/14 (แตะครบทั้ง 7, ทุกข้อมีกลไก+acceptance) · DOC-2 = 7/14

**ข้อสังเกตสำคัญ:** คะแนนไม่ควรตีความว่า DOC-1 "ดีกว่า" DOC-2 — ทั้งสองอยู่คนละชั้น (DOC-1 governance ทั้งระบบ, DOC-2 dispatch เฉพาะ T0/T1) โจทย์ 7 ข้อเป็นโจทย์ระดับ **long-horizon governance** ซึ่งเป็นสนามของ DOC-1 โดยตรง DOC-2 ตั้งใจไม่แก้ปัญหา 1/7 (long-horizon) เพราะ scope มันคือ micro-task ไฟล์เดียว (§10 invariant บรรทัด 23: "ห้าม dispatch งาน stateful/หลายไฟล์") การให้ 0 ในข้อ 1 จึงเป็น "นอก scope โดยเจตนา" ไม่ใช่ "พลาด" — แต่ตาม rubric ที่ให้คะแนน coverage ต่อเอกสาร คะแนนนี้สะท้อนว่า **ถ้าใช้ DOC-2 เดี่ยว ๆ ปัญหา 7 ข้อไม่ถูกแก้** ต้องมี DOC-1 คลุม

---

## 3. Enforceability — policy ไหนมี runtime guard จริง policy ไหนพึ่งแค่ prompt/วินัยคน

### มี runtime guard จริง (บังคับได้แม้ agent ตั้งใจโกง)
| policy | guard จริง | อ้าง |
|---|---|---|
| ห้าม external write | 3 ชั้นซ้อน: **ไม่มี credential ใน env** (ล้มระดับ OS) + hook block pattern + spec halt | DOC-1 §5 บรรทัด 119-122 — ชั้น no-credential คือ enforcement ที่แท้จริง เพราะไม่พึ่งความร่วมมือของ agent |
| verify gate | `check_evidence.py` exit non-zero (มีอยู่แล้วใน Rwang) | DOC-1 §2 + DOC-2 §10.1 — deterministic ทั้งคู่ |
| governance_lint (meta) | run เริ่มไม่ได้ถ้า guard file หาย | DOC-1 §8 บรรทัด 168 — บังคับที่ route phase ก่อน route.py |
| tests immutable | `tests_hash_check.py` SHA-256 ก่อน/หลัง | DOC-1 §2 บรรทัด 52 — จับได้แม้ agent แก้เงียบ ๆ |
| maxRework=1 | counter ใน code (ไม่ใช่ prompt) | DOC-1 §2 บรรทัด 50 · DOC-2 §10.2 |
| smoke-test onboarding | hard check ใน `pick_model.py` — โมเดลไม่ผ่าน smoke ไม่โผล่ใน pool | DOC-2 §3.4 บรรทัด 123 |
| VRAM mutex | file-lock atomic create | DOC-2 §7.1 บรรทัด 224 |
| drift detection | `drift_check.py` re-derive จาก git (code, ไม่ใช่ prompt) | DOC-1 §4 บรรทัด 102 |

### ยังพึ่งแค่ prompt / วินัยคน (จุดอ่อน enforceability)
1. **holdout secrecy (DOC-1 §9.2)** — จุดอ่อนเชิงตรรกะที่ร้ายที่สุด: กลไกกัน hardcode พึ่งสมมติฐานว่า holdout "ไม่เคยปรากฏใน prompt" แต่ **ไม่มี guard บังคับ** ว่า worker agent อ่านไฟล์ `tests/holdout/` ไม่ได้ ในสถาปัตยกรรมที่ agent มี READ เสรีทั้ง repo (§5 ตาราง READ = "อนุญาตเสรี") worker สามารถอ่าน holdout เองได้ → hardcode ให้ผ่านทั้งคู่ กลไกนี้จึงพึ่ง "วินัย/ความไม่รู้" ของ agent ไม่ใช่ law ต้องมี guard ที่ปิด path นี้ (เช่น holdout อยู่นอก worktree ของ worker, inject ตอน gate เท่านั้น)
2. **"verify claims ก่อน report" ชั้น intent (DOC-1 §2 แถว 6, §9.3)** — ชั้น law คือ `drift_check.py` แต่ drift_check จับได้เฉพาะ claim ที่ **มี artifact ให้เทียบ** (ไฟล์/verify). Claim เชิงคุณภาพ ("โค้ดนี้ maintainable", "ครอบ edge case แล้ว") ที่ไม่ผูก artifact ยังพึ่ง prompt ล้วน
3. **§10 ทั้งตาราง (DOC-1)** — การแก้โทน prompt ("Use X when…" แทน "CRITICAL"), "บอกทำไม", "เก็บกวาด scratch" — ทั้งหมดเป็น prompt-craft ไม่มี guard ไม่มี lint นี่คือชั้น intent ล้วน (ซึ่งเอกสารเองก็ยอมรับโดยจัดไว้ในหมวดปรับ prompt)
4. **DOC-2 §8 eligibility E1/E2/E3/E6** — "ตรวจโดย: spec ของ task" (บรรทัด 245-250) แปลว่าพึ่งว่า **คนเขียน spec ประกาศตรงความจริง** ว่างาน pure/ไฟล์เดียว ถ้า spec โกหกว่า pure แต่จริง ๆ มี I/O — E2 ไม่มีทางจับได้จนกว่า gate จะ fail มีแค่ E5 (นับ token) ที่ `eligibility.py` ตรวจจริง

**บรรทัดฐาน:** DOC-1 ประกาศหลักการ "Prompt = intent · Runtime = law · Audit = proof" (บรรทัด 6) ได้สวย และ §2/§8 ทำจริงเป็นส่วนใหญ่ แต่ **holdout (§9.2) เป็น policy ที่ประกาศว่าเป็น law แต่จริง ๆ ยังเป็น intent** — ขัดหลักการแม่บทของตัวเอง

---

## 4. ความซ้ำซ้อน / ขัดแย้งระหว่างสองฉบับ — จุดที่ต้อง reconcile

1. **maxRework=1 นิยามซ้ำ 2 ที่** — DOC-1 §2 (แถว maxReworkRounds, counter ใน run.js) กับ DOC-2 §10.2 (escalate โมเดลถัดใน pool → T2 → T3) ทั้งคู่อ้างเป็น invariant ของตัวเอง **ต้อง reconcile ว่าใครเป็นเจ้าของ counter** — governance คุมทั้ง run หรือ dispatch คุมภายใน T0/T1? ถ้าทั้งสองมี counter แยกกันจะนับซ้อน (rework ที่ dispatch layer นับ 1 แล้ว escalate ขึ้น T2, governance layer เห็นเป็น rework ใหม่หรือไม่?) DOC-1 §11 อ้างว่า "ไม่กำหนดวิธีเรียก local model (ของ v2)" แต่ maxRework คร่อมทั้งสองชั้น — เป็นช่องโหว่ boundary

2. **holdout / visible acceptance ซ้อนกัน** — DOC-1 §9.2 นิยาม holdout เป็นกลไก governance-wide (ทุก task 2 ชุด) และยกตัวอย่าง `metronomeTicks` ซึ่งเป็น task เดียวกับ DOC-2 §3.3/smoke_tasks และ §8.2 taxonomy pure-math **ต้องตัดสินว่า holdout เป็นความรับผิดชอบชั้นไหน** — ถ้า DOC-1 บังคับ holdout ทุก task แต่ DOC-2 dispatch ส่ง visible acceptance เข้า prompt (§9.1 "โมเดลเห็นสูตร") ใครสร้าง/ถือ holdout สำหรับงานที่ dispatch ไป local? DOC-1 §11 บอกจุดเชื่อมคือ `verify.holdout_exit` (บรรทัด 231) แต่ DOC-2 §10 verify gate **ไม่มี** field holdout_exit เลย — สองฝั่งยังไม่ sync schema

3. **ตำแหน่งไฟล์ขัดกัน (open question ที่ยังไม่ปิด)** — DOC-1 §0/§13 วาง guard scripts ที่ `G:/Rwang/orchestrator/governance/` (เอียง Rwang, reusable) · DOC-2 §2/§12 วาง dispatch scripts ที่ `D:\G-Music\orchestration\` (เอียง target ก่อน แล้ว port) **สอง philosophy คนละทาง** ในระบบเดียว — governance อยู่ orchestrator แต่ dispatch อยู่ target หมายความว่า target G-Music จะมีทั้งโฟลเดอร์ `orchestration/` (local) และถูกคุมโดย `Rwang/orchestrator/governance/` (remote) การ reconcile นี้กระทบ path ในทุก command/acceptance ที่เขียนไว้

4. **ledger / lessons ทับซ้อนเชิงหน้าที่** — DOC-1 §3.1 `runs/<id>/lessons/*.md` (1 บทเรียน/ไฟล์) + บรรทัด 71 บอก "ใช้ร่วมกับ ledger ของ dispatch v2 FR-4" · DOC-2 §6.1 `ledger.jsonl` + `LOCAL_MODEL_LEDGER.md` เป็นคนละ format (per-run markdown vs global jsonl) จุดเชื่อม DOC-1 §11 อ้าง "`lessons/` (G1→v2 FR-4 ledger)" แต่ไม่มีสเปกว่า lessons ต่อ run รวมเข้า global ledger ยังไง (append? แปลง? dedup?) — เป็นจุดเชื่อมที่ประกาศไว้แต่ยังลอย

5. **verify gate นิยาม 2 รอบ (ไม่ขัดแต่ต้องรวม)** — DOC-1 §2 แถว verify gate อ้าง `check_evidence.py` · DOC-2 §10.1 อ้าง `tsc --noEmit + vitest assertion` — เป็น gate คนละตัวสำหรับคนละชั้น ไม่ขัดกันแต่ผู้อ่านอาจสับสนว่า "the verify gate" คืออันไหน ควรระบุ: governance gate (check_evidence, generic) ⊃ dispatch gate (tsc+vitest, TS-specific)

---

## 5. Top-5 จุดอ่อน / ความเสี่ยง (มองรวมสองฉบับ เรียงตามความรุนแรง)

**#1 — holdout secrecy ไม่ถูก enforce (ร้ายแรงสุด, ตรรกะพัง)**
DOC-1 §9.2 ให้ holdout เป็นกลไกหลักกัน hardcode-to-pass (ปัญหาข้อ 7) แต่ §5 ให้ READ เสรีทั้ง repo หากไม่มี guard แยก holdout ออกจากสายตา worker กลไกทั้งอันเป็น security-by-obscurity ที่ agent ทะลุได้ทันที → ปัญหาข้อ 7 ที่อ้างว่าแก้แล้ว **จริง ๆ ยังเปิดอยู่** acceptance §9.2 ("ปลูก hardcode ผ่าน visible → holdout จับ") จะผ่านเฉพาะกรณี hardcode โง่ ๆ ที่ไม่ได้อ่าน holdout ก่อน — ไม่ครอบ adversarial worker

**#2 — ต้นทุน drift_check บนงานยาวอาจทำให้ถูกปิดใช้จริง (ร้ายแรง, operational)**
DOC-1 §4 สั่งรัน `drift_check.py` **ทุก phase boundary + ก่อน finish** ซึ่ง re-run verify_command ของทุก task ที่ pass งานยาว 50 task = อาจ re-run verify หลายร้อยครั้ง cache-by-diff-hash เป็นทางแก้ที่พูดถึงแต่ไม่ได้ spec (invalidate เมื่อไร? granularity ระดับไฟล์หรือ repo?) DOC-1 §13 เองก็ยกเป็นความเสี่ยง แต่ mitigation ยังลอย — ความเสี่ยงจริงคือทีมจะปิด drift_check เพราะช้า แล้วปัญหาข้อ 2 กลับมา

**#3 — boundary ระหว่าง 2 เอกสารยังไม่ปิด: maxRework + holdout_exit schema (ร้ายแรงปานกลาง, integration)**
ดู §4 ข้อ 1-2 ข้างบน: `verify.holdout_exit` ประกาศเป็นจุดเชื่อม (DOC-1 §11) แต่ DOC-2 §10 gate ไม่มี field นี้ และ maxRework counter คร่อม 2 ชั้นโดยไม่มีเจ้าของชัด — ถ้า implement แยกทีมจะเกิด integration bug ที่ acceptance ของแต่ละเอกสารจับไม่ได้ (เพราะแต่ละอันทดสอบแค่ชั้นตัวเอง)

**#4 — fresh verifier เป็น LLM แต่ decay/holdout พึ่งมันบางส่วน (ปานกลาง, non-determinism)**
DOC-1 §9.1 จำกัดบทบาท verifier เป็น "ชี้จุดสงสัย + แนบ evidence_command" ดีแล้ว แต่ §9.4 decay_metrics ไม่ได้พึ่ง verifier (คำนวณจาก ndjson — deterministic ดี) ทว่า acceptance G7 (บรรทัด 196) เขียน "holdout **หรือ** verifier ต้องจับ" — คำว่า "หรือ" แปลว่าถ้า holdout พลาด (ดู #1) จะเหลือแต่ verifier ที่เป็น LLM non-deterministic เป็นด่านเดียว ขัดกับ non-goal "ไม่ใช้ LLM-judge เป็น gate" (บรรทัด 36) — เส้นแบ่ง "ชี้จุด" vs "ตัดสิน" จะเบลอเมื่อ holdout ล้ม

**#5 — เลข threshold ลอยทั้งสองฉบับ (ปานกลาง, calibration)**
DOC-1 §9.4: rework>30%, drift>0, holdout-fail>10% · DOC-2 §4.2: demote<0.6@n≥5, score weight 0.1/10s, §6.2 sim≥0.5, ledger<10 ข้าม embed ทุกตัว "จากสามัญสำนึก" (ทั้งคู่ยอมรับใน open questions) ความเสี่ยง: ค่าเหล่านี้กำหนดพฤติกรรม gate/router โดยตรง ถ้าตั้งผิดช่วงแรก (ตอน n น้อย) จะ demote โมเดลดีทิ้ง หรือ trigger decay-response ผิดจังหวะ — ต้องมีแผน calibration ที่เป็นรูปธรรมกว่า "หลังใช้จริง 3-5 runs"

---

## 6. คำตัดสิน — ฉบับไหน actionable กว่า และควร merge หรือแยกชั้นต่อ

**Actionable กว่า: DOC-2 (Dispatch v2)** — เมื่อวัดที่ "หยิบไป implement พรุ่งนี้ได้เลยแค่ไหน" DOC-2 ชนะชัดเจน เพราะ (ก) มาจาก dispatch จริง 3 ครั้งพร้อมหลักฐานตัวเลข (เคส gemma `<unused30>`, cold 186s vs warm 5.6s — §3, §7) ทุก FR ผูก evidence จริง (ข) ทุกสคริปต์มี command + schema + acceptance ที่ให้ output รูปธรรม (§3.1, §4.2, §8.3) (ค) เลข config เป็นค่าจริงที่พิสูจน์แล้ว ไม่ใช่ placeholder DOC-1 แม้ §2/§6/§7 จะออกแบบดีเยี่ยม แต่ scripts หลัก (`drift_check.py`, `state_check.py`, `governance_lint.py`, holdout runner, fresh verifier) **ยังไม่มีตัวไหนเขียนจริง** — เป็น spec ของสิ่งที่จะสร้าง ขณะที่ DOC-2 หลายส่วนเกือบเป็น spec ของสิ่งที่ทำแล้ว

**แต่ "actionable กว่า" ≠ "สำคัญกว่า":** โจทย์ 7 ข้อเป็นโจทย์ระดับ governance/long-horizon ซึ่ง **มีแต่ DOC-1 ที่แก้ได้** (coverage 14 vs 7, §2 ข้างบน) DOC-2 actionable กว่าเพราะ scope แคบและโตมาจากการทำจริง — เป็นคนละคำถามกับ "แก้โจทย์ครบไหม"

**ควร merge หรือแยกชั้น: แยกชั้นต่อ — ถูกต้องแล้ว แต่ต้องปิด seam 3 จุด**
เหตุผลที่ควรแยก:
- ทั้งสองมี **lifecycle ต่างกัน** — dispatch v2 ผูกกับ hardware จริง (RTX 3060, Ollama, VRAM) เปลี่ยนบ่อยตามโมเดล/ไดรเวอร์ · governance เป็น policy ข้าม target ที่ควรนิ่ง การ merge จะมัด policy ให้เปลี่ยนทุกครั้งที่โมเดลเปลี่ยน
- **ผู้ดูแลต่างกลุ่ม** — governance = คนคุม autonomy/safety · dispatch = คนจูน local model
- สถาปัตยกรรม 4 ชั้น (DOC-1 §11) สะอาดและถูกต้องตามหลัก separation of concerns

**เงื่อนไขที่ต้องทำก่อนถือว่า "แยกชั้นได้จริง":** ปิด seam ทั้ง 3 (ดู §4/§5#3) — (1) `holdout_exit` ต้องปรากฏใน DOC-2 §10 gate schema ไม่ใช่แค่ประกาศฝั่ง DOC-1 (2) maxRework counter ต้องมีเจ้าของชั้นเดียวที่ระบุชัด (3) path philosophy (Rwang vs G-Music) ต้อง reconcile ก่อน execute ถ้าไม่ปิด seam จะได้เอกสารสวย 2 ฉบับที่ประกอบกันไม่ติดตอน implement

---

## 7. ข้อเสนอปรับปรุงคอนกรีต (ระบุ section เป้าหมาย)

**ข้อเสนอ 1 — ปิดช่องโหว่ holdout secrecy [เป้า: DOC-1 §5 ตาราง + §9.2]**
เพิ่ม action class หรือ guard: worker agent's worktree **ต้องไม่มี** `tests/holdout/` (inject โดย gate runner นอก worktree เท่านั้น) แก้ §5 ตาราง READ จาก "อนุญาตเสรี" เป็น "อนุญาตเสรี **ยกเว้น `tests/holdout/`** (path นี้ไม่อยู่ใน worker filesystem)" + เพิ่มแถวใน Governance Matrix §2: policy "holdout isolation" / guard "worktree ไม่ mount holdout dir" / acceptance "worker อ่าน holdout path → file-not-found" มิฉะนั้น G7 เป็น intent ปลอมเป็น law

**ข้อเสนอ 2 — spec cache ของ drift_check ให้จบ [เป้า: DOC-1 §4 + §13]**
เขียน schema cache จริง: key = SHA ของ `git diff <base>..<run-branch>` ต่อ task, value = last verify exit + ts · invalidate เมื่อ diff hash ของไฟล์ใน task's `files[]` เปลี่ยน · granularity ระดับ task (ไม่ใช่ทั้ง repo) และนิยาม `<base>` ให้ชัด (= merge-base กับ default branch ตอนสร้าง run branch) เพิ่ม acceptance: "task ที่ diff ไม่เปลี่ยน → drift_check ข้าม verify (ยืนยันจาก log ว่าไม่เรียก verify_command)"

**ข้อเสนอ 3 — sync schema จุดเชื่อม holdout_exit ข้ามเอกสาร [เป้า: DOC-2 §10 + §4.1]**
เพิ่ม `holdout_exit` เข้า `model_stats.jsonl` schema (§4.1) และเข้าลำดับ verify gate (§10.1) ให้ dispatch layer รายงานผล holdout กลับขึ้น governance ผ่าน field ที่ DOC-1 §7/§11 คาดหวังจริง มิฉะนั้นงานที่ dispatch ไป local จะไม่มี holdout result ให้ governance ตรวจ — จุดเชื่อมที่ DOC-1 §11 อ้าง จะขาดตรงนี้

**ข้อเสนอ 4 — ระบุเจ้าของ maxRework counter ชั้นเดียว [เป้า: DOC-1 §2 + DOC-2 §10.2 + DOC-1 §11 กติกาแบ่งเขต]**
ตัดสินให้ชัด: dispatch layer เป็นเจ้าของ rework ภายใน pool (โมเดลถัดไป) · เมื่อ escalate ขึ้น T2 = "หมด local rework" governance layer เห็นเป็น **1 escalation event** ไม่ใช่ rework ใหม่ · เพิ่มบรรทัดใน DOC-1 §11 กติกาแบ่งเขต และ event schema (§7) ต้องแยก `rework_round` (ภายในชั้น) จาก `escalated_to` (ข้ามชั้น) ให้ audit ตอบได้ว่า rework เกิดที่ชั้นไหน

**ข้อเสนอ 5 — ให้ตัวอย่าง evidence_command จริงของ fresh verifier [เป้า: DOC-1 §9.1]**
เพิ่ม ≥2 ตัวอย่างรูปธรรมแบบเดียวกับ DOC-2 ที่ให้ regex/command จริง เช่น finding "สงสัย hardcode ใน foo.ts" → `evidence_command: grep -nE 'return (42|"expected")' target/foo.ts && exit 1` · finding "สงสัย scope creep" → `evidence_command: git diff --name-only <branch> | grep -v '^src/task-scope/'` และระบุ **model tier ของ verifier** (T2? T3?) + ต้นทุนต่อ spawn เพื่อให้ §9.4 decay-response (เพิ่มความถี่ verifier) ประเมินต้นทุนได้ ตอนนี้ §9.1 บอกแค่หลักการ ไม่มี artifact ให้ implementer ลอกได้เหมือน DOC-2

---

*จบรีวิว — ประเด็นที่อยากเน้นสุด: DOC-1 ออกแบบชั้น governance ได้ครบและสวยตามหลัก "intent/law/proof" แต่จุดที่มันประกาศว่าเป็น law ที่แท้ยังเป็น intent (holdout §9.2) คือช่องโหว่ที่ต้องอุดก่อน ไม่งั้นการอ้างว่า "แก้ปัญหาข้อ 7 แล้ว" จะเกินจริง — ซึ่งย้อนแย้งกับเจตนาของเอกสารที่ตั้งใจกำจัดรายงานเกินจริงพอดี*
