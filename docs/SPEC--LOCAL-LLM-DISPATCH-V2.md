# SPEC — Local-LLM Dispatch v2 (anti-error-loop, evidence-based)

> **สถานะ:** DRAFT + P0 applied · 2026-07-03
> **UPDATE (2026-07-21):** เพิ่ม Thinking-safe structured-review profile จาก RCA ที่ยืนยันกับ Mellum/Ollama; ขอบเขตนี้เป็น contract สำหรับงาน review ที่ต้องเชื่อถือผลลัพธ์ ไม่ได้แทน fallback ของ code-generation ใน FR-3 §5.1–5.2
> **RESTORED:** ต้นฉบับเคยอยู่ `D:\G-Music\docs\` แบบ untracked และถูก git-clean กวาดทิ้ง — กู้กลับและย้ายบ้านมา `G:\Rwang\docs\` ใต้ git ของ orchestrator
> **ERRATA (2026-07-03):** หลังเขียน spec นี้ session benchmark (74 dispatch) ได้เปลี่ยน model pool ไปแล้ว — `qwen3:latest` ถูกถอด (Ollama bug #14493 qwen tool renderer), `sushirl` ขึ้น default, `Ornith-1.0-9B` เป็น agentic อันดับ 1 (ดู `D:\G-Music\docs\RCA--LOCAL-LLM-DISPATCH.md` + `LOCAL_MODEL_LEDGER.md`) — **ชื่อโมเดลใน spec นี้เป็น historical example**; ตัวกลไก FR-1/FR-2 ออกแบบมารองรับ pool ที่เปลี่ยนโดยไม่ต้องแก้ spec อยู่แล้ว
> **แทนที่:** SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP (ไฟล์เดิมสูญหาย — สเปกนี้ self-contained)
> **หลักฐานอ้างอิง:** `D:\G-Music\docs\REPORT--LOCAL-LLM-DISPATCH.md` (dispatch จริง, Wave 0–5 + benchmark v2) · `D:\G-Music\docs\LOCAL_MODEL_LEDGER.md`
> **สภาพแวดล้อม:** Ollama บน RTX 3060 12GB · orchestrator = Rwang (`G:/Rwang`) · target = G-Music
> **ชั้นเหนือ:** [SPEC--AGENT-RUNTIME-GOVERNANCE.md](SPEC--AGENT-RUNTIME-GOVERNANCE.md) — policy ข้าม run + **Shared Runtime Contract** (§7.1 ฝั่งนั้น = SSOT ของ event schema ที่ไฟล์ jsonl ทุกตัวในเอกสารนี้ต้องตาม)

---

## 0. TL;DR

Dispatch งานให้ local model (Ollama) ได้ **เฉพาะ pure micro-task ที่มี acceptance ตรวจได้อัตโนมัติ** ผ่าน Verify Gate แบบ deterministic (tsc + assertion จริง — ไม่ใช่ LLM ตัดสิน) · fail แล้ว escalate ทันที (maxRework = 1) · v2 เพิ่ม 6 ระบบ:

| FR | ระบบ | แก้ปัญหา | ROI |
|---|---|---|---|
| FR-1 | Smoke-test suite (model onboarding gate) | โมเดล GGUF เสียหลุดเข้า pool (เคส gemma) | สูงสุด — จับใน 3 นาที แทนกลาง batch |
| FR-2 | Statistical router (promote/demote) | เลือกโมเดล manual, ไม่ใช้สถิติ pass-rate | สูง — ground truth ฟรีจาก gate |
| FR-3 | Structured output | prose ปน / fence หาย / `<think>` รั่ว | กลาง — ตัด failure mode ทั้งคลาส |
| FR-4 | Ledger semantic retrieval (bge-m3) | PAST MISTAKES inject แบบ manual ไม่ scale | กลาง (ทำเมื่อ ledger > 20 รายการ) |
| FR-5 | VRAM scheduler (mutex + re-warm) | โมเดลใหญ่ชน Demucs/whisper | สูงบนเครื่องนี้ |
| FR-6 | Micro-task eligibility checklist | ขอบเขต "งานที่ให้ local ได้" ยังอยู่ในหัวคน | กลาง — ทำให้ route ได้อัตโนมัติ |

**Invariant ที่ห้ามยกให้ระบบไหนทั้งสิ้น:** Verify Gate เป็น deterministic เสมอ · local pass ≠ production-ready (ต้องผ่าน hardening ชั้นบนก่อน merge) · ห้าม retry เกิน 1 รอบ · ห้าม dispatch งาน stateful/หลายไฟล์ให้ local

---

## 1. เป้าหมาย / ไม่ใช่เป้าหมาย

### Goals
1. ให้ local model รับ micro-task ได้ **มากชนิดขึ้น** (parser, DSP helper, format util) โดยอัตราผ่าน gate ≥ 80% ต่อ batch
2. **ศูนย์เคส "โมเดลเสียหลุดเข้า pool"** — ทุกโมเดลผ่าน smoke-test ก่อนรับงานจริง
3. เลือกโมเดลจาก **สถิติจริง** (pass-rate × latency) แทนการตั้งค่า manual
4. warm-latency คงที่ ~6s/งาน ตลอด batch แม้สลับกับงาน ML หนัก (Demucs/whisper)
5. ทุก dispatch ตรวจสอบย้อนหลังได้ (ledger JSONL append-only)

### Non-goals
- ❌ ไม่ train/fine-tune โมเดลเอง — ใช้ off-the-shelf + curation เท่านั้น
- ❌ ไม่สร้าง learned difficulty predictor (แบบ RouteLLM) — route จาก *verifiability* + สถิติ pass-rate ที่ได้ฟรีจาก gate ก็เพียงพอ
- ❌ ไม่แทนที่ tier ladder ของ Rwang (`route.py`) — สเปกนี้คือรายละเอียด **ภายใน tier T0/T1** เท่านั้น; escalation ขึ้น T2 (Sonnet) / T3 (Opus) เป็นของ Rwang
- ❌ ไม่ให้ LLM เป็นผู้ตัดสิน gate (no LLM-as-judge ในชั้น verify)

---

## 2. สถาปัตยกรรม

```
                        ┌──────────────────────────────────────────┐
                        │ MODEL POOL (ผ่าน smoke-test แล้วเท่านั้น)      │
  โมเดลใหม่ ──▶ FR-1     │  <default ปัจจุบันดู LOCAL_MODEL_LEDGER.md>   │
  smoke-test ──pass──▶  │  + candidates ที่ผ่าน onboarding             │
       │                └──────────────┬───────────────────────────┘
      fail                             │ FR-2 statistical router
       ▼                               │ (pass-rate × latency จาก stats.jsonl)
   blacklist                           ▼
   (ledger)              ┌─────────────────────────┐
                         │ DISPATCHER               │
  task ──▶ FR-6 ──elig──▶│  prompt template v2 (§9) │──▶ Ollama /api/generate
  eligibility            │  + PAST MISTAKES (FR-4)  │      (FR-3 structured out)
  checklist              │  + FR-5 VRAM mutex       │
       │                 └────────────┬────────────┘
   not eligible                       ▼
       ▼                 ┌─────────────────────────┐    fail (maxRework=1)
   T2+ (Sonnet)          │ VERIFY GATE (§10)        │──────▶ escalate:
                         │  tsc + vitest assertion  │        โมเดลถัดใน pool → T2 → T3
                         └────────────┬────────────┘
                                     pass
                                      ▼
                         hardening review ชั้นบน (Opus) ──▶ merge
                                      │
                          ทุกเหตุการณ์ append ▶ ledger.jsonl + stats.jsonl
