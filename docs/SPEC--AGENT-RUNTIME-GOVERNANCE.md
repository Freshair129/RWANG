# SPEC — Agent Runtime Governance (long-horizon, enforceable)

> **สถานะ:** DRAFT + P0 applied · 2026-07-03
> **RESTORED:** ต้นฉบับเคยอยู่ `D:\G-Music\docs\` แบบ untracked และถูก git-clean กวาดทิ้งโดย session อื่น — กู้กลับจาก session ที่เขียน แล้วย้ายบ้านมา `G:\Rwang\docs\` ใต้ git ของ orchestrator (policy ระดับ orchestrator ใช้ได้ทุก target — ปิด open question §13 ข้อ 1)
> **Implementation status (2026-07-03):** GP1 (matrix+lint) · GP2 (state_check/tests_hash_check/restart_prompt) · GP3 (drift_check + wiring) · P1-7 (event hash chain) **สร้างและ enforced แล้ว** — mirror ที่มีชีวิตคือ [governance.yaml](../orchestrator/governance/governance.yaml); ตาราง §2 ในไฟล์นี้คือ design-state ณ P0
> **ที่มา:** (ก) รายงาน Prompting Best Practices ของ Anthropic — Fable 5 / Mythos 5 / Opus 4.8 / Sonnet 5 (สรุปภาษาไทย, 2026-07) · (ข) ปัญหาแกน 7 ข้อของงาน agent ระยะยาว (นิยามโดยเจ้าของระบบ)
> **ชั้นของเอกสาร:** governance layer — คุม **ทุก run** ของ orchestrator (Rwang) เหนือชั้น dispatch ([SPEC--LOCAL-LLM-DISPATCH-V2.md](SPEC--LOCAL-LLM-DISPATCH-V2.md))
> **หลักการแม่บท:** **Prompt = intent · Runtime = law · Audit = proof** — policy ใดมีแค่ชั้น prompt = **ยังไม่ถือว่ามี governance** (แค่ "ตั้งใจจะทำถูก")

---

## 0. TL;DR — ปัญหา 7 ข้อ → กลไก 7 ตัว

| # | ปัญหา | กลไก | enforcement point | สถานะ |
|---|---|---|---|---|
| 1 | Context loss | **G1** External State Contract (ไฟล์บังคับ 5 ชนิด + restart protocol) | `state_check.py` + first-window protocol | ✅ GP2 |
| 2 | State drift | **G2** Reconcile-before-act | `drift_check.py` ทุก phase boundary | ✅ GP3 |
| 3 | Uncontrolled tool use | **G3** Action classification 4 ระดับ + hard gate | no-credential + hook/wrapper + `human_review` halt | บางส่วน (Rwang invariant #1; hook wiring = GP4) |
| 4 | No deterministic coordination | **G4** Ownership declaration + waves + worktree isolation | `owners_check.py` ก่อนรัน + `run.js` topological waves | บางส่วน (waves มีแล้ว; owners_check = GP5) |
| 5 | No auditability | **G5** Append-only event log ตอบ "5 คำถาม audit" ได้ | `progress.py` (writer เดียว) + schema ขยาย + hash chain | มีแล้ว + hash chain ✅ |
| 6 | Prompt-only governance ไม่พอ | **G6** Governance Matrix + `governance_lint.py` (meta-guard) | lint ก่อนเริ่มทุก run + ที่ Execute resume | ✅ GP1 หัวใจของเอกสาร |
| 7 | Quality decay | **G7** Fresh-context verifier + holdout cases + verify-claims rule | gate รัน holdout + verifier subagent | verify-claims ✅ GP3; holdout = GP6 |

ไฟล์ guard ทั้งหมดอยู่ `G:/Rwang/orchestrator/governance/` · กติกา core เดิม: **deterministic, stdlib-only, ห้ามมี LLM SDK**

---

## 1. Goals / Non-goals

### Goals
1. ทุก policy มีครบ 3 ชั้น: intent (prompt) + law (runtime guard) + proof (audit event) — ตรวจนับได้ด้วย `governance_lint.py`
2. run ที่ตายกลางทาง **resume ได้โดย agent ใหม่บริบทสด** จากไฟล์อย่างเดียว (ไม่พึ่งบทสนทนาเดิม)
3. audit ตอบ "5 คำถาม" (§7) ได้ทุก run จาก ndjson อย่างเดียว
4. รายงานความคืบหน้าที่ไม่ตรงความจริง = **ตรวจจับได้เชิงกลไก** ไม่ใช่หวังว่าโมเดลซื่อสัตย์

### Non-goals
- ❌ ไม่สร้าง framework ใหม่ — ต่อยอด Rwang (`run.js`, `progress.py`, `check_evidence.py`) + dispatch v2
- ❌ ไม่ใช้ LLM-judge เป็น gate ตัดสิน (LLM ใช้ได้แค่ "ชี้จุดสงสัย" ให้ deterministic gate ตรวจ — §9.1)
- ❌ ไม่กำหนดวิธีเลือก/เรียก local model — นั่นคือขอบเขตของ [SPEC--LOCAL-LLM-DISPATCH-V2.md](SPEC--LOCAL-LLM-DISPATCH-V2.md)

---

## 2. Governance Matrix — SSOT ของ policy (หัวใจของเอกสาร)

> **กติกาเหล็ก:** แถวใดช่อง *runtime guard* ว่าง = policy นั้น**ยังไม่มีผลบังคับ** ห้าม claim ใน report/README ว่าระบบ "มี" policy นั้น · เพิ่ม policy ใหม่ = เพิ่มแถว + เขียน guard + acceptance test **ก่อน** จึงประกาศใช้
> เก็บ machine-readable เป็น `governance.yaml` (schema §8) — ตารางนี้คือ view

| policy | prompt layer (intent) | runtime guard (law) | audit (proof) | acceptance test |
|---|---|---|---|---|
| ห้าม external write (push/PR/deploy) | system prompt ทุก agent | (1) ไม่มี credential ใน env agent (2) wrapper ปฏิเสธ `git push`/`gh pr` (3) `human_review` → runner halt | event `blocked` ใน ndjson | จำลอง push → ถูก block + มี event |
| verify gate บังคับทุก task | prompt สั่งรัน verify_command | `check_evidence.py` / gate exit non-zero = ไม่ข้าม phase (มีแล้ว) | event `verify` พร้อม exit code | ป้อน finding ปลอม → exit 1 |
| maxReworkRounds = 1 ต่อชั้น | — (ไม่ต้องมี intent — เป็น code) | counter ใน `run.js` (tier ladder) + `dispatch.py` (ภายใน local pool) — คนละ scope ไม่นับซ้อน (§11) | `rework_round` + `escalated_to` แยก field (§7.1) | task fail ซ้ำ → escalate ไม่วนรอบ 2 ในชั้นเดิม |
| ทำงานบน branch เท่านั้น | prompt | `git_guard.sh` ปฏิเสธ commit บน default branch | git log + event | commit บน main → reject |
| tests immutable หลัง approve | prompt "ห้ามลบ/แก้ tests" (จากรายงาน §agent) | `tests_hash_check.py` เทียบ SHA-256 ก่อน/หลังทุก phase | hash ใน ndjson | agent แก้ test file → phase fail |
| verify claims ก่อน report | prompt (รายงานยืนยัน: แทบกำจัดรายงานกุ) | `drift_check.py` เทียบ claim vs artifact (§4) | event `drift_detected` | mark pass มือเปล่า → ถูกจับ |
| holdout acceptance ต่อ task | — (**ต้องไม่อยู่ใน prompt** โดยนิยาม) | gate รัน case ชุดที่โมเดลไม่เคยเห็น (§9.2) | ผล holdout แยก field ใน event | hardcode ผ่าน visible → holdout จับ |
| holdout isolation (secrecy เป็น structural) | — (ไม่พึ่งวินัย agent โดยนิยาม) | `tests/holdout/` อยู่**นอก worktree ของ worker** — gate runner รันจากข้างนอกเท่านั้น (§9.2) | `verify.holdout_exit` + ไม่มี read event ของ path นี้จาก worker | worker อ่าน `tests/holdout/` → file-not-found |
| confirm ก่อน destructive action | prompt ระบุ list ชัด (จากรายงาน: Opus อาจ force-push เอง) | PreToolUse hook block pattern (§5) | event `confirm_required` | จำลอง `reset --hard` → ถูก block |

---

## 3. G1 — Context loss → External State Contract

**ที่มาจากรายงาน:** งานเกิน context window → หน้าต่างแรกวางโครงสร้าง (tests + init + progress) แล้วหน้าต่างถัดไปไล่ทำ · โมเดลรุ่นใหม่ "กู้สถานะจากไฟล์" เก่งมาก — บางกรณี **fresh window ดีกว่า compaction** · memory แบบ 1 บทเรียน/ไฟล์ + สรุป 1 บรรทัดบนสุด ช่วย Fable 5 อย่างชัดเจน

### 3.1 ไฟล์บังคับต่อ run (สร้างใน first window **ก่อน**แตะงานจริง)

| ไฟล์ | หน้าที่ | กติกาเขียน |
|---|---|---|
| `runs/<id>/goal.md` | เป้าหมาย + DoD + constraints + **ทำไม** (รายงาน: บอกเหตุผลเบื้องหลัง → ผลดีขึ้น) | เขียนครั้งเดียว; แก้ = human approve เท่านั้น |
| `runs/<id>/decisions.ndjson` | ทุกการตัดสินใจ + ทางเลือกที่ตัดทิ้ง + เหตุผล | append-only |
| `runs/<id>/tests/` | acceptance ทุก task — **visible** (แชร์ให้ worker) + **holdout** ใน `tests/holdout/` (เฉพาะ gate runner — ไม่ mount เข้า worker worktree §9.2) | SHA-lock หลัง approve (§2 แถว tests) |
| `runs/<id>/progress.{json,ndjson}` | สถานะ + audit trail | writer เดียว = `progress.py` (มีแล้ว) |
| `runs/<id>/lessons/*.md` | 1 บทเรียน/ไฟล์, สรุป 1 บรรทัดบนสุด (แบบ Fable 5 memory) — ทั้งจุดที่โดนแก้และแนวทางที่ยืนยันแล้ว | append; ใช้ร่วมกับ ledger ของ dispatch v2 FR-4 |

### 3.2 Restart protocol (ตายกลางทาง / ขึ้น window ใหม่)

Prompt template ตายตัว (เก็บใน `governance/restart_prompt.md`):
```
เริ่มจากกู้สถานะ ห้ามทำงานใด ๆ ก่อน:
1. อ่าน runs/<id>/goal.md ทั้งไฟล์
2. อ่าน progress.json + tail -30 progress.ndjson
3. รัน: git -C <target> log --oneline -20 && git -C <target> status
4. รัน: python orchestrator/governance/state_check.py runs/<id>
5. สรุป state เป็นข้อ ๆ: เสร็จแล้ว / ค้าง / ถัดไป / constraint ที่ยัง active
ห้ามเดาสิ่งที่ไฟล์ไม่ได้บอก — ไม่แน่ใจให้ระบุว่า "ไม่ทราบจากไฟล์"
```

`state_check.py` (deterministic): ไฟล์บังคับครบ 5 ชนิด + `tests/` hash ตรงกับที่ lock + progress.json parse ได้และ schema ถูก → exit 0; อย่างอื่น exit non-zero พร้อมรายการที่ขาด

### 3.3 Acceptance ของ G1
- **Kill-restart test:** ฆ่า run กลาง phase → เปิด session ใหม่บริบทสดด้วย restart protocol → agent สรุป state ตรงกับ ndjson (ตรวจโดยเทียบรายการ task status) แล้วเลือก task ถัดไปถูกตัว
- ลบ goal.md → `state_check.py` exit non-zero ก่อน agent ได้ทำงาน

---

## 4. G2 — State drift → Reconcile-before-act

**กติกา:** ก่อนเริ่มทุก phase และก่อน progress report — state ต้อง **re-derive จาก artifact** (git diff/status, ผลรัน verify จริง, progress.json) ห้ามใช้ความจำใน context เป็นแหล่งความจริง

`drift_check.py`:
- **input:** `progress.json` (สิ่งที่ระบบ*คิดว่า*จริง) + target repo path
- **ตรวจ:** ทุก task ที่ `status: pass` ต้อง (ก) ไฟล์ที่อ้างใน `files[]` มีอยู่จริงและปรากฏใน `git diff <run-branch>` (ข) `verify_command` รันซ้ำแล้วยังผ่าน (cache ด้วย hash ของ diff — ไม่รันซ้ำถ้า diff ไม่เปลี่ยน; **hash ต้องรวม content ของ untracked files ด้วย** — บทเรียนจาก adversarial review)
- **mismatch ใด ๆ →** exit non-zero + `progress.py event --status drift_detected --note "<รายละเอียด>"`
- **วิ่งเมื่อ:** ทุก phase boundary + ก่อน `finish` (บังคับใน `run.js` — เป็น code ไม่ใช่ prompt)

**Acceptance:** mark task เป็น pass มือเปล่า (ไม่มี diff) → drift_check จับ · แก้ไฟล์แล้ว verify พังทีหลัง (regression ข้าม task) → drift_check ก่อน finish จับ

---

## 5. G3 — Uncontrolled tool use → Action classification + hard gates

**ที่มาจากรายงาน:** Opus 4.6+ อาจทำสิ่งย้อนกลับยากโดยไม่ถาม (ลบไฟล์, force push) → ต้องเขียน list ชัดว่าอะไรต้อง confirm · Fable 5 อาจทำสิ่งที่ไม่ได้ขอ (ร่างอีเมล, สร้าง branch เผื่อ) → ต้องประกาศขอบเขต

| class | ตัวอย่าง | enforcement (ไม่ใช่แค่ prompt) |
|---|---|---|
| **READ** | อ่าน/ค้นไฟล์, รัน test, git log | อนุญาตเสรี **ยกเว้น `tests/holdout/`** — path นี้ไม่อยู่ใน filesystem ที่ worker เห็น (§9.2) |
| **WRITE-BRANCH** | แก้ไฟล์ใน scope task บน run branch, commit local | อนุญาต + ลง ndjson (`files[]`) |
| **DESTRUCTIVE** | ลบไฟล์นอก scope, `reset --hard`, แก้ `tests/`, force ops | **confirm ก่อนเสมอ** — PreToolUse hook / wrapper block pattern แล้ว surface ให้ human |
| **EXTERNAL** | `git push`, PR, merge, deploy, API เขียนภายนอก | **ห้ามเด็ดขาดใน autonomy** — human เท่านั้น (Rwang invariant #1) |

Enforcement 3 ชั้นซ้อน (ชั้นเดียวไม่พอ):
1. **ไม่มี credential**: agent process ไม่เห็น token ใด ๆ ที่เขียนภายนอกได้ (ล้มตั้งแต่ระดับ OS)
2. **hook/wrapper**: pattern list ใน `governance/blocked_patterns.txt` (`git push`, `gh pr create`, `rm -rf` นอก run dir, `git reset --hard`, เขียนใต้ `tests/`) — hook ปฏิเสธ + append event
3. **spec-level**: `human_review: true` → runner halt แล้ว surface (มีแล้วใน run.js)

**Acceptance:** จำลอง action ทั้ง 4 class → ผลตรงตาราง + มี event ครบทุกกรณีที่ถูก block

---

## 6. G4 — Coordination → Ownership + waves + isolation

- **1 task = 1 owner agent = declared file-set**: spec ต้องประกาศ `files:` ต่อ task → `owners_check.py` ตรวจ**ก่อนรัน**ว่า wave เดียวกันไม่มี file-set ทับกัน; ทับ → บังคับใส่ `depends_on` (เลื่อน wave) หรือแยก worktree — fail-fast ที่ route phase ไม่ใช่มารู้ตอนเขียนทับ
- **งานขนานแตะไฟล์ร่วม** → worktree isolation เท่านั้น (merge เป็นขั้น explicit มี event)
- **review เกณฑ์เดียว**: ตัดสินด้วย `verify_command` จาก spec (deterministic) — reviewer agent ห้ามตั้งเกณฑ์เอง; ความเห็นเพิ่มเติมของ reviewer = advisory ลง `decisions.ndjson` ไม่ใช่ gate

**Acceptance:** spec ที่สอง task ใน wave เดียวประกาศไฟล์ทับกัน → `owners_check.py` fail ตั้งแต่ route · task ไม่ประกาศ `files:` → ถือว่า scope ทั้ง repo → ห้ามขนานกับใคร (อยู่ wave เดี่ยว)

---

## 7. G5 — Auditability → "5 คำถาม" ที่ต้องตอบได้จาก ndjson อย่างเดียว

| # | คำถาม | field ใน event |
|---|---|---|
| 1 | ใครทำ task ไหน | `task`, `agent_role`, `model`, `tier` |
| 2 | เมื่อไหร่ | `ts` (ทุก event — มีแล้ว) |
| 3 | ใช้ข้อมูล/แตะไฟล์อะไร | `files[]` 🆕 |
| 4 | ผ่าน policy อะไร | `gate`, `approved_by` 🆕, event `blocked`/`confirm_required` |
| 5 | validate อย่างไร | `verify: {cmd, exit, holdout_exit}` 🆕 |

- ขยาย schema ของ `progress.py` (ยังเป็น **writer เดียว** — กติกาเดิมของ Rwang) — field ใหม่ 3 ตัว: `files[]`, `verify{}`, `approved_by`
- `governance/audit_query.md`: ตัวอย่าง `jq` สำเร็จรูปต่อคำถาม เช่น `jq 'select(.task=="T-3") | {ts,model,verify}' progress.ndjson`

**Acceptance:** รัน query ทั้ง 5 กับ run จริงหนึ่ง run → ได้คำตอบครบโดยไม่ต้องเปิดไฟล์อื่นหรือถามใคร

### 7.1 Shared Runtime Contract — schema กลางข้ามชั้น (P0)

field กลางที่**ทุกไฟล์ event ต้องใช้ชื่อเดียวกัน**: `progress.ndjson` (governance/orchestration) · `model_stats.jsonl` + `ledger.jsonl` (dispatch v2 §4.1/§6.1):

```json
{"run_id":"run-20260703-01","task_id":"T-3","attempt_id":1,"ts":"...","event_type":"verify",
 "agent_role":"execute","model":"qwen3:latest","tier":"T1",
 "verify":{"cmd":"...","visible_exit":0,"holdout_exit":0},
 "files":["src/x.ts"],"approved_by":null,
 "rework_round":0,"escalated_to":null}
```

- **join key ข้ามไฟล์/ข้ามชั้น = `(run_id, task_id, attempt_id)`** — audit ตาม task ได้จากทุกมุมโดยไม่ต้อง map มือ
- `rework_round` = ลองซ้ำ**ภายในชั้นเดียวกัน** · `escalated_to` = ส่งข้าม tier — สอง field แยกกันเสมอ ห้ามใช้แทนกัน (§11)
- writer ต่อไฟล์คงเดิม (`progress.py` / `dispatch.py`) แต่ต้อง validate ตรง schema กลาง — `governance_lint.py` (§8) เพิ่มเช็ค: sample event จากทุกไฟล์ parse ผ่าน schema นี้
- **การแก้ contract = แก้ DOC นี้ + SPEC--LOCAL-LLM-DISPATCH-V2 ใน commit เดียว** (กัน schema drift ระหว่างชั้น)
- **hash chain (P1-7, implemented):** ทุก event มี `prev_event_hash`/`event_hash` และ snapshot เก็บ `last_event_hash` เป็น anchor กัน truncation — ตรวจด้วย `progress.py verify-chain` · residual threat model: ผู้มีสิทธิ์เขียน runDir ที่ rewrite ทั้ง ndjson+snapshot อย่าง consistent จะตรวจไม่เจอ (keyless chain — กัน tamper บางส่วน/อุบัติเหตุ ไม่ใช่ adversary เต็มรูป; HMAC เป็น option อนาคต)

---

## 8. G6 — Prompt-only governance → `governance_lint.py` (meta-guard)

กลไกที่ทำให้**เอกสารนี้บังคับตัวเองได้** — ไม่ใช่ policy ลอย ๆ อีกชุด:

- Governance Matrix (§2) เก็บ machine-readable เป็น `governance.yaml`:
```yaml
- policy: no-external-write
  intent: "system prompt ทุก agent"
  guard: orchestrator/governance/blocked_patterns.txt   # ต้องมีไฟล์จริง
  guard_test: python orchestrator/governance/test_guards.py no-external-write  # ต้อง exit 0
  audit_event: blocked
```
- `governance_lint.py`: ทุก policy → guard file **มีอยู่จริง** + `guard_test` **รันผ่าน** → ไม่งั้น exit non-zero
- **วิ่งเมื่อ:** ก่อนเริ่มทุก run (`run.js` route phase เรียกก่อน route.py **และซ้ำที่ Execute rehydrate** — กัน resume ข้าม governance) — governance เสีย = ไม่เริ่มงาน

**Acceptance:** ลบ guard file หนึ่งตัว → lint fail → run ใหม่เริ่มไม่ได้ · เพิ่ม policy ใหม่ใน yaml โดยไม่มี guard → lint fail

---

## 9. G7 — Quality decay → verifier สด + holdout + verify-claims

**ที่มาจากรายงาน:** (ก) subagent ตรวจงานด้วย **context สดใหม่ ทำได้ดีกว่าให้โมเดลวิจารณ์ตัวเอง** (ข) โมเดลบางครั้งมุ่งทำให้ tests ผ่านจนเขียนค่าตายตัว — ต้องมี prompt กัน + กลไกจับ (ค) สั่งตรวจทุกคำกล่าวอ้างกับ tool output → แทบกำจัดรายงานกุ

### 9.1 Fresh-context verifier subagent
- spawn ทุก N tasks (default 5) หรือทุก phase boundary — **อ่านเฉพาะ artifact** (goal.md, diff, ndjson, ผล tests) ไม่เห็นบทสนทนา worker
- ตรวจ: งานยังตรง goal.md/DoD, มี shortcut/hardcode ไหม, tests ยังแท้ (hash), scope creep
- **บทบาท = ชี้จุดสงสัยให้ deterministic gate ตรวจ ไม่ใช่ตัดสินเอง** — ทุก finding ต้องแนบ `evidence_command` (รูปแบบเดียวกับ `check_evidence.py` ที่มีอยู่) → gate รันจริง
- prompt ของ verifier: สั่ง "รายงานทุกอย่างที่เจอพร้อม confidence + severity แล้วให้ชั้น gate กรอง" (จากรายงาน: อย่ากรองที่ finder — recall จะตก)

### 9.2 Holdout acceptance (กัน hardcode-to-pass)
- ทุก task มี acceptance 2 ชุด: **visible** (ใส่ใน prompt — ให้โมเดล "เห็นสูตร" ตาม dispatch v2 §9.1) + **holdout** (อยู่ใน `tests/holdout/` — gate รันแต่**ไม่เคยปรากฏใน prompt ใด**)
- holdout ต้องต่าง input จาก visible แต่ทดสอบ property เดียวกัน (เช่น visible: `metronomeTicks(120,4,2)` / holdout: `metronomeTicks(90,3,4)` + property: จำนวน ticks = `floor(duration/beat)`)
- gate ผ่าน = visible **และ** holdout ผ่านทั้งคู่ — ผลแยก field `verify.visible_exit` / `verify.holdout_exit` (§7.1)
- **secrecy เป็น structural ไม่ใช่วินัย:** holdout เก็บที่ `runs/<id>/tests/holdout/` ฝั่ง orchestrator — **ไม่อยู่ใน worktree/filesystem ที่ worker มองเห็น** (worker มี READ เสรีใน scope ของมัน แต่ path นี้ไม่มีอยู่ให้อ่าน) · gate runner เป็น process แยกที่รัน holdout จากข้างนอกตอน verify เท่านั้น → การกัน hardcode ไม่พึ่งความไม่รู้หรือความร่วมมือของ agent (Matrix §2 แถว holdout isolation)

### 9.3 Verify-claims rule
- ทุก progress report ต้องอ้าง tool output ที่รันจริงในเซสชัน — ชั้น prompt ตามรายงาน + ชั้น law คือ `drift_check.py` (§4) จับ claim ที่ไม่มี artifact รองรับ

### 9.4 Decay metrics (สัญญาณเตือนเชิงปริมาณ)
- ต่อหน้าต่าง 10 tasks: `rework_rate`, `drift_incidents`, `holdout_fail_rate` — คำนวณจาก ndjson (สคริปต์ `decay_report.py`)
- เกิน threshold (ตั้งต้น: rework > 30%, drift > 0, holdout-fail > 10%) → **หด batch ลงครึ่ง + เพิ่มความถี่ verifier เป็นทุก 2 tasks** — กติกาอยู่ใน `run.js` (code)

**Acceptance ของ G7:** ปลูก hardcode ที่ผ่าน visible case จงใจ → **holdout ต้องจับ** (verifier เป็นชั้นเสริม ไม่ใช่ด่านทดแทน — มิฉะนั้นเมื่อ holdout ล้ม จะเหลือ LLM เป็น gate ซึ่งขัด non-goal §1) · worker พยายามอ่าน `tests/holdout/` → file-not-found · verifier finding ที่ไม่มี `evidence_command` → gate ปฏิเสธ finding นั้น (ไม่นับ)

---

## 10. ปรับ prompt/config ตามรายงาน (มาตรฐานใหม่ของ agent prompts ใน runner)

| คำแนะนำจากรายงาน | การเปลี่ยนแปลงจริงในระบบเรา |
|---|---|
| เลิกโทน "CRITICAL: You MUST" (รุ่นใหม่ตอบสนอง system prompt แรง → เรียก tool ถี่เกิน) | แก้ prompt ใน `run.js` ทุกจุดเป็น "Use X when …" |
| prefill ใช้ไม่ได้แล้ว (400 ตั้งแต่ตระกูล 4.6) | เราไม่ใช้อยู่แล้ว — **ห้ามเพิ่มในอนาคต**; บังคับโครงสร้างด้วย Structured Outputs (สอดคล้อง dispatch v2 FR-3) |
| effort คือปุ่มคุมหลัก | Claude tiers: default `high`; `xhigh` เฉพาะ T3 review/RCA; `max` ต้อง human สั่ง (ผลตอบแทนไม่คุ้ม + เสี่ยงคิดวน) |
| บอก "ทำไม" ไม่ใช่แค่ "ทำอะไร" | template task prompt เพิ่มบรรทัดบังคับ `Why: <เหตุผล + ใครใช้ผลงานนี้ต่อ>` (ดึงจาก goal.md) |
| ยิ่งเซสชันยาว summary ยิ่งเต็มไปด้วยศัพท์ที่โมเดลสร้างเอง | prompt ของ ASSEMBLE/Review phase: "สรุปสุดท้าย = ประโยคเต็ม เปิดด้วยผลลัพธ์ ผู้อ่านไม่เห็นกระบวนการระหว่างทาง" |
| รุ่นใหม่รายงาน progress เองสม่ำเสมอ | ถอดคำสั่งเก่าแบบ "สรุปทุก 3 tool calls" ออก (ถ้ามี) |
| Opus over-eager subagent | เกณฑ์ใน prompt: งานระดับ 1-grep ห้ามแตก subagent; แตกเมื่อมี ≥ 2 file-set อิสระจริง |
| โมเดลชอบสร้าง temp files (ดี — แต่รก) | ท้าย run: เก็บกวาด scratch ที่ตัวเองสร้าง (ใส่ prompt ASSEMBLE) |
| โชว์ token counter → โมเดลกังวล ตัดทอนงานเอง | monitor/prompt ไม่ inject ตัวเลข context ที่เหลือให้ agent เห็น |
| code review: สั่ง "รายงานเฉพาะร้ายแรง" → recall ตก | reviewer prompt = รายงานทั้งหมด + severity/confidence → กรองที่ชั้น gate (สอดคล้อง §9.1) |
| ทดสอบด้วยงานยาก ไม่ใช่ toy (ประเมินต่ำกว่าจริง) | acceptance ของ orchestrator เอง = spec จริงย่อส่วน ไม่ใช่ตัวอย่างของเล่น |
| Fable 5 filter: cybersecurity/bio/reasoning-extraction อาจ false positive | escalation ladder เพิ่ม fallback: Fable-refused → re-dispatch ที่ Opus 4.8 อัตโนมัติ (บันทึก event `refusal_fallback`) |

---

## 11. ชั้นสถาปัตยกรรม — ความสัมพันธ์กับเอกสารอื่น

```
GOVERNANCE  (เอกสารนี้)      policy + guard + audit — คุมทุก run
    ↓ คุม
ORCHESTRATION (Rwang run.js)  waves, escalation ladder, phases, progress.py
    ↓ มอบงาน
DISPATCH (SPEC--LOCAL-LLM-DISPATCH-V2)  smoke-test, statistical router, eligibility, VRAM
    ↓ เรียก
MODELS  (local Ollama T0–T1.5 ↔ Claude T2–T3)
```

**กติกาแบ่งเขต:** เอกสารนี้ไม่กำหนดวิธีเลือกโมเดล (ของ v2) · v2 ไม่กำหนด policy ข้าม run (ของเอกสารนี้) · จุดเชื่อม: **Shared Runtime Contract §7.1** (schema เดียวทุกชั้น), `verify.holdout_exit` (G7→v2 gate), `lessons/` (G1→v2 FR-4 ledger)

**เจ้าของ rework/escalation (P0):** dispatch (v2) เป็นเจ้าของ rework **ภายใน tier pool ของตัวเอง** (`rework_round` สูงสุด 1 ต่อชั้น) — หมดโควตาแล้วส่งขึ้นชั้นถัดไปเป็น event `escalated_to` **หนึ่งครั้ง** ซึ่ง orchestration/governance ไม่นับเป็น rework ใหม่ (ladder ใน `run.js` เดินต่อจาก tier ที่ได้รับ ไม่ reset counter) → audit ตอบได้เสมอว่า retry เกิดชั้นไหน จาก field คู่ `rework_round`/`escalated_to` (§7.1)

---

## 12. Rollout (เรียงตาม dependency — G6 ต้องมาก่อนเพราะเป็น meta)

| Phase | ส่งมอบ | Definition of Done | สถานะ |
|---|---|---|---|
| **GP1** | `governance.yaml` + `governance_lint.py` + `test_guards.py` | ลบ guard 1 ตัว → lint fail → run เริ่มไม่ได้ | ✅ 2026-07-03 (ผ่าน adversarial review 7 majors) |
| **GP2** | G1: ไฟล์บังคับ + `state_check.py` + restart_prompt.md + `tests_hash_check.py` | kill-restart test ผ่าน (agent สดกู้ state ตรง 100%) | ✅ guards สร้าง+enforced; kill-restart e2e ยังไม่ได้รันกับ run จริง |
| **GP3** | G2: `drift_check.py` + wiring เข้า phase boundary ของ run.js | claim ปลอม → drift_detected event | ✅ (wiring ท้าย Execute; ผ่าน adversarial review MJ2 fix) |
| **GP4** | G3: blocked_patterns + hook + confirm list | ทุก action class ให้ผลตามตาราง §5 | patterns ✅; hook wiring ⏳ |
| **GP5** | G4 `owners_check.py` + G5 schema ขยาย + audit_query.md | 5 คำถามตอบได้จาก ndjson ของ run จริง | ⏳ |
| **GP6** | G7: holdout ใน gate + fresh verifier + decay_report.py | hardcode ปลูก → ถูกจับ ≥ 1 ชั้น | ⏳ |
| **P1-7** | event hash chain ใน `progress.py` + `verify-chain` | tamper/truncate → verify-chain exit 1; parallel wave → intact | ✅ (ผ่าน adversarial review MJ1 fix + concurrency leg) |

ทุก GP ส่งมอบจบในตัว มี acceptance ของตัวเอง — แปลงเป็น `specs/*.yaml` (ใส่ `verify_command` ต่อ GP) ตอน execute ผ่าน Rwang

---

## 13. Risks / open questions

| ความเสี่ยง | mitigation |
|---|---|
| guard เยอะ = friction ต่อ task | วัด overhead จริง (event มี ts อยู่แล้ว); guard ที่ไม่เคยจับอะไรใน 50 runs → ทบทวนใน governance.yaml |
| drift_check รัน verify ซ้ำ = แพง | cache ด้วย hash ของ repo state (รวม untracked content) — state ไม่เปลี่ยนไม่รันซ้ำ (§4) |
| fresh verifier เป็น LLM (non-deterministic) | จำกัดบทบาท: ชี้จุดสงสัย + แนบ evidence_command → gate deterministic ตัดสิน (§9.1) |
| holdout case เขียนแพง (ต้องออกแบบ 2 ชุด/task) | เริ่มจาก property-based 1 ข้อ + input ต่างชุด; ไม่ต้อง exhaustive |
| SHA-lock tests แข็งเกิน — บางครั้ง test ผิดจริง | ช่องทางเดียวที่แก้ได้: human approve + event `tests_amended` (จากรายงาน: "ถ้า tests ผิดให้แจ้ง ไม่ใช่หาทางอ้อม") |
| hash chain ไม่มี key — full-rebuild ทั้ง ndjson+snapshot ตรวจไม่เจอ | ยอมรับเป็น threat model (กัน accidental/partial tamper); HMAC + key นอก runDir เป็น upgrade path |

**คำถามเปิด:**
1. ~~guard scripts อยู่ Rwang หรือ target?~~ → **ปิดแล้ว: Rwang** (`orchestrator/governance/`) — พิสูจน์ความจำเป็นจากเหตุการณ์จริง: เอกสาร untracked บน target ถูก git-clean กวาดทิ้ง
2. PreToolUse hook ผูกกับ harness ไหน (Claude Code hooks vs wrapper script ใน run.js) — ตัดสินแล้วเชิงทิศทาง: wrapper ใน run.js เป็น mandatory default, Claude Code hook เป็น adapter เสริม — implement ตอน GP4
3. threshold ของ decay metrics (§9.4) — ค่าตั้งต้นจากสามัญสำนึก ต้อง calibrate หลังใช้จริง 3–5 runs
