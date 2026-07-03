# SESSION SUMMARY — Local-LLM Refinement + Orchestrator Strategy (2026-07-03)

> **Session:** agent วิเคราะห์+refine ระบบ local-LLM dispatch (target: G-Music) — ขยายเป็นการวางยุทธศาสตร์ orchestrator ทั้ง ecosystem
> **Branch งาน:** `swarm/local-llm-refine` ใน D:\G-Music (9 commits — **ยังไม่ merge, รอเจ้าของตัดสิน**) · เอกสารชั้น orchestrator ย้ายมาที่ repo นี้ (branch `docs/session-2026-07-03-import`)
> **หลักฐานดิบทั้งหมด:** `D:\G-Music\orchestration\bench_results.jsonl` + `bench_raw/*.txt` (raw output ทุก dispatch)

---

## 1. สิ่งที่ทำ (ภาพรวม)

รัน **benchmark เชิงประจักษ์ ~95 dispatch จริง** บน Ollama (RTX 3060 12GB): micro-task 7 ชนิด × prompt 4 variant × โมเดล 8 ตัว + probe เจาะจง (GGUF เสีย, cold-load, PM injection, L1 retrieval, tool-use) → ได้ RCA 4 incident, prompt/config v2, model pool ใหม่, harness ใช้ซ้ำได้ และแผนยุทธศาสตร์ hub/orchestrator

**เครื่องมือที่สร้าง (อยู่ `D:\G-Music\orchestration\` — กำหนดให้ port ขึ้น hub ตาม P1):**
| ไฟล์ | หน้าที่ |
|---|---|
| `bench_tasks.json` | micro-task 7 ตัว พร้อม visible acceptance + **holdout checks** (ไม่อยู่ใน prompt) |
| `verify_gate.mjs` | Verify Gate deterministic: tsc --strict + assertion (eps 1e-6) ทั้ง visible+holdout |
| `dispatch.py` | loop เต็ม: buildPrompt → dispatch → gate → escalate (maxRework=1) → ledger/stats · **extractor v2** · **MODEL_OPTIONS ต่อโมเดล** |
| `bench.py` / `summarize_bench.py` / `reextract.py` | batch runner (pre-warm ก่อน, resume ได้) / ตารางสรุป / re-verify offline จาก raw |
| `recall_mistakes.py` + `ledger.jsonl` (15 entries) | FR-4: bge-m3 semantic recall ของ PAST MISTAKES (blacklist inject เสมอ, sim ≥ 0.5, cache 0.19s) |
| `probe_gemma.py` / `probe_pm.py` / `probe_tools.py` | probe เฉพาะทาง: GGUF เสีย / PM injection A/B / tool-use 3 สถานการณ์ |
| `scripts/prewarm_ollama.ps1` | pre-warm (num_ctx ตรง dispatch) + `-Unload` ก่อนงาน ML (รองรับ embedding model) |

---

## 2. RCA — 4 incidents (พิสูจน์แล้ว, ฉบับเต็ม: `D:\G-Music\docs\RCA--LOCAL-LLM-DISPATCH.md`)

1. **gemma-4-12B-coder (`5434f64afb3f`) เสียถาวรระดับ GGUF weights/vocab** — probe 4 ทาง (generate/chat/raw×2 template) พ่น `<unusedNN>` ทุกทาง แม้ raw mode; ไม่ใช่ template (gemma-4-12b-it template เดียวกันเป๊ะใช้ได้) → **blacklist ถาวร แจ้งลบแล้ว** · หมายเหตุ: **v2 ของสายนี้ (gemma-4-12B-agentic…tau2) แก้แล้ว ไม่ leak** — GGUF เสียเป็นราย build ไม่ใช่ราย uploader
2. **Cold-load "180s" = SATA SSD + eviction ไม่ใช่ค่าคงที่** — วัดจริง: 62.7s (VRAM ว่าง) / 88.1s (evict) / แย่สุด 115.3s; ตัวเลข 160–186s เดิม reproduce ไม่ได้ · **กับดักใหม่: pre-warm ต้องใช้ num_ctx เดียวกับ dispatch** ไม่งั้น Ollama reload ทิ้งการอุ่น (วัดพบจริง) · disk C: เหลือ 17GB — เฝ้าระวัง
3. **Prompt shape ตัดสิน pass-rate ผ่านปริมาณ CoT ที่เหนี่ยวนำ** — บน qwen3: v-plain **7/7 @ 5.1s** (ปล่อย `<think>` ว่าง) vs bracket-header 5/7 @ 49s (CoT ×10 + think ชน num_predict → โค้ดถูกตัด) vs ไม่มี acceptance 6/7 (syntax hallucination `String.padStart`) vs **PM-irrelevant 4/7 = injection ผิด task เป็นพิษ** (PM จาก bge-m3 recall = 3/3)
4. **Harness เดิมตัดสินโมเดลผิด (extraction bug)** — regex จับ fence แรก แต่โมเดล qwen3.5-family พ่น CoT ไร้ tag ที่ restate โจทย์ (มี ``` ในเนื้อความ) → **extractor v2** (strip orphan `</think>` + fence สุดท้ายที่มี `export function`): sushirl 0/7→**7/7**, gemma-it 9/14→14/14 · บทเรียน: แยก format-failure จาก capability-failure ก่อน blacklist ใคร