```

ไฟล์ที่สเปกนี้กำหนด (อยู่ใต้ `D:\G-Music\orchestration\` — target-specific):

| ไฟล์ | หน้าที่ | FR |
|---|---|---|
| `smoke_test.py` | onboarding gate ต่อโมเดล | FR-1 |
| `smoke_tasks.json` | ชุด micro-task มาตรฐาน 3 ตัว (คำตอบ known) | FR-1 |
| `model_stats.jsonl` | append-only: ผลทุก dispatch ต่อ (model, task_type) | FR-2 |
| `pick_model.py` | อ่าน stats → คืนโมเดลที่ควรใช้ (deterministic) | FR-2 |
| `dispatch.py` | ยิง Ollama + structured output + strip + extract | FR-3 |
| `ledger.jsonl` | machine-readable ledger (คู่กับ LOCAL_MODEL_LEDGER.md ที่เป็น human-readable) | FR-4 |
| `recall_mistakes.py` | bge-m3 retrieval → คืน PAST MISTAKES ที่ semantic ตรง task | FR-4 |
| `vram_lock.py` | mutex ระหว่าง Ollama กับงาน ML หนัก + re-warm | FR-5 |
| `eligibility.py` | checklist FR-6 → eligible / not-eligible + เหตุผล | FR-6 |

**กติกา core เดียวกับ Rwang:** สคริปต์ประเภท **guard/gate เป็น deterministic, stdlib-only, ห้ามมี LLM SDK** · `recall_mistakes.py` เป็น **retrieval helper** (เรียก Ollama embeddings ผ่าน HTTP ได้ แต่**ห้ามเป็น gate**) — การแยกสองประเภทนี้มาจาก review ของ GPT-5.5

---

## 3. FR-1 — Smoke-test suite (model onboarding gate)

**หลักฐาน:** gemma-4-12B-coder (community GGUF build เก่า) คืน `<unused30><unused14>` (eval_count = 4) — เสียเวลา 161.7s กลาง batch ทั้งที่ตรวจได้ใน 3 นาทีก่อนใช้ · บทเรียน: **การเลือกโมเดลสำคัญกว่าการจูน prompt**

### 3.1 พฤติกรรม
```bash
python orchestration/smoke_test.py <model_tag>            # รัน 3 task มาตรฐาน
python orchestration/smoke_test.py <model_tag> --json     # JSON เท่านั้น (ให้ router ใช้)
# exit 0 = ผ่านทุกข้อ → เพิ่มเข้า pool ได้
# exit 1 = fail ≥ 1 ข้อ → append blacklist ลง ledger.jsonl อัตโนมัติ พร้อมเหตุผล
```

### 3.2 เกณฑ์ตรวจ (ทุกข้อต้องผ่าน, ต่อ task ทั้ง 3)

| # | เช็ค | จับอะไร | เกณฑ์ |
|---|---|---|---|
| S1 | ไม่มี special-token รั่ว | GGUF/template เสีย (เคส gemma) | ไม่พบ `<unused\d+>`, `<\|.*?\|>`, `<pad>` ใน output |
| S2 | eval_count สมเหตุผล | โมเดลตายกลางทาง | `eval_count ≥ 30` |
| S3 | extract code ได้ | fence หาย / prose ล้วน | พบ ```` ```ts ```` block เดียว หรือ JSON field `code` (FR-3) |
| S4 | assertion ผ่าน | ความสามารถจริง | รัน acceptance ของ task → ตรงทุกค่า |
| S5 | latency บันทึก | ข้อมูลให้ FR-2 | บันทึก cold + warm (รัน task แรก 2 รอบ) — ไม่ใช่เกณฑ์ตก แต่บังคับเก็บ |

