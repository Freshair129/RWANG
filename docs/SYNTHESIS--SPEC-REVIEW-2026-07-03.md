# SYNTHESIS — ผลรีวิวเทียบ SPEC 2 ฉบับ โดย 4 agents + เอกสารภายนอก 3 ฉบับ

> **วันที่:** 2026-07-03 · **ผู้สังเคราะห์:** Claude Fable 5 (session หลัก)
> **RESTORED:** ต้นฉบับ (พร้อมโฟลเดอร์ feedback/ ทั้งหมด) เคยอยู่ `D:\G-Music\docs\` แบบ untracked และถูก git-clean กวาดทิ้ง — กู้เฉพาะ synthesis ฉบับนี้กลับมา; ไฟล์ feedback รายตัว (FEEDBACK--A-opus.md 32KB, FEEDBACK--B-codex-gpt5.5.md 15KB, FEEDBACK--D-local-qwen3.md partial) สูญหาย — ประเด็นสำคัญทั้งหมดถูก distill ไว้ใน §2 แล้ว · Agent C (Gemini) ไม่เคยมีไฟล์ (CLI ตาย — ดู §6)
> **เอกสารที่ถูกรีวิว:** DOC-1 = [SPEC--AGENT-RUNTIME-GOVERNANCE.md](SPEC--AGENT-RUNTIME-GOVERNANCE.md) · DOC-2 = [SPEC--LOCAL-LLM-DISPATCH-V2.md](SPEC--LOCAL-LLM-DISPATCH-V2.md)
> **Reviewers:** A = Claude Opus (✅ เต็ม) · B = GPT-5.5 ผ่าน codex CLI (✅ เต็ม) · C = Gemini Pro (❌ ใช้ไม่ได้ — ดู §6) · D = qwen3:latest 14.8B local (⚠️ ได้หัวข้อ 1–4)
> **เอกสารภายนอกที่ผนวก:** E1 = PersistentFlow Runtime (Grok) · E2 = Stateful Runtime Design (Codex extra-high) · E3 = Actionable Spec (GPT-5.5 high)

---

## 1. คำตัดสินรวม

ทุกแหล่งที่ให้คำตัดสินได้ **เห็นตรงกันโดยไม่ได้นัดหมาย** ใน 3 ข้อใหญ่:

1. **DOC-2 (Dispatch) actionable กว่า** — หยิบไป implement ได้ทันทีเพราะโตจากการรันจริง (A: "เกือบเป็น spec ของสิ่งที่ทำแล้ว", B: "CLI, schema, exit code, acceptance ชัดกว่า")
2. **DOC-1 (Governance) เป็นฉบับเดียวที่ครอบโจทย์ 7 ข้อ** — คะแนน coverage: A ให้ 14/14 vs 7/14 · B ให้ 14/14 vs 7/14 · D ให้ 14/14 vs 2/14 (D เข้มกว่าแต่ทิศทางเดียวกัน)
3. **แยกชั้นต่อ อย่า merge** — แต่ต้องปิด seam ระหว่างชั้นก่อน implement (P0 ทั้ง 3 — **applied แล้ว**)

**ช่องโหว่อันดับ 1 ที่ reviewer จับได้ตรงกัน (A ร้ายแรงสุด, B พบอิสระ):** **holdout secrecy ไม่ถูก enforce** — DOC-1 อ้าง holdout เป็น law แต่ worker มี READ เสรี → อ่าน `tests/holdout/` เองได้ = intent ปลอมตัวเป็น law · **E3 (GPT-5.5 high) มีช่องโหว่เดียวกัน** = blind spot ร่วมของการออกแบบชั้นนี้ทั้งวงการ → **แก้แล้วเป็น structural isolation** (holdout อยู่นอก worker worktree)

---

## 2. ผลจาก reviewers — consensus และของแถมเฉพาะตัว

### 2.1 ประเด็นที่ ≥2 reviewers เห็นตรงกัน

| ประเด็น | ใครพบ | น้ำหนัก | สถานะ |
|---|---|---|---|
| holdout secrecy เป็น intent ไม่ใช่ law | A (#1), B | **P0** | ✅ แก้แล้ว (structural) |
| ไม่มี event schema กลางข้ามชั้น (`holdout_exit` ประกาศฝั่งเดียว) | A, B | **P0** | ✅ Shared Runtime Contract §7.1 |
| maxRework counter คร่อม 2 ชั้นไม่มีเจ้าของ | A, B | **P0** | ✅ rework_round/escalated_to แยก field |
| drift_check: baseline ไม่นิยาม + cache ไม่มี schema + แพง | A, B | P1 | ✅ implement แล้ว (base_ref lock + cache รวม untracked content) |
| G3 hook ยังไม่เลือก runtime | B, D | P1 | ทิศทางตัดสินแล้ว (run.js wrapper default) — implement GP4 |
| DOC-1 §10 (ตารางปรับ prompt) เป็น intent ล้วน ไม่อยู่ใน Matrix | A, B | P1 | ⏳ prompt-lint |
| FR-4 threshold ลอย (sim 0.5, <10 entries) | A, D | P2 | ⏳ calibrate หลังมีข้อมูล |
| path philosophy ขัดกัน (Rwang vs G-Music) | A, B | P1 | ✅ ปิดแล้ว: governance=Rwang, dispatch=G-Music (ต้อง commit) |
| verifier ขาด schema ของ finding + ตัวอย่าง evidence_command | A, B | P2 | ⏳ GP6 |

### 2.2 ของแถมเฉพาะตัวที่มีค่า

- **A (Opus):** วิธีอุด holdout แบบ structural (นอก worktree, gate inject) — ถูกนำไปใช้จริง · ชี้ acceptance G7 คำว่า "หรือ" ทำให้ LLM verifier กลายเป็นด่านเดียวเมื่อ holdout ล้ม — แก้แล้ว
- **B (GPT-5.5):** field list ของ Shared Runtime Contract — ถูกนำไปใช้จริง · จับความย้อนแย้ง stdlib-only ของ DOC-2 (FR-4 เรียก HTTP) → แยกประเภท guard vs retrieval-helper · เสนอ post-check output จริง (E2) · ชี้ "Opus hardening review" ไม่มี pass/fail contract
- **D (qwen3 local, partial):** จับเคส `pick_model.py` ตอน stats ว่าง (bootstrap) — เข้า spec แล้ว (§4.2 ข้อ 7) · ความน่าเชื่อถือต่ำกว่า A/B (token จีนรั่ว, อ้าง FR-10 ที่ไม่มีจริง) — ใช้เป็นสัญญาณเสริม

---

## 3. เอกสารภายนอก 3 ฉบับ — วางตำแหน่งเทียบ DOC-1/DOC-2

| มิติ | E1: PFR (Grok) | E2: Runtime Design (Codex-EH) | E3: Actionable Spec (GPT-5.5 high) | DOC-1 + DOC-2 |
|---|---|---|---|---|
| ระดับความสูง | mini-runtime สร้างใหม่จากศูนย์ | คู่มือ adopt LangGraph + Postgres/Redis | **platform spec กลาง ไม่ผูก vendor** | implementation spec ผูกเครื่อง/stack จริง |
| Actionability จริง | **ต่ำกว่าที่อ้าง** — code snippet รันไม่ได้, ไม่มี acceptance สักข้อ | ต่ำโดยเปิดเผย (design ก่อน implementation) | สูงเชิง **contract** (object model 11 ตัว, event ~20 ชนิด, test matrix T01-T12, SLO) แต่ไม่มี code โดยเจตนา | สูงเชิง **execution** — command + path + acceptance ต่อ section |
| จุดที่ขัดหลักเรา | self-reconcile เป็น **prompt-only** (= ปัญหาข้อ 6 ที่โจทย์ห้าม) · policy เป็น substring matching หลบง่าย | validator agent + consensus = **LLM-judge เป็น gate** · Postgres/Redis/LangGraph หนักเกินเครื่องเดี่ยว | spine เป็น Temporal/Step Functions — เกินจำเป็น · **มีช่องโหว่ holdout access-control เดียวกับ DOC-1** | — |
| ของที่ควรดูดมา | reconcile ตาม **interval ทุก N tool-steps** · `audit_report.md` rollup ท้าย run | ตาราง **SLO ระดับ run** · atomic versioned state · time-travel replay | **เพียบ**: lease/heartbeat, hash chain (✅ ทำแล้ว), context packet budget, approval token + expiry, ConflictRecord, claim.* events, idempotency flag, RECOVERING state | — |

**ข้อสังเกต:** E3 คือญาติใกล้สุดของ DOC-1 (logic มาจากโปรเจคของ user หลายตัว) — บทบาท = **north-star architecture ระยะยาว**; DOC-1/DOC-2 = ทางเดินจริงบนเครื่องจริงวันนี้ ไม่ใช่คู่แข่ง

**Convergence หนักแน่นสุด:** โมเดล frontier 3 ค่าย + reviewer 2 ตัว ออกแบบอิสระได้กลไกแกนเดียวกัน — append-only event log · state จาก artifact · policy-as-code · HITL ก่อน destructive · review บริบทสด · claim ผูก evidence → โครง DOC-1 ถูก validate หลายทิศ ส่วนที่**ไม่มีใครมีนอกจากเรา**: G6 meta-lint (สเปกบังคับตัวเอง), gate deterministic ล้วน, cost-tiered dispatch + escalation ladder ผูก hardware จริง

---

## 4. คะแนน coverage รวม (median ของ reviewers)

| # | ปัญหา | DOC-1 | DOC-2 |
|---|---|:---:|:---:|
| 1 | Context loss | 2 | 0–1 |
| 2 | State drift | 2 | 0–1 |
| 3 | Uncontrolled tool use | 2 | 0–1 |
| 4 | Coordination | 2 | 0–1 |
| 5 | Auditability | 2 | 2 |
| 6 | Prompt-only governance | 2 | 1 |
| 7 | Quality decay | 2* | 1 |

*มีเงื่อนไข: holdout secrecy ต้องเป็น structural — แก้แล้ว

---

## 5. รายการแก้ไข (สถานะ ณ เวลา restore)

**P0 (ทั้ง 3): ✅ applied** — holdout isolation / Shared Runtime Contract / maxRework ownership

**P1:** 4=drift_check ✅ · 5=hook decision (ทิศทางแล้ว, implement GP4 ⏳) · 6=lease/heartbeat ⏳ · 7=hash chain ✅ · 8=prompt-lint ⏳

**P2:** 9=verifier schema ⏳GP6 · 10=context packet budget ⏳ · 11=SLO ⏳ · 12=pick_model bootstrap ✅(เข้า spec) · 13=post-check output ✅(เข้า spec E2) · 14=step-interval reconcile ⏳ · 15=audit_report rollup ⏳ · 16=stdlib-only แยกประเภท ✅(เข้า spec)

---

## 6. บันทึกสภาพแวดล้อม

| เรื่อง | ข้อเท็จจริง |
|---|---|
| Gemini CLI 0.46.0 | OAuth free-tier ถูก Google ปิดถาวร (`IneligibleTierError` → Antigravity) · ไม่มี `GEMINI_API_KEY` · Ollama cloud ติด subscription → Agent C รันไม่ได้ทุกทาง |
| codex CLI 0.142.4 | `gpt-5.5-codex` ใช้กับ ChatGPT account ไม่ได้ (400) — ใช้ `-m gpt-5.5` |
| qwen3 @ 36k ctx | 15.39GB (10.68 VRAM + ~4.7 CPU spill) → generation ยาวไม่เสถียร (partial/timeout/killed ×3) — ต่อมาถูกถอดจาก pool ด้วยเหตุอิสระ (Ollama bug #14493) |
| กระบวนการรีวิว | wrapper ทุกตัวรายงาน available/verdict ตามจริง ไม่ปลอมไฟล์ = verify-claims rule ทำงานให้เห็นจริง |

---

## 7. ขั้นถัดไป (อัปเดตหลัง GP1–GP3)

1. ✅ ~~Apply P0~~ · ✅ ~~GP1 governance_lint~~ · ✅ ~~GP2 state_check/tests_hash_check~~ · ✅ ~~GP3 drift_check~~ · ✅ ~~P1-7 hash chain~~
2. ⏳ GP4: hook/wrapper wiring (blocked_patterns → argv-level matching เพื่อตัด FP)
3. ⏳ GP5: owners_check + schema ขยาย (`files[]`, `approved_by`, run_id/attempt_id ใน progress.py) + audit_query.md
4. ⏳ GP6: holdout runner + fresh verifier + decay_report
5. เก็บ E3 ไว้เป็น reference architecture — ทบทวนทุกครั้งที่จะเพิ่ม primitive ใหม่
