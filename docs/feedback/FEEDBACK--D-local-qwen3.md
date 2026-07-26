# FEEDBACK — Agent D: qwen3:latest 14.8B (local Ollama)
> reviewer: qwen3:latest 14.8B Q4_K_M · fresh context · 2026-07-03T03:17:34+07:00 · eval_count=unknown (Ollama returned done=false, stats missing) · total_duration=~1349s (wall-clock, wrapper-measured)
> WRAPPER NOTE: output ถูกตัดกลางคัน — มีเฉพาะหัวข้อ 1-4 จากโครง 7 หัวข้อ (ไม่มีหัวข้อ 5/6/7); retry ครั้งเดียวตามกติกา (num_predict 6144) timeout ที่ 35 นาที เนื้อหาด้านล่างคือ verbatim output ของโมเดลหลัง strip <think> เท่านั้น
> SALVAGE NOTE (2026-07-03 ~04:30): พยายามให้โมเดลเขียนหัวข้อ 4-7 ต่ออีก 1 ครั้ง (num_predict 3072) — background task ถูก kill ก่อนได้ response กลับมา รวม 3 ความพยายาม (partial → timeout → killed) จึงหยุดตามหลัก maxRework-then-escalate ไฟล์นี้คงไว้เฉพาะหัวข้อ 1-4 ที่เป็นของแท้ · root cause: qwen3 14.8B @ num_ctx 36864 บน RTX 3060 12GB → KV spill ไป CPU ~4.7GB ทำให้ generation ยาวไม่เสถียร (บทเรียนเข้า DOC-2 FR-5/E5 โดยตรง)
---
## 1. Actionability ต่อฉบับ — ส่วนไหนลงมือได้จริง (มี schema/command/acceptance ครบ) ส่วนไหนยัง "ลอย" — ชี้ section

### DOC-1: SPEC--AGENT-RUNTIME-GOVERNANCE.md
- **ลงมือได้จริง**:
  - G1: `state_check.py` พร้อม acceptance test (§3.3)
  - G2: `drift_check.py` พร้อม acceptance test (§4)
  - G5: schema ขยาย `progress.py` พร้อม `audit_query.md` (§7)
  - G6: `governance_lint.py` พร้อม acceptance test (§8)
  - G7: `holdout acceptance` + `verifier subagent` พร้อม acceptance test (§9.2)
- **ยัง "ลอย"**:
  - G3: ไม่มี command/script สำหรับ "confirm ก่อน destructive action" ที่ชัดเจน (§5) — 仅提及 PreToolUse hook แต่ไม่มี implementation detail
  - G4: `owners_check.py` ไม่มี acceptance test 详细 (§6)

### DOC-2: SPEC--LOCAL-LLM-DISPATCH-V2.md
- **ลงมือได้จริง**:
  - FR-1: `smoke_test.py` + `smoke_tasks.json` พร้อม acceptance test (§3)
  - FR-2: `pick_model.py` + `model_stats.jsonl` พร้อม acceptance test (§4)
  - FR-3: `dispatch.py` + structured output พร้อม acceptance test (§5)
  - FR-5: `vram_lock.py` พร้อม acceptance test (§7)
  - FR-6: `eligibility.py` + taxonomy พร้อม acceptance test (§8)
- **ยัง "ลอย"**:
  - FR-4: `recall_mistakes.py` ไม่มี command/script 详细 (§6) — 仅提及 bge-m3 แต่ไม่มี implementation detail
  - FR-2: logic 选 model 依赖 `model_stats.jsonl` 但未明确如何处理 stats 为空的情况 (§4)

---

## 2. Coverage ปัญหา 7 ข้อ — ตารางคะแนน 0-2 ต่อข้อ ต่อเอกสาร

| # | ปัญหา | DOC-1 | DOC-2 | เหตุผล |
|---|---|---|---|---|
| **1** | Context loss | **2** (G1: state_check.py + restart protocol) | **0** (ไม่ mention) | DOC-1 แก้ด้วย external state contract แต่ DOC-2 ไม่มีกลไก |
| **2** | State drift | **2** (G2: drift_check.py) | **0** (ไม่ mention) | DOC-1 ใช้ artifact re-derive แต่ DOC-2 ไม่มี |
| **3** | Uncontrolled tool use | **2** (G3: action classification + hard gate) | **1** (FR-6: eligibility check 但对于 tool use 仅限制 micro-task) | DOC-1 严格控制 destructive tool use แต่ DOC-2 仅限制 task type |
| **4** | No deterministic coordination | **2** (G4: ownership declaration + waves) | **0** (ไม่ mention) | DOC-1 ใช้ worktree isolation แต่ DOC-2 无协调机制 |
| **5** | No auditability | **2** (G5: append-only event log + 5 questions) | **1** (FR-10: model_stats.jsonl 但未覆盖所有审计需求) | DOC-1 详细审计字段 แต่ DOC-2 仅记录 dispatch 信息 |
| **6** | Prompt-only governance | **2** (G6: governance_lint.py + guard file check) | **0** (ไม่มี meta-guard) | DOC-1 有 runtime guard 但 DOC-2 无 enforcement layer |
| **7** | Long-horizon quality decay | **2** (G7: holdout cases + verifier subagent) | **0** (ไม่ mention) | DOC-1 用 holdout と verifier 但 DOC-2 无质量衰减机制 |

---

## 3. Enforceability — policy ไหนมี runtime guard จริง policy ไหนยังพึ่งแค่ prompt/วินัยคน

### DOC-1:
- **มี runtime guard**:
  - G1: `state_check.py` (§3)
  - G2: `drift_check.py` (§4)
  - G3: PreToolUse hook + wrapper block pattern (§5)
  - G6: `governance_lint.py` (§8)
  - G7: holdout cases + verifier subagent (§9)
- **พึ่ง prompt/วินัย**:
  - G4: ownership declaration 仅依赖 prompt 但无 runtime guard (§6)

### DOC-2:
- **มี runtime guard**:
  - FR-1: `smoke_test.py` (§3)
  - FR-2: `pick_model.py` + `model_stats.jsonl` (§4)
  - FR-3: structured output + fallback chain (§5)
  - FR-5: `vram_lock.py` (§7)
  - FR-6: `eligibility.py` (§8)
- **พึ่ง prompt/วินัย**:
  - FR-4: `recall_mistakes.py` 仅依赖 bge-m3 但无 runtime guard (§6)

---

## 4. ความซ้ำซ้อน/ขัดแย้งระหว่างสองฉบับ — ชี้จุดที่ต้อง reconcile

1. **Auditability**:
   - DOC-1 ใช้ `progress.ndjson` + field ใหม่ (`files[]`, `verify`, `approved_by`) (§7)
   - DOC-2 ใช้ `model_stats.jsonl` + `ledger.jsonl` 但字段不一致 (§10)
   - **Conflict**: audit event format ไม่统一 →