### 3.3 `smoke_tasks.json` — 3 task มาตรฐาน (คำตอบ known, คงที่ตลอดไป)
1. **pure math:** `clamp01(x: number): number` — acceptance: `clamp01(-1)->0, clamp01(0.5)->0.5, clamp01(2)->1`
2. **string/parser:** `parseTimecode(s: string): number` (`"01:02.500"` → `62.5`, invalid → `-1`)
3. **โครงสร้างข้อมูล:** `metronomeTicks(bpm, beatsPerBar, durationSec)` — reuse ตัวจริงจาก report (มี golden answer แล้ว)

> เหตุผลที่คงที่: ใช้เทียบข้ามโมเดลได้ (benchmark เดียวกัน) และ regression-test โมเดลเดิมหลังอัป Ollama/quantization ใหม่

### 3.4 Acceptance ของ FR-1
- รัน smoke กับโมเดล default ปัจจุบัน → exit 0, JSON มี latency cold+warm ครบ
- จำลองโมเดลเสีย (mock response ที่มี `<unused30>`) → exit 1 + blacklist entry ปรากฏใน `ledger.jsonl`
- โมเดลที่ไม่เคยผ่าน smoke-test **ห้าม** ปรากฏใน pool ของ `pick_model.py` (hard check ใน code)

---

## 4. FR-2 — Statistical router (promotion / demotion)

**หลักการ:** Verify Gate ให้ ground truth ฟรีทุก dispatch → ไม่ต้อง train predictor แค่**นับสถิติ**ก็เลือกโมเดลได้ (ต่างจาก learned router เชิงพาณิชย์ เช่น RouteLLM/NotDiamond ที่ต้องทำนายความยากล่วงหน้า)

