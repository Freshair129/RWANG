# SYNTHESIS — ผลรีวิวเทียบ SPEC 2 ฉบับ โดย 4 agents + เอกสารภายนอก 3 ฉบับ

> **วันที่:** 2026-07-03 · **ผู้สังเคราะห์:** Claude Fable 5 (session หลัก)
> **เอกสารที่ถูกรีวิว:** DOC-1 = [SPEC--AGENT-RUNTIME-GOVERNANCE.md](../SPEC--AGENT-RUNTIME-GOVERNANCE.md) · DOC-2 = [SPEC--LOCAL-LLM-DISPATCH-V2.md](../SPEC--LOCAL-LLM-DISPATCH-V2.md)
> **Reviewers:** A = Claude Opus (✅ เต็ม) · B = GPT-5.5 ผ่าน codex CLI (✅ เต็ม) · C = Gemini Pro (❌ ใช้ไม่ได้ — ดู §6) · D = qwen3:latest 14.8B local (⚠️ ได้หัวข้อ 1–4)
> **เอกสารภายนอกที่ผนวก:** E1 = PersistentFlow Runtime (Grok) · E2 = Stateful Runtime Design (Codex extra-high) · E3 = Actionable Spec (GPT-5.5 high)

---

## 1. คำตัดสินรวม

ทุกแหล่งที่ให้คำตัดสินได้ **เห็นตรงกันโดยไม่ได้นัดหมาย** ใน 3 ข้อใหญ่:

1. **DOC-2 (Dispatch) actionable กว่า** — หยิบไป implement ได้ทันทีเพราะโตจากการรันจริง (A: "เกือบเป็น spec ของสิ่งที่ทำแล้ว", B: "CLI, schema, exit code, acceptance ชัดกว่า")
2. **DOC-1 (Governance) เป็นฉบับเดียวที่ครอบโจทย์ 7 ข้อ** — คะแนน coverage: A ให้ 14/14 vs 7/14 · B ให้ 14/14 vs 7/14 · D ให้ 14/14 vs 2/14 (D เข้มกว่าแต่ทิศทางเดียวกัน)
3. **แยกชั้นต่อ อย่า merge** — แต่ต้องปิด seam ระหว่างชั้นก่อน implement (ดู §5 ข้อ P0-2, P0-3)

**ช่องโหว่อันดับ 1 ที่ reviewer จับได้ตรงกัน (A ให้เป็นจุดอ่อนร้ายแรงสุด, B พบอิสระ):** **holdout secrecy ไม่ถูก enforce** — DOC-1 §9.2 อ้าง holdout เป็น law กัน hardcode-to-pass แต่ §5 ให้ READ เสรีทั้ง repo → worker อ่าน `tests/holdout/` เองได้ = กลไกทั้งอันเป็น intent ปลอมตัวเป็น law ขัดหลักการแม่บทของเอกสารเอง · ที่หนักกว่านั้น: **E3 (GPT-5.5 high) มีช่องโหว่เดียวกัน** (§13.2 hidden tests ไม่มี access control) แปลว่านี่เป็น blind spot ร่วมของการออกแบบชั้นนี้ทั้งวงการ ไม่ใช่แค่ของเรา — ยิ่งต้องรีบอุด

---

## 2. ผลจาก reviewers — consensus และของแถมเฉพาะตัว

### 2.1 ประเด็นที่ ≥2 reviewers เห็นตรงกัน

