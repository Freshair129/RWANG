# FEEDBACK — Agent B: GPT-5.5 (Codex CLI)
> reviewer: gpt-5.5 via codex-cli 0.142.4 · fresh context · 2026-07-03 02:56:49
---
## 1. Actionability ต่อฉบับ

### DOC-1 — `SPEC--AGENT-RUNTIME-GOVERNANCE.md`

**ลงมือได้จริง**
- §2 Governance Matrix: ระบุ policy → runtime guard → audit event → acceptance test ครบในหลายแถว เช่น `no-external-write`, `verify gate`, `tests immutable`, `confirm destructive action`
- §3.1-§3.3 G1: กำหนดไฟล์บังคับต่อ run, restart protocol, `state_check.py`, และ acceptance แบบ kill-restart ชัด
- §4 G2: `drift_check.py` มี input, trigger, behavior, failure mode และ acceptance
- §5 G3: action classification 4 ระดับ พร้อม enforcement 3 ชั้น และ acceptance
- §6 G4: ownership/file-set/wave isolation มี rule ตรวจด้วย `owners_check.py`
- §8 G6: `governance.yaml`, `governance_lint.py`, `guard_test` เป็น meta-guard ที่ executable ได้จริง
- §12 Rollout: GP1-GP6 เรียง dependency และมี Definition of Done ต่อ phase

**ยังลอย / ต้องทำให้ executable เพิ่ม**
- §7 G5: ระบุ field ใหม่ `files[]`, `verify{}`, `approved_by` แต่ยังไม่มี event schema เต็ม, versioning, migration rule ของ `progress.py`
- §9.1 Fresh-context verifier: บอกให้ verifier แนบ `evidence_command` แต่ยังไม่มี schema, exit code contract, หรือวิธี gate รับ/ปฏิเสธ finding
- §9.2 Holdout acceptance: หลักการดี แต่ยังไม่ระบุ format ของ visible/holdout test files และใครมีสิทธิ์อ่าน
- §9.4 Decay metrics: มี threshold แต่สูตร `rework_rate`, `drift_incidents`, `holdout_fail_rate` ยังไม่ formal พอให้ implement ตรงกัน
- §10 Prompt/config: หลายข้อเป็น prompt convention เช่น “เลิก CRITICAL”, “ไม่ inject token counter” แต่ยังไม่อยู่ใน Governance Matrix §2 จึงยังไม่ enforce ตามกติกา §8
- §13 Open questions: PreToolUse hook ยังไม่เลือก runtime จริง ทำให้ G3 §5 ยัง implement ไม่จบทั้งระบบ

### DOC-2 — `SPEC--LOCAL-LLM-DISPATCH-V2.md`

**ลงมือได้จริง**
- §3 FR-1: `smoke_test.py`, CLI, exit code, smoke criteria S1-S5, `smoke_tasks.json`, acceptance ครบ
- §4 FR-2: `model_stats.jsonl` schema, deterministic `pick_model.py`, scoring rule, demotion/promotion, exit 2 ครบ
- §5 FR-3: structured output behavior, fallback chain, A/B condition, acceptance ระบุชัด
- §6 FR-4: `ledger.jsonl` schema, retrieval CLI, embedding/cache behavior, acceptance ครบระดับ implementation
- §7 FR-5: VRAM lock protocol, timeout, re-warm, double-acquire acceptance ชัด
- §8 FR-6: eligibility checklist E1-E6, taxonomy, CLI output, acceptance ครบ
- §10 Verify Gate: deterministic gate, maxRework=1, escalation ladder, append logs ระบุชัด