### 4.1 Schema — `model_stats.jsonl` (append-only, 1 บรรทัด/dispatch)
```json
{"run_id":"run-20260703-01","task_id":"metronomeTicks","attempt_id":1,
 "ts":"2026-07-03T10:00:00+07:00","model":"qwen3:latest","tier":"T1","task_type":"pure-math",
 "gate":"pass","verify":{"visible_exit":0,"holdout_exit":0},
 "eval_count":164,"latency_s":186.5,"warm":false,"rework_round":0,"escalated_to":null}
```
- `task_type` ∈ `pure-math | parser | dsp-helper | format-util | smoke` (ตรงกับ FR-6 taxonomy)
- `gate` ∈ `pass | fail`
- writer เดียว: `dispatch.py` (ห้าม process อื่นเขียน — กติกาเดียวกับ `progress.py` ของ Rwang)
- **ชื่อ field ตาม Shared Runtime Contract** (governance spec §7.1) — join key ข้ามชั้น = `(run_id, task_id, attempt_id)` · แก้ contract = แก้สองเอกสารพร้อมกันใน commit เดียว

### 4.2 Logic เลือกโมเดล — `pick_model.py` (deterministic ล้วน)
```bash
python orchestration/pick_model.py --task-type parser
# stdout: {"model":"<best>","pass_rate":1.0,"n":7,"median_warm_latency_s":5.8,"reason":"best score, n>=5"}
```
กติกา (เรียงตามลำดับ):
1. ตัดโมเดลที่อยู่ใน blacklist (จาก `ledger.jsonl`) ออกก่อนเสมอ
2. ตัดโมเดลที่ pass-rate ต่อ `task_type` นั้น **< 0.6 และ n ≥ 5** ออก (**demote** — ยังอยู่ใน pool ของ task_type อื่น)
3. ที่เหลือ ให้คะแนน `score = pass_rate − 0.1 × (median_warm_latency_s / 10)` เลือกสูงสุด
4. โมเดลที่ `n < 5` ต่อ task_type = สถานะ **candidate**: ให้รับงานได้สูงสุด 1 งานต่อ batch (exploration แบบจำกัด) — ถ้าผ่านสะสม n จนพ้น candidate เอง (**promote**)
5. เสมอกัน → เลือกตัวที่ VRAM เล็กกว่า
6. pool ว่าง (ทุกตัวโดนตัด) → stdout `{"model":null,"reason":"no eligible local model"}` + exit 2 → dispatcher ส่งงานขึ้น T2 ทันที
7. **bootstrap (stats ว่างเปล่า / run แรก):** ทุกโมเดลที่ผ่าน smoke = candidate; default = โมเดล default ปัจจุบันใน LOCAL_MODEL_LEDGER.md จนกว่า n ≥ 5 (จาก review ของ qwen3-local)

### 4.3 Acceptance ของ FR-2
- ป้อน stats จำลอง 10 บรรทัด (โมเดล A pass 5/5, โมเดล B pass 1/5) → เลือก A และ demote B
- pool ว่าง → exit 2 + JSON `model:null`
- stats ว่างเปล่า → คืน default + ทุกตัวเป็น candidate (ข้อ 7)
- รันซ้ำ input เดิม 2 ครั้ง → output ตรงกัน byte-ต่อ-byte (deterministic — ห้ามมี random/time ใน logic)

---

## 5. FR-3 — Structured output (ตัด regex 2 ชั้นทิ้ง)

**หลักฐาน:** ตอนนี้ต้อง strip `<think>…</think>` แล้ว regex หา ```` ```ts ```` block — 2 failure mode (prose ปน, fence หาย) ที่ตัดทิ้งได้ทั้งคลาส

### 5.1 พฤติกรรม
- `dispatch.py` เรียก Ollama `/api/generate` พร้อม `"format": {...}` (JSON schema):
```json
{"type":"object","properties":{"code":{"type":"string"}},"required":["code"]}
```
- prompt template v2 (§9) สั่ง `Respond as JSON: {"code": "<full file contents>"}` แทน "Output ONLY the ```ts block"
- **Fallback chain (ต้องคงไว้):** JSON parse สำเร็จ → ใช้ `code` ตรง ๆ; parse ไม่สำเร็จ → strip `<think>` + regex fence แบบเดิม; ทั้งคู่ fail → นับเป็น gate fail ปกติ (เข้า escalation)
- `num_predict ≥ 2000` **ยังบังคับ** — thinking token กินโควตาก่อนถึง JSON

### 5.2 เงื่อนไขเปิดใช้ (per-model, พิสูจน์ก่อนบังคับ)
structured output กับ thinking model อาจลดคุณภาพ code → **ต้อง A/B ผ่าน smoke-test ก่อน**:
- รัน smoke 3 task × 2 โหมด (json / fence) ต่อโมเดล
- โหมด json ผ่าน ≥ โหมด fence → เปิด `"format"` เป็น default ของโมเดลนั้น (บันทึกใน pool config)
- ไม่งั้นใช้ fence + strip ต่อไป (ผลจริงจาก report: fence + strip ใช้ได้อยู่แล้ว — อย่าเปลี่ยนถ้าไม่ดีขึ้นจริง)

