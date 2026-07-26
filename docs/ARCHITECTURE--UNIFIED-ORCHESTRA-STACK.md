# ARCHITECTURE — Unified Orchestra Stack (Rwang v2 / G-Orchestra × llm-hub × GKS/GenesisBlockDB)

> **สถานะ:** DRAFT v1 · 2026-07-03 · รวมการตัดสินใจจาก [SESSION--2026-07-03](SESSION--2026-07-03-local-llm-refine.md) เข้ากับ [MASTERPLAN--G-ORCHESTRA-V2](G:/G-Maiden/docs/MASTERPLAN--G-ORCHESTRA-V2.md) (MSP, 37 atoms)
> **หลักฐานเชิงประจักษ์รองรับ:** benchmark ~100 dispatch (D:\G-Music\orchestration) + สำรวจโค้ดจริง 3 ตระกูล orchestrator

---

## 1. ชนิดสถาปัตยกรรม (ตอบคำถาม "architecture แบบไหน")

**Hexagonal (Ports & Adapters) + Local-first + Append-only event core** — 3 หลักการนี้เลือกจากหลักฐาน ไม่ใช่แฟชั่น:

| หลักการ | เหตุผลจากหลักฐาน |
|---|---|
| **Hexagonal / ports & adapters** | ทุกจุดที่เราเจ็บวันนี้คือจุดที่ of-the-shelf เสียบไม่ได้: engine (Ollama↔vLLM), agent CLI (23+ ตัว), knowledge backend (file↔genesisdb — G-Maiden ทำ port นี้ไว้แล้ว), UI (polling↔WS) → ทุก dependency ภายนอกเป็น **adapter หลัง port**; core ไม่รู้จักยี่ห้อ |
| **Local-first** | RTX 3060 + Ollama + GenesisBlockDB (embedded) + Tauri = ทำงานได้ไม่มีเน็ต; cloud เป็น tier เสริม (T2/T3) ไม่ใช่กระดูกสันหลัง — ตรง positioning "BYOM/local-first" ของทุกโปรเจคในเครือ |
| **Append-only event core** | ทุกชั้นสื่อสารผ่าน append-only log (`progress.ndjson`, `ledger.jsonl`, `usage.jsonl`, WAL ของ GenesisDB) → resume/audit/replay ได้เสมอ; UI เป็นแค่ view ของ event (governance spec: "Audit = proof") |

---

## 2. Layer diagram (ตำแหน่งของทุกชิ้นที่ตัดสินใจแล้ว)

```
L6 UI/UX ─ studio (React/Vite จาก RWANG-fork): Board·Cockpit·Graph(ReactFlow)·PipelineCanvas·Copilot·Loadout
│            ▲ live ผ่าน WS sidecar (pattern จาก GoVibe /mission/ws) · fallback: monitor.html
│            inbound ports: REST /api/* · WS events · MCP tools (pattern GoVibe 13-tools) · CLI
L5 ORCHESTRATOR ─ Rwang v2 (= G-Orchestra core)
│    · wave scheduler + W-Scale (GoVibe wave.mjs/dag.mjs) · dry-run dual-mode (execute:false)
│    · worker pool + lease reclaim (G-Maiden engine.mjs) · tier router T0-T3 + cost auto-downgrade + kill-switch
│    · governance gates G1-G7 (state/drift/holdout/confirm) — enforce ที่ runtime ไม่ใช่ prompt
│    · Verify Gate deterministic (tsc/vitest + visible+holdout) + rework loop (maxRework=1)
L4 MEMORY ─ MemoryOS (feature--memoryos, MSP P2): per-agent private KB — equip ผ่าน Loadout
│    · llm-hub (P1): model knowledge กลาง — MODEL_OPTIONS ต่อ (provider,model) · blacklist · extractor v2
│      · prewarm/VRAM mutex · ledger.jsonl (SSOT) + recall (bge-m3, sim≥0.5, blacklist เสมอ)
L3 KNOWLEDGE ─ GKS (Genesis Knowledge System)
│    · atoms (gorch.json) → compile → backlog/waves · GRL context packages (tiered)
│    · knowledge-adapter port: file ↔ genesisdb (สลับได้โดย API ไม่เปลี่ยน — DoD ของ feature--memoryos)
L2 STORE+VECTOR ─ GenesisBlockDB (embedded Rust, N-API/REST/MCP)
│    · store layer: WAL + property graph + bitemporal supersession (1-hop 22µs)
│    · vector layer: HNSW per-collection (bge-m3 1024d — recall@10 0.984 @1.1ms) + Thai lexical
L1 ENGINES ─ outbound ports (OpenAI-compatible + capability flags)
     · Ollama (default) · llama.cpp/vLLM/cloud = adapters ภายหลัง (LiteLLM เป็นตัวเลือกชั้นแปลง)
     · agent adapters: Claude Code วันนี้ · (AO/Gemini CLI ถ้า P4 ผ่าน)
```