---

## 3. Model pool (วัดครบ 8 โมเดล — code + tool-use)

### คุณภาพ code (Verify Gate 3 ชั้น: tsc strict / visible / holdout — best config ต่อโมเดล)

| อันดับ | โมเดล | code | median warm | gen tok/s | VRAM | tool-use (3 สถานการณ์) |
|---|---|---|---|---|---|---|
| 1 | **qwen3:latest** 14.8B | **7/7** (holdout สะอาด) | **5.1s** | 31.3 | 10.05GB | ❌ **timeout >900s** (think-loop เมื่อเจอ tools) |
| 1 | **sushirl** 9B | **7/7** (ต้องมี extractor v2) | 11.6s | 44.8 | **5.57GB** | (ผลกำลังรัน — จะ append) |
| 3 | **Ornith-1.0-9B** 🆕 | 6/7 | ~25s (think เยอะ) | 44.5 | **5.57GB** | ✅ **3/3 เร็วสุด 1.9–2.7s** |
| 4 | **Mellum2-12B-A2.5B MoE** | 6/7 | **4.9s** | **127.5** (×4 qwen3) | 8.25GB | (กำลังรัน) |
| 5 | gemma-4-12b-it | 6/7 live (14/14 offline แต่ช้า ×10, channel leak) | 54.9s | 31.6 | 8.36GB | (กำลังรัน) |
| 6 | gemma-agentic-v2 🆕 | 3/7 — ไม่เก่ง code | ~11s | — | 8.31GB | ✅ 3/3 (specialize ตามชื่อจริง) |
| 7 | Qwythos-9B | 5/7 (**ต้อง temp 0.6** — 0.1 ทำ repetition 1/7) | 19.6s | 44.6 | 6.09GB | (กำลังรัน) |
| — | gemma-4-12B-coder | เสียถาวร → **ลบ** (`5434f64afb3f`) | — | — | — | — |

### บทบาทแนะนำ (คงใน `D:\G-Music\docs\LOCAL_MODEL_LEDGER.md`)
- **default code:** qwen3 (แต่**ห้ามใช้กับ tool-calling** — think-loop) · **co-resident code:** sushirl · **latency-sensitive:** Mellum2 · **tool-use/agentic:** Ornith (code 6/7 + tools 3/3 + 5.57GB = all-rounder ตัวจริง) หรือ gemma-agentic-v2 (tools อย่างเดียว)
- **บทเรียน config:** ห้ามใช้ config เดียวทุกโมเดล — อ่าน model card ก่อนเสมอ (Qwythos/Ornith/Mellum2 ต้อง temp 0.6, agentic-v2 ใช้ greedy+rep_pen 1.1)

---

## 4. ยุทธศาสตร์ (ตัดสินใจในเซสชันนี้)