### 5.3 Acceptance ของ FR-3
- dispatch จริง 1 งานโหมด json → gate pass และไม่มีการเรียก regex fallback
- ป้อน output ปนเปื้อน (prose + JSON) → fallback chain ทำงานตามลำดับ ไม่ crash

### 5.4 Thinking-safe structured-review profile (2026-07-21)

งาน review ที่ผล `pass` ถูกใช้เป็นหลักฐาน (เช่น code/doc alignment) ใช้ contract ที่เข้มกว่า
code-generation: **ไม่มี fallback จาก schema ไป regex/fence** เพราะ output ที่ตีความคลุมเครือห้าม
ถูกยกระดับเป็นผลตรวจผ่าน

| Request / envelope field | Contract |
|---|---|
| `think` | ส่ง `false` เพื่อให้ final answer ไม่ถูกแยก/ใช้ budget กับ reasoning |
| `format` | JSON Schema แบบ strict; ระบุ `required` และ `additionalProperties:false` |
| `response` | ต้อง parse เป็น JSON และผ่าน schema เท่านั้น |
| `thinking` | เป็น diagnostic presence เท่านั้น; ห้าม parse เป็น final result |
| `done_reason` | `length` = review failure; ต้องไม่สรุป pass/fail จาก partial output |
| diagnostics | เก็บเฉพาะ metadata ที่มีขอบเขต เช่น thinking-presence, done_reason, eval_count; ไม่ persist raw prompt/code/doc โดย default |

**Exit contract:** schema-valid empty findings → `0`; schema-valid findings → `1`; final response
ว่าง, prose, schema-invalid, Thinking-only, หรือ length-truncated → `2` (`INDETERMINATE`).

**Minimum regression suite:** mocked valid empty array, valid finding, Thinking-only/empty final,
length truncation, prose, และ schema-invalid object; จากนั้นรัน warmed live smoke อย่างน้อยหนึ่งครั้ง.
Warm-up หรือ model-residency เป็น latency optimization เท่านั้น ไม่ใช่หลักฐานว่า output contract ถูกต้อง.

---

## 6. FR-4 — Ledger semantic retrieval (PAST MISTAKES อัตโนมัติ)

**หลักฐาน:** การ inject "avoid gemma-coder — ใช้โมเดล default" 1 บรรทัดใน dispatch จริงทำงานได้ดี แต่เป็น manual — พอ ledger โต การเลือกว่า mistake ไหน "เกี่ยว" กับ task ปัจจุบันจะไม่ scale

### 6.1 Schema — `ledger.jsonl` (machine-readable คู่กับ .md)
```json
{"ts":"2026-07-02T…","kind":"fail","model":"hf.co/yuxinlu1/gemma-4-12B-coder…","task_id":"metronomeTicks",
 "task_type":"pure-math","severity":"critical","lesson":"GGUF/chat-template เสีย คืน special token — อย่าใช้ build นี้",
 "blacklist":true}
```
- `LOCAL_MODEL_LEDGER.md` ยังคงอยู่เป็น human-readable summary — **generate จาก jsonl** (jsonl เป็น SSOT, .md เป็น view)

### 6.2 Retrieval — `recall_mistakes.py`
```bash
python orchestration/recall_mistakes.py --task "implement SRT cue parser, pure function" --top 3
# stdout: บรรทัด PAST MISTAKES พร้อมแทรก prompt (สูงสุด 3 บรรทัด, ≤ 60 token/บรรทัด)
```
- embed `lesson` ทุก entry ด้วย **`bge-m3`** (Ollama `/api/embeddings`) → cache vector ลง `ledger_vec.json` (re-embed เฉพาะ entry ใหม่)
- cosine similarity กับ task description → คืน top-k ที่ `sim ≥ 0.5`
- **entry ที่ `blacklist:true` ถูก inject เสมอ** โดยไม่สน similarity (กติกาความปลอดภัย)
- ledger < 10 entries → ข้าม embedding, คืนทุก entry ที่ `task_type` ตรง (ไม่คุ้มยิง embed)