| ประเด็น | ใครพบ | น้ำหนัก |
|---|---|---|
| holdout secrecy เป็น intent ไม่ใช่ law | A (#1 ร้ายแรงสุด), B (§3, ข้อเสนอ 4) | **P0** |
| ไม่มี event schema กลางข้ามชั้น (`holdout_exit` ประกาศฝั่ง DOC-1 แต่ DOC-2 ไม่มี field) | A (seam 2, ข้อเสนอ 3), B (จุดอ่อน #1, ข้อเสนอ 1) | **P0** |
| maxRework counter คร่อม 2 ชั้นไม่มีเจ้าของ | A (seam 1, ข้อเสนอ 4), B (§4 gate owner) | **P0** |
| drift_check: baseline ของ `git diff` ไม่นิยาม + cache ไม่มี schema + แพงจนเสี่ยงถูกปิด | A (#2, ข้อเสนอ 2), B (จุดอ่อน #4, ข้อเสนอ 5) | P1 |
| G3 hook ยังไม่เลือก runtime = policy ความปลอดภัยหลัก enforce ไม่จบ | B (#2), D (§1 "ลอย") | P1 |
| DOC-1 §10 (ตารางปรับ prompt) ไม่มี enforcement/acceptance — เป็น intent ล้วนและไม่อยู่ใน Matrix | A (§1), B (§1, §3) | P1 |
| FR-4 recall_mistakes: threshold ลอย (sim 0.5, <10 entries) | A (§1 DOC-2, #5), D (§1) | P2 |
| path philosophy ขัดกัน (Rwang vs G-Music) | A (seam 3), B (§4) | P1 |
| fresh verifier ขาด schema ของ finding + ตัวอย่าง evidence_command + ไม่ระบุ tier/ต้นทุน | A (§1, ข้อเสนอ 5), B (#3, ข้อเสนอ 3) | P2 |

### 2.2 ของแถมเฉพาะตัวที่มีค่า

- **A (Opus):** วิธีอุด holdout ที่ concrete ที่สุด — holdout อยู่**นอก worktree ของ worker** (gate runner inject จากข้างนอกเท่านั้น) + เพิ่มแถวใน Governance Matrix พร้อม acceptance "worker อ่าน holdout → file-not-found" · ชี้ acceptance G7 ใช้คำว่า "หรือ" (holdout **หรือ** verifier จับ) ซึ่งถ้า holdout ล้ม จะเหลือ LLM verifier เป็นด่านเดียว = ขัด non-goal ของเอกสารเอง
- **B (GPT-5.5):** รายการ field ของ Shared Runtime Contract (`run_id, task_id, attempt_id, model, gate, verify{}, files[], approved_by, event_type`) · จับความย้อนแย้ง "stdlib-only" ของ DOC-2 (FR-4 เรียก Ollama HTTP) → ต้องแยกประเภท "deterministic guard" กับ "retrieval helper" · เสนอ post-check ว่า output จริงไม่มี import/I/O (ไม่ใช่เชื่อ spec ที่ประกาศ — อุดช่อง E2 ที่ A ก็พบว่า "ตรวจโดย spec" = พึ่งคนเขียน spec ซื่อสัตย์) · ชี้ "Opus hardening review" ของ DOC-2 §10 ไม่มี pass/fail contract
- **D (qwen3 local, partial):** จับเคสจริง 1 จุดที่ A/B ไม่เห็น — `pick_model.py` ไม่นิยามพฤติกรรมตอน **stats ว่างเปล่า** (bootstrap run แรก) · ความน่าเชื่อถือต่ำกว่า A/B ชัดเจน: มี token จีนรั่วปน, อ้าง "FR-10" ที่ไม่มีจริง, ให้คะแนน DOC-2 ข้อ 2 เป็น 0 ทั้งที่ gate re-run เป็น anti-drift ระดับ task (A ให้ 1) — ใช้เป็นสัญญาณเสริมทิศทาง ไม่ใช่แหล่งอ้างอิงหลัก

---

## 3. เอกสารภายนอก 3 ฉบับ — วางตำแหน่งเทียบ DOC-1/DOC-2

| มิติ | E1: PFR (Grok) | E2: Runtime Design (Codex-EH) | E3: Actionable Spec (GPT-5.5 high) | DOC-1 + DOC-2 |
|---|---|---|---|---|
| ระดับความสูง | mini-runtime สร้างใหม่จากศูนย์ | คู่มือ adopt LangGraph + Postgres/Redis | **platform spec กลาง ไม่ผูก vendor** | implementation spec ผูกเครื่อง/stack จริง |
| Actionability จริง | **ต่ำกว่าที่อ้าง** — code snippet รันไม่ได้ (import หาย, ตัวแปร global ลอย), ไม่มี acceptance สักข้อ แม้ประกาศ "actionable ทุกส่วน" | ต่ำโดยเปิดเผย (ยอมรับว่าเป็น design ก่อน implementation) | สูงเชิง **contract** (object model 11 ตัว, event ~20 ชนิด, test matrix T01-T12, SLO) แต่ไม่มี code โดยเจตนา (non-goal ข้อ 3) | สูงเชิง **execution** — command + path + acceptance ต่อ section |
| จุดที่ขัดหลักเรา | self-reconcile เป็น **prompt-only** (LLM ตอบ "มี drift ไหม" ใน JSON = ปัญหาข้อ 6 ที่โจทย์ห้ามพอดี) · policy condition เป็น substring matching (`'rm' in params`) หลบง่าย | validator agent + "consensus for critical decisions" = **LLM-judge เป็น gate** (ขัด non-goal DOC-1) · Postgres/Redis/LangGraph หนักเกินเครื่องเดี่ยว และขัดคำตัดสินเดิม "อย่าเปลี่ยน framework" | spine เป็น Temporal/Step Functions — เกินจำเป็นสำหรับ single-user RTX 3060 · **มีช่องโหว่ holdout access-control เดียวกับ DOC-1** | (ช่องโหว่ตาม §2.1 ข้างบน) |
| ของที่ควรดูดมา | reconcile ตาม **interval ทุก N tool-steps** (ของเราเป็น phase boundary อย่างเดียว) · `audit_report.md` สรุป human-readable ท้าย run | ตาราง **SLO ระดับ run** · atomic versioned state update · time-travel replay จาก event log | **เพียบ — ดู §5** (lease/heartbeat, hash chain, context packet budget, approval token + expiry, ConflictRecord, claim.* events, idempotency flag, RECOVERING state, รูปแบบ test matrix) | — |

**ข้อสังเกตสำคัญ:** E3 คือญาติใกล้สุดของ DOC-1 (ผู้ใช้ยืนยันว่า logic มาจากโปรเจคของเราหลายตัว: approval matrix ≈ Rwang invariant, claim verification ≈ drift_check, hidden tests ≈ holdout, context packet ≈ G1) — บทบาทที่เหมาะคือ **north-star architecture ระยะยาว** ส่วน DOC-1/DOC-2 คือ **ทางเดินจริงบนเครื่องจริงวันนี้** ไม่ใช่คู่แข่งกัน: ดูด contract จาก E3 เข้า DOC-1 โดยไม่รับ spine หนักของมัน

**Convergence ที่หนักแน่นที่สุด:** โมเดล frontier 3 ค่าย (Grok, GPT-5.5, Codex) + reviewer 2 ตัว ออกแบบอิสระแล้วได้กลไกแกนเดียวกันหมด — append-only event log · state ต้อง derive จาก artifact ไม่ใช่ความจำ · policy-as-code เหนือ prompt · HITL ก่อน destructive · review ด้วย context สด · claim ต้องผูก evidence — โครงของ DOC-1 จึงถูก validate จากหลายทิศ ส่วนที่**ไม่มีใครมีนอกจากเรา**: G6 meta-lint (สเปกบังคับตัวเอง), gate ที่ deterministic ล้วนไม่มี LLM-judge, cost-tiered dispatch + escalation ladder ที่ calibrate กับ hardware จริง (DOC-2)

---

## 4. คะแนน coverage รวม (median ของ reviewers ที่ให้คะแนน)

| # | ปัญหา | DOC-1 | DOC-2 | หมายเหตุ |
|---|---|:---:|:---:|---|
| 1 | Context loss | 2 | 0–1 | DOC-2 ไม่แตะโดยเจตนา (scope = micro-task) |
| 2 | State drift | 2 | 0–1 | DOC-2 มี anti-drift ระดับ task (gate re-run) เท่านั้น |
| 3 | Uncontrolled tool use | 2 | 0–1 | DOC-2 คุมแค่ eligibility ไม่มี tool gate |
| 4 | Coordination | 2 | 0–1 | DOC-2 เป็น single-worker โดยธรรมชาติ |
| 5 | Auditability | 2 | 2 | แข็งทั้งคู่ (ndjson / stats+ledger) |
| 6 | Prompt-only governance | 2 | 1 | G6 meta-lint คือกลไกที่ไม่มีในแหล่งอื่นใดทั้ง 5 |
| 7 | Quality decay | 2* | 1 | *มีเงื่อนไข: ต้องอุด holdout secrecy ก่อน (ไม่งั้นข้อ 7 "ยังเปิดอยู่" — A) |

---

## 5. รายการแก้ไขที่ต้องทำ (prioritized — ทุกข้อระบุ section เป้าหมาย)

### P0 — ปิดก่อน implement GP ใด ๆ
1. **อุด holdout secrecy** [DOC-1 §2, §5, §9.2] — holdout อยู่นอก worker worktree, gate runner inject ตอนตรวจเท่านั้น; แก้ตาราง §5 READ = "เสรี ยกเว้น `tests/holdout/` (ไม่อยู่ใน filesystem ของ worker)"; เพิ่มแถว Matrix: policy `holdout-isolation` / guard "worktree ไม่ mount holdout" / acceptance "worker อ่าน path → file-not-found" · แก้ acceptance G7 จาก "หรือ" เป็น "holdout ต้องจับ (verifier เป็นชั้นเสริม)"
2. **Shared Runtime Contract** [DOC-1 §7 ใหม่เป็น §7.1 + DOC-2 §4.1/§10] — schema กลาง: `run_id, task_id, attempt_id, model, tier, gate, verify{cmd, visible_exit, holdout_exit}, files[], approved_by, rework_round, escalated_to, event_type, ts` ใช้ร่วมทั้ง `progress.ndjson`, `model_stats.jsonl`, `ledger.jsonl` — แก้ทั้งสองเอกสารพร้อมกันใน commit เดียว
3. **เจ้าของ maxRework ชั้นเดียว** [DOC-1 §11 + DOC-2 §10.2] — dispatch เป็นเจ้าของ rework ภายใน pool; การขึ้น T2 = `escalated_to` event (governance เห็นเป็น escalation ไม่ใช่ rework ใหม่)

### P1 — ก่อน GP3/GP4
4. **drift_check ให้จบ** [DOC-1 §4] — `base_ref` = merge-base lock ตอนสร้าง run branch; cache key = diff-hash ของ `files[]` ต่อ task; acceptance เพิ่ม "diff ไม่เปลี่ยน → ไม่เรียก verify ซ้ำ (ยืนยันจาก log)"; รองรับงานที่ commit เป็นช่วง (B #4)
5. **ปิด open question hook** [DOC-1 §5, §13] — default = wrapper ใน `run.js` (mandatory), Claude Code PreToolUse hook = adapter เสริม; acceptance = block เกิดก่อน shell execute
6. **Lease/heartbeat** [DOC-1 §6 — ดูดจาก E3 §11] — task lease + timeout → mark recoverable + reassign; ครอบเคส agent ตายกลาง task ที่ `owners_check.py` (static, ก่อนรัน) ไม่ครอบ
7. **Event hash chain** [DOC-1 §7 — ดูดจาก E3 §8.2/T10] — เพิ่ม `prev_event_hash` ใน ndjson ผ่าน `progress.py` (writer เดียวอยู่แล้ว = จุด implement เดียว) → tamper-evident ราคาถูก
8. **ยกระดับ DOC-1 §10 เข้า Matrix** — ข้อที่ enforce ได้ (เช่น "ห้ามคำว่า CRITICAL/MUST ใน prompt templates") เพิ่ม guard เป็น prompt-lint; ข้อที่ enforce ไม่ได้ให้ label ชัดว่า `intent-only` จะได้ไม่ปนกับ policy จริง

### P2 — ระหว่าง GP5/GP6
9. **Verifier finding schema + ตัวอย่างจริง** [DOC-1 §9.1] — `{finding_id, severity, claim, evidence_command, expected_exit, files[]}` + ตัวอย่าง ≥2 แบบที่ A ร่าง + ระบุ tier (T2) และต้นทุนต่อ spawn
10. **Context packet discipline** [DOC-1 §3 — จาก E3 §9] — งบขนาด restart context + `packet_version` + กติกา compact ที่ต้องรักษา hard constraints
11. **SLO ระดับ run** [DOC-1 §9.4 → เพิ่ม §9.5 — จาก E2/E3] — resume success ≥99%, unauthorized tool exec = 0, destructive-without-approval = 0, claims-with-evidence = 100%, duplicate side effect = 0
12. **pick_model bootstrap** [DOC-2 §4.2 — จาก D] — นิยามพฤติกรรมตอน stats ว่าง: ทุกโมเดล = candidate, default = `qwen3:latest` จนกว่า n≥5
13. **Post-check output จริง** [DOC-2 §8/§10 — จาก B] — gate เพิ่มเช็ค generated code ไม่มี `import`/I/O จริง (regex/AST) ไม่ใช่เชื่อคำประกาศใน spec
14. **Step-interval reconcile** [DOC-1 §4 — จาก E1] — นอกจาก phase boundary เพิ่ม reconcile ทุก N tool-calls (default 25) สำหรับ phase ที่ยาว
15. **audit_report.md rollup** [DOC-1 §7 — จาก E1] — สคริปต์ generate สรุป human-readable จาก ndjson ท้ายทุก run (คู่กับ monitor)

### แก้ความย้อนแย้งเอกสาร
16. **stdlib-only ของ DOC-2 §2** — แยกประเภทไฟล์: "deterministic guard (stdlib-only เคร่งครัด)" vs "retrieval helper (HTTP ได้ ห้ามเป็น gate)" ตามที่ B ชี้

---

## 6. บันทึกสภาพแวดล้อม (ผลข้างเคียงที่มีค่าจากการรันรีวิวครั้งนี้)

| เรื่อง | ข้อเท็จจริง | ผลต่อระบบ |
|---|---|---|
| Gemini CLI 0.46.0 | OAuth free-tier ถูก Google ปิดถาวร (`IneligibleTierError` → บังคับย้าย Antigravity) · ไม่มี `GEMINI_API_KEY` บนเครื่อง · `gemini-3-flash-preview:cloud` บน Ollama ติด subscription | Agent C ไม่มีทางรันบนเครื่องนี้จนกว่า: ลง Antigravity / ตั้ง GEMINI_API_KEY / สมัคร Ollama cloud |
| codex CLI 0.142.4 | `gpt-5.5-codex` ใช้กับ ChatGPT account ไม่ได้ (400) — `gpt-5.5` ใช้ได้ | จด mapping ไว้สำหรับงานหน้า |
| qwen3 @ 36k ctx | 15.39GB (10.68 VRAM + ~4.7 CPU) → generation ยาวไม่เสถียร: 3 ครั้ง = partial/timeout/killed · token จีนรั่วเมื่อใกล้ตาย | หลักฐานสดให้ DOC-2: FR-5 (VRAM scheduler), FR-1 S5 (เก็บ latency ต่อ ctx), E5 (prompt เล็ก) — งาน long-form review 30k+ ctx **ไม่อยู่ใน stable envelope** ของเครื่องนี้ → งานแบบนี้ควร route ขึ้น T2+ หรือหด num_ctx ≤ 24576 |
| กระบวนการรีวิวเอง | wrapper ทุกตัวรายงาน available/verdict ตามจริง ไม่ปลอมไฟล์เมื่อโมเดลล้ม | คือ verify-claims rule (G7) + halt-on-exhaustion ทำงานจริงให้เห็น |

---

## 7. ขั้นถัดไปที่แนะนำ

1. Apply P0 ทั้ง 3 ข้อเข้า DOC-1/DOC-2 (แก้เอกสาร — ครึ่งวัน)
2. เริ่ม GP1 (governance.yaml + governance_lint) ตาม rollout เดิมของ DOC-1 §12 — เพราะ meta-lint คือสิ่งที่ทำให้ข้อแก้ที่เหลือถูกบังคับให้เกิดจริง
3. แปลง P1/P2 เป็น `specs/*.yaml` ให้ Rwang รันเป็น wave (ใส่ verify_command ต่อข้อ)
4. เก็บ E3 ไว้เป็น reference architecture — ทบทวนทุกครั้งที่ DOC-1 จะเพิ่ม primitive ใหม่ ว่า E3 มี contract รออยู่แล้วหรือยัง