### 4.1 llm-hub กลาง (แทนการเรียก Ollama ตรงจากแต่ละโปรเจค) — **อนุมัติแนวทาง**
- ปัญหา: ความรู้ (blacklist/config/extractor/บทเรียน) กระจายต่อโปรเจค เจ็บซ้ำ + **VRAM 12GB เป็น resource ร่วมที่ไม่มีคนกลาง**
- ข้อสรุป: **ทำ hub — แต่ไม่เขียน inference engine เอง** (ปัญหาที่เจอไม่มีข้อไหน Ollama เป็นต้นเหตุ); hub ห่อ Ollama + provider interface แบบ **OpenAI-compatible + capability flags** → vLLM/Transformers/llama.cpp/cloud เสียบทีหลังได้ (พิจารณาใช้ **LiteLLM** เป็นชั้นแปลง API สำเร็จรูป)
- ledger + MODEL_OPTIONS ต้อง key ด้วย `(provider, model)`
- vLLM: เหมาะเมื่อมีงาน batch โมเดลเดียวปริมาณมาก/เครื่อง GPU แยก — บนเครื่องนี้จะฆ่า co-residency · Transformers: adapter เฉพาะกิจโมเดลไม่มี GGUF

### 4.2 ของนอกที่ประเมินแล้ว
- **google/agents-cli** = เครื่องมือ deploy agent ขึ้น GCP (Gemini-only) — คนละโจทย์ ตัดทิ้ง
- **Google ADK/Gemini CLI** = ชั้น agent (ลูกค้าของ hub ไม่ใช่คู่แข่ง) — gotcha `ollama_chat` ของ ADK คือตัวอย่างความรู้ที่ควรอยู่ใน hub
- **AgentWrapper/agent-orchestrator (AO, 7.9k⭐ v0.10.1)** = คนละครึ่งวงกลมกับ Rwang: AO มี plumbing (CI/review feedback routing, Electron UI, conpty, 23+ agent adapters) แต่**ไม่มี verify gate / cost-tier / local dispatch เลย** และ autonomy แบบ PR-centric **ขัด invariant ห้าม external write** ของ Rwang → สถานะ: **P4 spike ในโหมดมีคนคุมก่อน ห้ามแทน Rwang core**

### 4.3 ลำดับความสำคัญ (อนุมัติกรอบในเซสชัน)
| P | งาน | เหตุผลสั้น | ผลที่คาด |
|---|---|---|---|
| P1 | Port `orchestration/` → llm-hub | pain พิสูจน์แล้ว, เสร็จ 80%, no-regret ทุกสถาปัตยกรรม | ความรู้+VRAM mutex ใช้ทุกโปรเจค |
| P2 | Implement governance guards 🆕 (G1 state_check, G2 drift_check, G7 holdout) ใน Rwang | spec ตัวเองประกาศ "ไม่มี guard = ไม่มี governance"; วันนี้พิสูจน์ว่า gate เชิงกลไกจับทุกอย่างที่ prompt จับไม่ได้ | kill-restart resume ได้, รายงานกุถูกจับ |
| P3 | ปิดงาน pause-resume runner (มี DESIGN/AUDIT doc ค้าง) | งานครึ่งทาง ROI ชัด | run ยาวข้าม window |
| P4 | Spike AO 1–2 วัน โหมด supervised | คุณค่าพิสูจน์ถูก, เช็ค conpty + human-only PR | ตัดสิน: ยืมเป็นชั้น UX หรือลอก pattern |
| P5 | ยังไม่ทำ: แทน Rwang ด้วย AO / agents-cli / เขียน engine เอง | เสียแก่นที่วัดผลแล้ว | — |

---

## 5. สำรวจ 5 ระบบ orchestration ที่เจ้าของเขียนไว้ (เพื่อ refine Rwang)

> เจ้าของระบุ 5 ระบบ: GoVibe MCP · GoVibe legacy/embedded · G-Music harness · G-Maiden · RWANG-fork (D:\rwang\RWANG)