### 6.3 Acceptance ของ FR-4
- query "parse subtitle timecodes" ต้องดึง lesson ของ parser task ขึ้นก่อน lesson ของ DSP task
- blacklist entry ปรากฏในผลทุก query
- รันซ้ำ query เดิม → ผลเหมือนเดิม (cache ทำงาน, ไม่ re-embed)

---

## 7. FR-5 — VRAM scheduler (mutex + re-warm) — RTX 3060 12GB

**หลักฐาน:** โมเดล ~9GB + KV cache ชน Demucs/whisper · cold ~180s vs warm ~6s (~30x) · เหตุการณ์จริงเสริม (2026-07-03): qwen3 @ num_ctx 36864 spill ไป CPU ~4.7GB → generation ยาวตายกลางทาง 3 ครั้ง — **ctx envelope ต้องถือเป็นข้อจำกัด hard ของเครื่อง (≤ ~24576 สำหรับโมเดล 14B-class)**

### 7.1 กติกา
1. **Pre-warm ก่อนทุก batch:** ยิง dummy call 1 ครั้ง (`"ok"` + `num_predict:5`) → โมเดล resident → dispatch ถัดไป ~6s/งาน
2. `keep_alive: "30m"` เป็น default ทุก dispatch call
3. **Mutex ผ่านไฟล์ lock** (`orchestration/.vram.lock` — atomic create):
   - งาน ML หนักขอ lock ก่อนเริ่ม → `vram_lock.py acquire --for demucs` สั่ง Ollama `keep_alive:0` (evict) แล้วถือ lock
   - จบงาน → `vram_lock.py release` → **auto re-warm** โมเดล default กลับทันที (ต้นทุน = 1 cold load ต่อการสลับ ไม่ใช่ต่องาน)
   - dispatcher เจอ lock ถูกถือ → **รอ** (poll ทุก 10s, timeout 15 นาที → ส่งงานขึ้น T2 แทน อย่า block batch ทั้งก้อน)
4. **โมเดล co-resident ขนาดเล็ก:** candidate ต้องผ่าน FR-1 smoke + FR-2 candidate flow ก่อน **ห้ามสละโมเดล known-good เพื่อ VRAM จนกว่าตัวเล็กจะพิสูจน์คุณภาพ**

### 7.2 Acceptance ของ FR-5
- acquire → `ollama ps` ว่าง; release → โมเดล default resident กลับ + dispatch ถัดไป < 15s
- dispatcher ระหว่าง lock ถูกถือ ไม่ crash และไม่ยิง Ollama (นับจาก log)
- double-acquire จาก process ที่สอง → exit non-zero พร้อมบอกใครถืออยู่

---

## 8. FR-6 — Micro-task eligibility (เกณฑ์รับเข้า local)

**หลักฐาน:** งานที่ผ่าน gate = pure function ไฟล์เดียว ไม่มี import + acceptance เป็นเลขคำนวณได้ · งาน stateful/integration ทั้งหมดไป Sonnet · ตรงกับ HARD RULE ของ `route.py` (ไม่มี verify_command → floor T2)

### 8.1 Checklist (ต้องผ่าน **ทุกข้อ** ถึง eligible — ข้อเดียวตก → T2+)

| # | เกณฑ์ | ตรวจโดย |
|---|---|---|
| E1 | function เดียว, signature ระบุเป๊ะได้ 1 บรรทัด | spec ของ task |
| E2 | pure: ไม่มี I/O, ไม่มี state, ไม่มี import | spec ของ task **+ post-check output จริง (regex/AST) หลัง generate** (จาก review ของ GPT-5.5 — อย่าเชื่อคำประกาศใน spec) |
| E3 | ไฟล์เดียว, ไม่แตะไฟล์อื่น | spec ของ task |
| E4 | acceptance เป็น **input→expected ที่คำนวณตรวจได้** ≥ 2 case (รวม edge/invalid) | มีอยู่จริงใน spec |
| E5 | prompt ทั้งก้อน (template + context + acceptance) **< ~500 token** | `eligibility.py` นับจริง |
| E6 | ไม่อยู่ในหมวดต้องห้าม: security-sensitive, การเงิน/การคิดเงิน, external API contract | spec ของ task |

### 8.2 Taxonomy ชนิดงานที่อนุมัติ (ขยายจาก 2 → 5 ชนิด)