**ยังลอย / ต้อง reconcile กับ orchestration**
- §2 ระบุไฟล์อยู่ใต้ `D:\G-Music\orchestration\` แต่ DOC-1 §0/§12 วาง governance guard ไว้ `G:/Rwang/orchestrator/governance/`; boundary ของ shared scripts ยังไม่ชัด
- §10 “hardening review ชั้นบน (Opus)” เป็น requirement แต่ไม่มี CLI/gate contract ว่า review ผ่าน/ตกอย่างไร และโยงกับ DOC-1 §9.1 verifier ซ้ำกัน
- §11 บอก “แปลงเป็น spec YAML ตอนจะ execute” แต่ยังไม่มี YAML schema จริง จึงยังไม่ plug เข้า Rwang แบบ deterministic
- §6 FR-4 ใช้ Ollama embeddings ผ่าน HTTP ซึ่งขัดกับคำว่า stdlib-only แบบเคร่งครัดใน §2 แม้จะบอกว่าไม่มี SDK
- §7 FR-5 พึ่ง `ollama ps` และ eviction behavior แต่ยังไม่ระบุ parsing contract หรือ fallback ถ้า Ollama CLI output เปลี่ยน

## 2. Coverage ปัญหา 7 ข้อ

| ปัญหา | DOC-1 | เหตุผล | DOC-2 | เหตุผล |
|---|---:|---|---:|---|
| 1 Context loss | 2 | G1 §3 มี external state files, restart protocol, `state_check.py`, kill-restart acceptance | 1 | FR-4 §6 มี ledger/lessons แต่จำกัด dispatch memory ไม่ครอบ run state |
| 2 State drift | 2 | G2 §4 re-derive จาก artifact + `drift_check.py` + acceptance | 1 | Verify Gate §10 จับ output fail แต่ไม่ reconcile progress กับ repo state |
| 3 Uncontrolled tool use | 2 | G3 §5 มี class, no credential, hook/wrapper, halt, acceptance | 0 | DOC-2 จำกัด local task eligibility §8 แต่ไม่ guard tool use ทั่วไป |
| 4 No deterministic coordination | 2 | G4 §6 owners/waves/worktree isolation + `owners_check.py` | 1 | FR-6 §8 กัน local task หลายไฟล์ แต่ไม่จัด owner/wave หลาย agent |
| 5 No auditability | 2 | G5 §7 ระบุ 5 audit questions + event fields + query acceptance | 2 | §4 stats schema + §6 ledger schema + §10 append events ตรวจ dispatch ย้อนหลังได้ |
| 6 Prompt-only governance ไม่พอ | 2 | G6 §8 บังคับ guard file + guard_test ก่อน run | 1 | Verify Gate §10, smoke/router เป็น runtime guard แต่ไม่มี meta-lint ว่า policy ทุกตัวมี guard |
| 7 Long-horizon quality decay | 2 | G7 §9 มี verifier สด, holdout, verify-claims, decay metrics + acceptance | 1 | maxRework §10, smoke/stats §3-§4 ช่วยลด loop แต่ไม่ครอบ long-horizon report/shortcut นอก micro-task |

## 3. Enforceability

**มี runtime guard จริง**
- DOC-1 §3.2 `state_check.py`: บังคับไฟล์ run state ครบก่อน resume
- DOC-1 §4 `drift_check.py`: จับ pass claim ที่ไม่มี diff หรือ verify พัง
- DOC-1 §5 hook/wrapper + no credential: block destructive/external action
- DOC-1 §6 `owners_check.py`: กัน file-set overlap ก่อน route
- DOC-1 §8 `governance_lint.py`: policy ไม่มี guard หรือ guard test ไม่ผ่านแล้ว run เริ่มไม่ได้
- DOC-2 §3 `smoke_test.py`: กันโมเดลเสียเข้า pool
- DOC-2 §4 `pick_model.py`: deterministic promote/demote จาก stats
- DOC-2 §8 `eligibility.py`: กันงานไม่ใช่ pure micro-task ไป local
- DOC-2 §10 Verify Gate: `tsc` + assertion + maxRework=1

**ยังพึ่ง prompt/วินัยคน**
- DOC-1 §10 prompt tone changes เช่น “เลิก CRITICAL”, “ไม่ inject token counter”, “ห้าม prefill” ยังไม่อยู่ใน §2 matrix เป็น guard
- DOC-1 §9.1 verifier “ตรวจ shortcut/hardcode” ยังเป็น LLM finding ก่อน ถ้าไม่มี `evidence_command` schema ที่ enforce จริง
- DOC-1 §9.2 “holdout ไม่เคยปรากฏใน prompt ใด” ยังไม่มี access-control guard ระบุว่า dispatcher/prompt builder อ่าน path ไหนไม่ได้
- DOC-2 §9 prompt template “Pure function, no imports” พึ่ง prompt ส่วนหนึ่ง แม้ FR-6 §8 ตรวจก่อน route; ยังต้องมี post-check ว่า output ไม่มี import/I/O จริง
- DOC-2 §10 “hardening review ชั้นบน (Opus)” ยังเป็น policy statement ไม่มี deterministic pass/fail contract

## 4. ความซ้ำซ้อน/ขัดแย้งระหว่างสองฉบับ

- **Verify Gate ซ้ำ:** DOC-1 §2/§4/§9 พูดถึง verify, holdout, drift; DOC-2 §10 พูดถึง `tsc + vitest assertion`. ต้องกำหนดว่า gate owner คือ Rwang governance หรือ dispatch layer และ event schema เดียวกันคืออะไร
- **Ledger/lessons ซ้ำ:** DOC-1 §3.1 `runs/<id>/lessons/*.md` และ DOC-2 §6 `ledger.jsonl`/`LOCAL_MODEL_LEDGER.md` ต่างเป็น memory. DOC-1 §11 บอกจุดเชื่อม แต่ยังไม่กำหนด sync direction หรือ SSOT
- **Script location ขัดกัน:** DOC-1 §0/§13 เอียงให้ guard อยู่ `G:/Rwang/orchestrator/governance/`; DOC-2 §2/§12 เอียงให้ dispatch scripts อยู่ `D:\G-Music\orchestration\`. ต้องแยก core governance, target adapter, dispatch adapter ให้ชัด
- **Hardening verifier ซ้ำบทบาท:** DOC-1 §9.1 fresh verifier และ DOC-2 §10 Opus hardening review อาจกลายเป็น review สองชั้นที่เกณฑ์ไม่ตรงกัน
- **Stdlib-only ไม่ชัด:** DOC-1 §0 บอก guard deterministic stdlib-only; DOC-2 §2 ยกเว้น `recall_mistakes.py` ใช้ Ollama embeddings. ต้องแยก “deterministic guard” กับ “retrieval helper” ไม่ให้ปนเป็น gate
- **Holdout visibility:** DOC-1 §9.2 บอก holdout ต้องไม่อยู่ใน prompt; DOC-2 §9.1 บอก acceptance ใส่ prompt เพื่อให้เห็นสูตร. ต้องตั้งชื่อ visible acceptance vs holdout acceptance ให้ตรงกันทุก layer

## 5. Top-5 จุดอ่อน/ความเสี่ยง

1. **ยังไม่มี event schema กลางทั้งระบบ**  
   DOC-1 §7 ขยาย `progress.py`; DOC-2 §4/§6 มี `model_stats.jsonl` และ `ledger.jsonl`. ถ้าไม่มี run/task/model/gate id เดียวกัน audit จะตอบข้าม governance-dispatch ไม่ครบ

2. **G3 ยังติด open question ที่ critical ต่อ security**  
   DOC-1 §5 ต้อง block destructive/external action แต่ §13 ยังไม่เลือก hook runtime. ตราบใดที่ hook/wrapper ยังไม่ถูกกำหนดจริง policy นี้ยัง enforce ไม่สมบูรณ์

3. **Verifier/hardening ยังมี non-deterministic gap**  
   DOC-1 §9.1 จำกัด LLM verifier ให้แนบ `evidence_command` แต่ยังไม่มี schema; DOC-2 §10 ให้ Opus hardening review ก่อน merge แต่ไม่มี gate contract. เสี่ยงกลายเป็น review ตามวินัยคน

4. **State drift check อาจพลาดงานที่ commit แล้วหรือ diff baseline ไม่ชัด**  
   DOC-1 §4 ใช้ `git diff <run-branch>` เป็นหลัก แต่ถ้างานถูก commit เป็นช่วง ๆ หรือ baseline เปลี่ยน จะนิยาม “ไฟล์ปรากฏใน diff” ไม่พอ

5. **DOC-2 actionable สูงแต่ scope แคบเกินโจทย์ 7 ข้อ**  
   DOC-2 §8 จำกัด pure micro-task และ §10 gate dispatch ได้ดี แต่ไม่แก้ context loss, coordination, uncontrolled tools ในระดับ multi-agent run; ต้องพึ่ง DOC-1 เป็นชั้นบังคับจริง

## 6. คำตัดสิน

**ฉบับที่ actionable กว่าในเชิง implementation ทันทีคือ DOC-2** เพราะ FR-1 ถึง FR-6 มี CLI, schema, exit code, acceptance และ deterministic selection logic ชัดกว่า โดยเฉพาะ §3, §4, §7, §8, §10

**แต่ฉบับที่ครอบโจทย์ 7 ข้อจริงคือ DOC-1** เพราะ governance layer มี runtime guard สำหรับ context, drift, tool use, coordination, audit และ prompt-only governance ใน §3-§9

**ไม่ควร merge เป็นฉบับเดียว** ควรแยกชั้นต่อแบบ DOC-1 §11 แต่ต้องเพิ่ม contract กลาง: event schema, verify gate interface, ownership ของ scripts, และ lifecycle ของ lessons/ledger. ถ้า merge จะทำให้ dispatch detail เช่น VRAM §7 ของ DOC-2 ปนกับ policy guard เช่น G3 §5 ของ DOC-1 และทำให้ boundary ตรวจสอบยากขึ้น

## 7. ข้อเสนอปรับปรุงคอนกรีต

1. **เพิ่ม “Shared Runtime Contract” ใน DOC-1 §11 และอ้างจาก DOC-2 §2/§10**  
   ระบุ `run_id`, `task_id`, `attempt_id`, `model`, `gate`, `verify`, `files[]`, `approved_by`, `event_type` เป็น schema กลางเดียวสำหรับ `progress.ndjson`, `model_stats.jsonl`, `ledger.jsonl`

2. **ทำ DOC-1 §5/§13 ให้ปิด open question เรื่อง hook**  
   เลือกหนึ่ง enforcement path เป็น default เช่น `run.js` wrapper เป็น mandatory, Claude Code hook เป็น optional adapter; เพิ่ม acceptance ที่พิสูจน์ว่า command ถูก block ก่อน shell จริง

3. **เพิ่ม schema ของ verifier finding ใน DOC-1 §9.1 และผูกกับ DOC-2 §10**  
   ตัวอย่างขั้นต่ำ: `{finding_id, severity, claim, evidence_command, expected_exit, files[]}`; finding ที่ไม่มี schema หรือ command ไม่ผ่านไม่นับเป็น gate failure

4. **แยก visible vs holdout test contract ให้ตรงกันใน DOC-1 §9.2 และ DOC-2 §9.1/§10**  
   กำหนด path, prompt visibility, event field `verify.visible_exit` / `verify.holdout_exit`, และ guard ที่ห้าม prompt builder อ่าน `tests/holdout/`

5. **เพิ่ม baseline rule ให้ DOC-1 §4 `drift_check.py`**  
   ระบุว่า diff เทียบกับอะไร เช่น `base_ref` ที่ lock ตอนสร้าง run, หรือใช้ `git merge-base`. ต้องรองรับทั้ง uncommitted diff และ committed task changes ไม่เช่นนั้น audit หลัง commit จะ false fail ได้