### GoVibe (สำรวจเสร็จ — เจาะโค้ดจริง ~5,200 LOC MCP + ~7,800 LOC legacy)
**ของดีที่ควร port เข้า Rwang (top 5, ระบุไฟล์แล้ว):**
1. **Wave-based topological scheduler** (`wave.mjs`+`dag.mjs`): computeWaves + W-Scale governance (refuse W4 super-hub 9+ dependents, Tarjan cycle detection) — pure/testable
2. **Dual-mode dry-run** (`autonomy.mjs`): `execute:false` = จำลองทั้ง roadmap + emit event ครบให้ UI โดย **ไม่ spawn อะไรเลย** แล้ว `execute:true` บน contract เดียวกัน — Rwang ไม่มี
3. **Step-level escalation + retry feedback** (`step.mjs:escalateRoute()`): attempt 2+ bump tier + ฉีด DoD failure กลับเข้า prompt เป็น `[Retry feedback]` — เสริม maxRework ladder ของ Rwang ได้ตรง ๆ
4. **Real DoD gate** (`verify-gate.mjs`): รัน npm scripts จริง (lint/build/test) serial + vacuous-pass detection — แนวเดียวกับ check_evidence ของ Rwang แต่มี requireAll logic
5. **Temporal versioning** (`temporal-versioning.mjs`): bitemporal (validFrom/validTo/recordedAt/supersededAt) บน roadmap state ~50 LOC — audit "state เมื่อวานบ่ายสอง" ได้
- สถานะ: MCP runtime = Phase 1 ใช้จริง มี test 826 LOC, PRD ตรงโค้ด · legacy engine = **ถูกวางข้าง** (backlog ว่าง) แต่มีของอ้างอิงดี: claim/lease + usage.jsonl metering
- **แนวคิดใหญ่ที่สุดจาก GoVibe: MCP-as-orchestration-interface** — 13 tools เป็น contract เดียวให้ UI/CLI/CI/agent เรียกเหมือนกันหมด → ตรงกับวิสัยทัศน์ hub

### G-Maiden family (G-Maiden / RWANG-fork / govibe-embedded) — สำรวจเสร็จ
- **สายพันธุ์:** engine เดียวกัน 770 LOC (file-lock claim + lease reclaim 30m + DAG waves) · **RWANG-fork (D:\rwang\RWANG) = ตัวสมบูรณ์สุด**: GKS + DACI borrow-checker (persona exclusive/shared) + approval-chain + test 10 ไฟล์ + React/Vite SPA (~15 components: Kanban, dependency graph React Flow, cost cockpit) · G-Maiden = ต้นตำรับ (ใช้จริงกับ Dota companion) · govibe-embedded = สำเนา + voice stack
- **ของดีที่ G:/Rwang ยังไม่มี (top 5, ระบุไฟล์):**
  1. **Worker pool + lease reclaim** (`G-Maiden/engine.mjs` runPool/reapStale ~50 LOC): claim atomic ผ่าน file-lock + คืน task อัตโนมัติเมื่อ worker ตาย — G:/Rwang รันเรียงตัว
  2. **Verify gate + rework loop** (`engine.mjs` executeWithReview/parseVerdict): reviewer-agent tier ถูก + ฉีด issues กลับเป็น rework note (จำกัดรอบ) — เสริม check_evidence ที่เป็น single-pass
  3. **Cost meter + auto-downgrade** (`cost-meter.mjs` + tierDowngrade): เกิน 80% budget → ลด tier อัตโนมัติ, เกิน 90% → สลับ local, มี kill-switch — cost_ledger ของ G:/Rwang ไม่มี enforcement
  4. **Governance confirm gate** (`engine.mjs` needsConfirm): task type guard/safety/audit ต้อง confirm ก่อน dispatch — enforce ที่ engine ไม่ใช่ prompt (ตรงปรัชญา governance spec G3)
  5. **Knowledge adapter** (`engine.mjs` queryPastMistakes + failures.jsonl): แนวเดียวกับ FR-4 ที่เราสร้างวันนี้ — มี prior art ใช้จริงมาก่อน ควรรวมร่างเป็นตัวเดียวใน hub
- **ข้อสังเกตรวม 2 ตระกูล:** GoVibe เด่นชั้น *planning/contract* (waves, dry-run, temporal, MCP interface) · G-Maiden เด่นชั้น *execution* (pool, rework, cost enforcement) · G:/Rwang เด่นชั้น *policy* (tier ladder, deterministic gate, governance spec) — **สามเหลี่ยมนี้คือพิมพ์เขียว Rwang v2**