| task_type | ตัวอย่าง | สถานะ |
|---|---|---|
| `pure-math` | metronomeTicks, clamp, quantize | ✅ พิสูจน์แล้ว |
| `format-util` | estimateSpeechDurationSec, formatTimecode | ✅ พิสูจน์แล้ว |
| `parser` | SRT/VTT cue parser (string → struct, pure) | 🆕 อนุมัติ (เข้า E1–E6 ได้) |
| `dsp-helper` | window function, dB↔linear, crossfade curve | 🆕 อนุมัติ |
| `validation` | เช็ค invariant ของ struct (pure predicate) | 🆕 อนุมัติ |

### 8.3 Acceptance ของ FR-6
- `python orchestration/eligibility.py --spec <task.json>` → `{"eligible":true/false,"failed":["E4"],"task_type":"parser"}`
- ป้อน task หลายไฟล์ → `eligible:false, failed:["E3"]`
- ป้อน task ไม่มี acceptance → `eligible:false, failed:["E4"]` (สอดคล้อง HARD RULE ของ Rwang)

---

## 9. Dispatch protocol — prompt template v2 + config

### 9.1 Prompt template v2 (ต่อยอด template ที่ผ่านจริงใน report §4)
```
You are a focused code generator. ONE task. Pure function, no imports.
{FR-3: Respond as JSON: {"code":"<full file contents>"} | Output ONLY one ```ts block. No prose.}

Implement EXACTLY in <path>:
export function <signature — 1 บรรทัดเป๊ะ>

Rules:
- <rule 1..n สั้นเป็น bullet ≤ 6 บรรทัด รวม guard invalid input>