**กติกาเหล็กข้ามชั้น:** ชั้นบนเรียกชั้นล่างผ่าน port เท่านั้น · ทุก write ลง append-only log ก่อน derive ไป view/DB · `ledger.jsonl` เป็น SSOT — GenesisBlockDB เป็น **derived index (rebuild ได้เสมอ)** · GenesisDB sidecar มี **flat-file fallback บังคับ** (MSP risk #2 — N-API pre-1.0)

---

## 3. Features / Functions ต่อชั้น (ชี้ atom ใน MSP + สถานะหลักฐาน)

| ชั้น | feature (atom จาก MSP) | function หลัก | สถานะ |
|---|---|---|---|
| L6 | feature--board / cockpit / graph-editable / pipeline-canvas / copilot-console / loadout | มอง-ลาก-อนุมัติ-เฝ้าดู ("one object, lenses") | โค้ด UI มีแล้วใน RWANG-fork studio |
| L5 | safety--verify-gate-v2 · algo--planner-tiering · guard--governance-gate · algo--ownership-borrow-checker · algo--autoloop (P2) | dispatch→gate→escalate→track | gate+tier **พิสูจน์แล้ววันนี้** (100 dispatch); pool/confirm มีของใน G-Maiden |
| L4 | feature--memoryos · algo--knowledge-adapter · (llm-hub = งาน P1 ใหม่ — ควรเพิ่มเป็น atom) | จำ-เรียกคืน-กันพลาดซ้ำ | recall+ledger **วัดผลแล้ว** (PM-recall 3/3 vs irrelevant 0/3) |
| L3 | entity--atom-schema · algo--genesis-compile · entity--traceability-graph | spec→backlog→trace | exists/extend ตาม MSP |
| L2 | tech_stack--genesisdb-sidecar | store+vector+bitemporal | GenesisBlockDB benchmark แล้ว (repo ตัวเอง) |
| L1 | config--routing-cloud-local | cloud=plan/review · local=code ที่แตกย่อยแล้ว | model pool วัดครบ 8 ตัว (ดู §5) |

---

## 4. User stories (ยึด persona จาก MSP: P0 solo founder → P2 customer dev) + data contract ต่อ UI

| # | User story | Surface | ข้อมูลที่ UI ต้องได้ (port) |
|---|---|---|---|
| U1 | ในฐานะ founder ผมวางสเปกเป็น atoms แล้ว **เห็นก่อนว่าจะเกิดอะไร** ก่อนกดจ่ายเงิน | PipelineCanvas + dry-run | `orchestrate.run {execute:false}` → wave plan events (ไม่ spawn จริง) |
| U2 | ผม dispatch wave แล้ว**ดูแต่ละ agent ทำงานสด** และดึงงานคืนได้ | Board + log viewer | WS: task.update, log tail per worker, claim/release commands |
| U3 | ผมอยากรู้ว่า**เงินไหลไปไหน** และให้ระบบลด tier เองเมื่อใกล้เพดาน | Cockpit | usage.jsonl aggregate (session/weekly) + tier-downgrade events + kill-switch toggle |
| U4 | เมื่องาน fail ผมอยากเห็นว่า **gate จับอะไร** และรอบ rework แก้ตรงไหน | Board detail | verify events (tsc/visible/holdout exit + failures[]) + rework note |
| U5 | ผมอยากให้ระบบ**ไม่ทำพลาดซ้ำ** — บทเรียนจากโปรเจคหนึ่งต้องถูกใช้ทุกโปรเจค | Copilot/Memory | recall query → lessons (sim, source project) + blacklist banner |
| U6 | ผมอยากเห็น**ความสัมพันธ์** ว่า lesson/model/task โยงกันยังไง ข้ามโปรเจค | Graph (ReactFlow) | GenesisDB traversal: `(model)-[failed_on]->(task_type)`, `(lesson)-[observed_in]->(project)` |
| U7 | งานอันตราย (guard/safety/destructive) ต้อง**หยุดรอผมกด confirm** เสมอ | Board + notification | confirm_required events + `/api/confirm` (enforce ที่ engine — G-Maiden needsConfirm) |
| U8 | (P2 persona) ผม equip agent ด้วย memory/tool ต่างกันเหมือน **loadout เกม** | Loadout | persona presets + MemoryOS collections ต่อ agent |

**UX principle จาก MSP §Vision:** "Track it like Jira · Easy as Trello · Claim it like Linear · Graph it like Obsidian · Equip it like a game" — ทุก surface เป็น lens ของ object เดียว (atom) ห้ามมี state แยกต่อจอ

---

## 5. ข้อมูลจริงที่ป้อนชั้น routing (จาก benchmark 2026-07-03 — ฉบับเต็มใน SESSION doc)

| งาน | โมเดล | หลักฐาน |
|---|---|---|
| code เร็ว (VRAM ว่าง) | qwen3 | 7/7 @ 5.1s — **ห้ามใช้กับ tools (timeout >900s)** |
| code + co-resident | sushirl | 7/7 + tools 3/3 + 5.57GB — **all-rounder ตัวจริง** |
| agentic/tool-calling | Ornith | tools 3/3 เร็วสุด (1.9–2.7s) + code 6/7 + 5.57GB |
| latency-sensitive code | Mellum2 MoE | 4.9s/127tok/s แต่ tools 2/3 (S1-en ไม่เรียก tool) |
| tool เท่านั้น | gemma-agentic-v2 | tools 3/3, code 3/7 |

---

## 6. ลำดับ build (สอดคล้อง MSP waves + P1-P5 ของ session)

1. **llm-hub (P1 ของ session)** = ส่วนหนึ่งของ MSP Epic "Knowledge Backend" — เสนอเพิ่ม atom `module--llm-hub` (deps: algo--knowledge-adapter)
2. governance guards (G1/G2/G7) + confirm gate → MSP guard--governance-gate (ยกโค้ด G-Maiden)
3. worker pool + cost auto-downgrade เข้า run.js → MSP algo--planner-tiering + cost-cap-tiers
4. dry-run dual-mode + waves → ก่อน pipeline-canvas (P2)
5. MemoryOS + traceability บน GenesisDB → MSP S2.1
6. AO spike (P4) — ตัดสินชั้น agent adapter/UX ภายนอก

**Invariant ที่ห้ามเสียไม่ว่าชั้นไหน:** Verify Gate = deterministic เสมอ · ห้าม external write ใน autonomy · maxRework=1 ต่อชั้น · ทุก claim มี event รองรับ