### G-Music harness — คือของที่สร้างเซสชันนี้ (§1) จุดแข็งเฉพาะ: Verify Gate + holdout, extractor v2, per-model options, ledger+recall — **เป็นแก่นของ P1**

---

### 5.1 การตัดสินใจเพิ่มเติม: knowledge backend + UI (ถาม-ตอบท้ายเซสชัน)
- **Graph DB = GenesisBlockDB** (G:/GenesisBlock_Dev/GenesisBlock — embedded Rust graph+vector, HNSW bge-m3 1024-dim recall@10 0.984 @1.1ms, bitemporal, N-API/REST/MCP): เป็น **derived index** ของ hub — `ledger.jsonl` ยังเป็น SSOT append-only, DB ingest จาก JSONL (rebuild ได้เสมอ) · adapter pattern `file|genesisdb` มีอยู่แล้วใน G-Maiden `store/knowledge.mjs` — reuse
- **UI = RWANG-fork `studio/` (React/Vite/TS) เป็นฐาน** + ยก WebSocket sidecar pattern (`/mission/ws`) ของ GoVibe มาแทน polling · monitor.html เป็น fallback · React Flow ใช้ render ทั้ง task DAG และ knowledge graph จาก GenesisBlockDB · เทียบ AO Electron หลัง P4 spike

## 6. คำตอบคำถามเฉพาะที่ถามในเซสชัน

- **"คุณภาพ code ใครดีสุด"** → qwen3 = sushirl (7/7 ทุกชั้น) โดย qwen3 เร็วกว่า/sushirl ประหยัด VRAM กว่า; ดูตาราง §3
- **"tool use ใครดีสุด" (ฉบับจบ ครบ 8 โมเดล)** → **Ornith 3/3 เร็วสุด (1.9–2.7s)** > sushirl/Qwythos/gemma-it/gemma-agentic-v2 (3/3 ทั้งหมด, warm 2–6s) > Mellum2 2/3 (S1-en ไม่เรียก tool) > **qwen3 0/3 — runaway จาก Ollama bug [#14493](https://github.com/ollama/ollama/issues/14493)** (qwen tool renderer ผิด format; พิสูจน์ 2 config + orphaned request ยึด GPU เกิน num_ctx ต้อง kill process) → ถอด qwen3 จาก pool (ผู้ใช้แจ้งลบ `670a5c200264`), **sushirl ขึ้น default** (code 7/7 + tools 3/3 + 5.57GB); ทางกลับ qwen3 = unsloth/Qwen3-14B-GGUF + presence_penalty 1.0–1.5 + smoke ก่อน
- **"gemma list ตกหล่นอะไร + id ตัวพัง"** → พัง 1 ตัว: `5434f64afb3f` (แจ้งลบ) · duplicate tag: aroow-rust-coder = `4157468b3949` ซ้ำ 2 ชื่อ · ตกหล่นที่เทสเพิ่มแล้ว: Ornith, gemma-agentic-v2
- **"สร้าง backend เอง (llama.cpp)?"** → ทำ hub ใช่ / เขียน engine เอง ไม่ (§4.1)

## 7. งานค้าง / รอตัดสินใจ
1. **Merge `swarm/local-llm-refine` เข้า main ของ G-Music** — รอเจ้าของ (9 commits: harness, RCA, REPORT v2, LEDGER, prewarm)
2. ผล tool-use 4 โมเดลสุดท้าย + รายงาน G-Maiden family — จะ append ในไฟล์นี้
3. เริ่ม P1 (llm-hub) เมื่อเจ้าของสั่ง — ตำแหน่ง repo เสนอ `G:/llm-hub` หรือใต้ Rwang
4. อัปเดต REPORT/LEDGER ใน G-Music ด้วยผล Ornith/agentic-v2 (ยังไม่ commit ข้อมูลชุดนี้)
5. Ollama models dir ยังอยู่ C: (เกือบเต็ม 17GB) — เจ้าของเริ่มทำ symlink เอง ถ้าย้ายไป HDD cold-load จะช้าลง ~4 เท่า → แนะนำย้ายไป SSD ตัวอื่นถ้ามี