Acceptance: <call> -> <expected>. <call2> -> <expected2>.   ← ต้องเป็นเลขคำนวณได้ (E4)
{PAST MISTAKES: <จาก recall_mistakes.py — สูงสุด 3 บรรทัด>}
```
กติกาที่พิสูจน์แล้ว (คงเดิม): plain instruction — **ไม่ใช้** section-header วงเล็บ `[ROLE]…[SCAFFOLD]` · one-action เท่านั้น · acceptance ยิ่งเป็นเลขที่โมเดล "เห็นสูตร" ยิ่งแม่น (เคส `10/14=0.714+0.30`) · **Acceptance ใน prompt = ชุด visible เท่านั้น** — holdout ห้ามปรากฏใน prompt ใด และไม่อยู่ใน worktree ของ worker (governance spec §9.2)

### 9.2 Config ต่อ dispatch (ค่า default — override ได้ต่อโมเดลจาก smoke result)

| พารามิเตอร์ | ค่า | ที่มา |
|---|---|---|
| model | จาก `pick_model.py` | FR-2 |
| `temperature` | 0.1 | code deterministic (พิสูจน์แล้ว) |
| `num_ctx` | 8192 | micro-task + grounded context พอ (**ห้ามเกิน stable envelope ของเครื่อง**) |
| `num_predict` | ≥ 2000 | เผื่อ `<think>` ของ thinking model |
| `keep_alive` | `"30m"` | FR-5 |
| `format` | JSON schema เฉพาะโมเดลที่ A/B ผ่าน | FR-3 §5.2 |
| `think` | `false` สำหรับ structured-review profile | FR-3 §5.4 |
| strip | `re.sub(r"<think>.*?</think>","",out,flags=S)` | fallback chain |
| extract | `re.search(r"```(?:ts\|typescript)?\s*(.*?)```", out, S)` | fallback chain |

---

## 10. Verify Gate + escalation (invariant — ไม่เปลี่ยนจากที่พิสูจน์แล้ว)

1. **Gate = deterministic เท่านั้น:** `tsc --noEmit` ผ่าน + vitest/node assertion บน **visible acceptance ทุก case และ holdout ชุดที่สอง** — holdout รันโดย gate runner จาก `runs/<id>/tests/holdout/` ซึ่ง**อยู่นอก worktree/prompt ของ worker** (governance spec §9.2) · รายงานแยก `verify.visible_exit` / `verify.holdout_exit` · empty/garbage/special-token = fail เสมอ
2. **maxReworkRounds = 1 — dispatch เป็นเจ้าของเฉพาะภายใน pool ตัวเอง:** fail รอบแรก → ลองโมเดลถัดไปใน pool (จาก FR-2) ได้ 1 ครั้ง (`rework_round`) · หมดแล้ว → ส่ง event `escalated_to: "T2"` ให้ runner ชั้น orchestration พาขึ้น ladder ต่อ (T2 Sonnet → T3 Opus) โดย governance **ไม่นับ**การ escalate เป็น rework ใหม่ (governance spec §11) · **ห้ามวน rework กับโมเดลเดิมเกิน 1 รอบ** (ต่างจาก reflection loop ของ framework ทั่วไปที่วนจน cost ระเบิด)
3. **Local pass ≠ merge:** ทุกชิ้นที่ผ่าน gate ต้องผ่าน hardening review ชั้นบน (Opus) ก่อน merge — หลักฐาน: float-drift ใน metronomeTicks ที่ gate จับไม่ได้แต่ review จับได้
4. ทุกเหตุการณ์ (dispatch/pass/fail/escalate) append ลง `model_stats.jsonl` + ถ้ามี lesson → `ledger.jsonl`

---

## 11. แผนทำงาน (เรียงตาม ROI — แต่ละ phase ส่งมอบจบในตัว)

| Phase | ทำอะไร | Definition of Done |
|---|---|---|
| **P1** | FR-1 smoke_test.py + smoke_tasks.json · รันกับ pool ปัจจุบัน | ทุกโมเดลใน pool มีผล pass/fail + latency baseline ชัด |
| **P2** | FR-5 vram_lock.py + pre-warm เข้า batch flow | สลับ Demucs → dispatch ได้โดย warm-latency กลับมา < 15s |
| **P3** | FR-2 model_stats.jsonl + pick_model.py + FR-6 eligibility.py | dispatcher เลือกโมเดล+คัดงานอัตโนมัติ ไม่มี hardcode |
| **P4** | FR-3 structured output A/B ผ่าน smoke | ตัดสินใจ per-model จากข้อมูล ไม่ใช่ความเชื่อ |
| **P5** | FR-4 ledger.jsonl + recall_mistakes.py (ทำเมื่อ ledger > 20 entries) | PAST MISTAKES inject อัตโนมัติ ตรง semantic |
| **P6** | ขยาย micro-task 3 ชนิดใหม่ (parser/dsp/validation) อย่างละ ≥ 2 งานจริง | pass-rate รวม ≥ 80% ต่อ batch; ทุกงานมี stats entry |

> หมายเหตุ: benchmark session (74 dispatch) ได้ทำงานทับซ้อนกับ P1 บางส่วนแล้ว (bench_results.jsonl) — ตอน implement P1 ให้ reuse ข้อมูลนั้นเป็น baseline แทนการรันใหม่จากศูนย์

---

## 12. ความเสี่ยง / คำถามเปิด

| ความเสี่ยง | mitigation |
|---|---|
| โมเดลเล็ก co-resident smoke ไม่ผ่าน → ไม่มีทางออก VRAM นอกจาก mutex | FR-5 mutex ออกแบบให้พอใช้ได้เดี่ยว ๆ (ต้นทุน = 1 cold/สลับ) |
| structured output ลดคุณภาพ code ของ thinking model | FR-3 บังคับ A/B ก่อนเปิด; fence+strip เป็น default ที่พิสูจน์แล้ว |
| stats น้อยเกินไปช่วงแรก (n < 5 ทุกตัว) → router เลือกมั่ว | กติกา candidate จำกัด 1 งาน/batch + default fallback เสมอ (§4.2 ข้อ 7) |
| Ollama อัปเวอร์ชัน/re-quantize ทำโมเดลเดิมเปลี่ยนพฤติกรรม | smoke_tasks.json คงที่ → รัน re-smoke หลังทุกอัป (regression) — **พิสูจน์ความจำเป็นแล้วจากเคส qwen3/Ollama bug #14493** |
| ledger โตจน embed แพง | cache vector + re-embed เฉพาะ entry ใหม่ (§6.2) |

**คำถามเปิด (ตัดสินใจตอน execute):**
1. ~~orchestration/ scripts อยู่ G-Music หรือ Rwang?~~ → คงที่ G-Music (target-specific — ต่างจาก governance ที่อยู่ Rwang) แต่**ต้อง commit เข้า git ของ G-Music** ไม่ปล่อย untracked (บทเรียนจากเอกสารชุดนี้โดน git-clean)
2. threshold demote (0.6) และ score weight (0.1/10s) — ค่าตั้งต้นจากสามัญสำนึก ต้อง calibrate จากข้อมูลจริงหลัง P6 (ตอนนี้มี bench_results.jsonl 74 แถวเป็นวัตถุดิบแล้ว)

---

## CHANGELOG

| Date | Status | Change |
|---|---|---|
| 2026-07-21 | updated | Added FR-3 §5.4 Thinking-safe structured-review profile: `think:false`, strict schema, final-envelope validation, fail-closed exits, bounded diagnostics, and mocked/live smoke regression requirements from confirmed Mellum/Ollama RCA. |
