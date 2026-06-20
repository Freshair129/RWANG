# G-Maiden — Multi-Agent Orchestrator

ระบบ worker pool ที่เอา **task backlog (พร้อม dependency)** จาก Ultraplan มาแจกจ่ายให้ AI agent
ทำงาน โดย **route ตาม model tier** อัตโนมัติ และมีกลไก **claim/assign + dependency gating + lease**
แบบเดียวกับ distributed task queue.

> ไม่มี dependency ภายนอก — ใช้ Node built-in ล้วน (รันบน Windows/macOS/Linux). dispatch ไป `claude -p`.

---

## แนวคิดหลัก (ดัดแปลงจาก task-queue จริง)

| กลไก | ทำงานยังไง |
| --- | --- |
| **Dependency gating** | task จะ "พร้อมทำ" (ready) ก็ต่อเมื่อ `deps` ทุกตัวเป็น `done` แล้วเท่านั้น — กัน agent ทำงานที่ของยังไม่พร้อม |
| **Claim (atomic)** | worker จองงานผ่าน lock file (`.state.lock`) → compare-and-swap บน `state.json` → ไม่มี worker สองตัวทำ task เดียวกัน |
| **Assign** | บังคับ model เจาะจงให้ task หนึ่ง (override routing) |
| **Lease / reclaim** | งานที่ถูก claim แต่เงียบเกิน `leaseMs` (worker ตาย) จะถูกปล่อยกลับเป็น `todo` อัตโนมัติ |
| **Model routing** | map `task.type` → role → model: วางแผน/architecture/spike = **opus**, coding = **sonnet**, งานง่าย/scaffold/config/docs = **haiku** |
| **Wave planning** | คำนวณ topological levels → บอกว่า task ไหนทำ **คู่ขนาน** ได้ในรอบเดียว |

---

## โครงไฟล์

```
orchestration/
├─ engine.mjs         แกนกลาง (DAG, claim, lease, routing, executor) — ใช้ร่วม CLI+UI
├─ orchestrator.mjs   CLI
├─ server.mjs         web UI server (Node http ล้วน)
├─ public/index.html  หน้า UI (glassmorphism ธีม G-Maiden)
├─ config.json        model routing, concurrency, leaseMs, executor
├─ backlog.json       task ทั้งหมด (id, type, deps, accept) — มาจาก docs/05-Ultraplan.md
├─ state.json         สถานะรันไทม์ (สร้างอัตโนมัติ)
├─ logs/              ผลลัพธ์ของแต่ละ agent (สร้างตอน dispatch/execute)
└─ README.md
```

---

## Web UI (monitor + สั่งงานผ่านเบราว์เซอร์)

```bash
cd orchestration
npm run ui                 # = node server.mjs  -> http://localhost:4577
# หรือเลือกพอร์ต:  node server.mjs --port 8080
```

เปิด `http://localhost:4577` จะได้แดชบอร์ด:
- **Monitor:** progress bar, counts, สถานะทุก task แบบ live (auto-refresh 1.5s), dependency chips
  (เขียว = dep เสร็จแล้ว), badge model (opus/sonnet/haiku), filter ตาม phase/status/model + ค้นหา
- **สั่งงาน:** ปุ่มต่อ task ตามสถานะ —
  `claim` · **`▶ dispatch`** (claim+เรียก agent จริงทันที) · `done` · `fail` · `release/retry` ·
  เลือก `model…` (override routing) · ดู `log` ของแต่ละ agent · ปุ่ม `reset`
- ทุกปุ่มเรียก REST API เดียวกับ CLI → state ตรงกันทั้งสองทาง (เปิด UI กับใช้ CLI สลับกันได้)

> **`▶ dispatch` เรียก `claude` จริง** — ต้องตั้ง `executor.extraArgs` ใน `config.json` ให้ agent
> มีสิทธิ์แก้ไฟล์ก่อน (เช่น `["--permission-mode","acceptEdits"]`) ไม่งั้น headless จะค้างรอ permission.

### REST API (ใช้ต่อยอด/automation ได้)
```
GET  /api/state            -> snapshot ทั้งหมด (progress, counts, tasks[])
GET  /api/log?id=G0.1      -> log ล่าสุดของ task
POST /api/cmd  {action,id,worker,model}
       action: claim | done | fail | release | assign | dispatch | reset
```

---

## การ route model (แก้ได้ใน `config.json`)

```
type: spike / plan / architecture / design / process   ->  architect  ->  opus
type: code / impl / integration / test                 ->  coder      ->  sonnet
type: scaffold / config / docs                         ->  worker     ->  haiku
type: manual                                           ->  (ทำมือ ไม่ dispatch)
```

ตัวอย่างผลลัพธ์จริง: `G0.1 scaffold → haiku`, `G1.1 GSI server → sonnet`,
`G3.2 G-Motion prediction → opus`, `G5.2 advice engine → opus`.

---

## คำสั่ง

```bash
node orchestrator.mjs status              # ภาพรวม + progress bar + สถานะทุก task
node orchestrator.mjs next                # task ที่พร้อมทำตอนนี้ + model + acceptance
node orchestrator.mjs graph               # DAG เป็น waves (อะไรทำคู่ขนานได้)
node orchestrator.mjs graph --mermaid     # DAG เป็น mermaid (เอาไปวาด)

node orchestrator.mjs claim <id> -w alice # จองงาน (atomic, เคารพ dependency)
node orchestrator.mjs done <id>           # ทำเครื่องหมายเสร็จ -> ปลดล็อก task ที่รอ
node orchestrator.mjs fail <id>           # ล้มเหลว
node orchestrator.mjs release <id>        # คืนงานกลับ todo
node orchestrator.mjs assign <id> opus    # บังคับ model เจาะจง

node orchestrator.mjs run                 # DRY-RUN: วางแผน waves + การ route (ไม่เรียก agent)
node orchestrator.mjs run --execute       # ของจริง: worker pool เรียก claude -p ตาม concurrency
node orchestrator.mjs run --execute --max 4
node orchestrator.mjs reset               # ล้าง state กลับ todo ทั้งหมด
```

---

## Context scoping + small-model discipline (POLA)

อิง `docs/CONCEPT--SUBAGENT-CONTEXT-SCOPING.md` + `docs/GUIDE--SMALL-MODEL-PROMPTING.md`:

- **Parent ประกาศ scope ต่อ task** (subagent ไม่ตั้งเอง). ดีฟอลต์ที่ `config.scope.byPhase`, override ที่
  `task.scope` ใน backlog: `{ docs, needs, excludes, budgetTokens, scaffold, profile }`.
- **เอกสารมี tier** ใน `config.docsForContext`: `shared` (เข้า worker ได้), `worker-guide`,
  และ **`orchestrator-only`** (เช่น CONCEPT doc, `leak_risk:high`) — **ถูกกรองออกจาก prompt ของ worker ทุกตัวเสมอ**.
- **buildPrompt size-aware:**
  - *claude full-agent* → ชี้เฉพาะ doc paths ใน scope ให้ไปอ่านเอง + สั่ง escalate ด้วย `BLOCKED:` ถ้าบริบทไม่พอ
  - *ollama (โมเดลเล็ก)* → ไม่ inline ไฟล์เอกสาร, ใช้ micro-task + scaffold-first + anti-loop + strict-output (ย่อจาก GUIDE)
- **Escalation ไม่เงียบ:** ถ้า agent ตอบ `BLOCKED: …` orchestrator จับได้ → mark task เป็น `failed` + เขียน
  `⚠ ESCALATION` ใน log (surface ให้เห็น ไม่ใช่ degrade เงียบ ๆ). *(round-trip escalate() อัตโนมัติ = งานเฟสถัดไป)*
- **Ollama profiles** (`config.ollama.profiles`): `fast` / `balanced` / `ui-heavy` คุม temperature/num_predict
  ต่อ task ผ่าน `scope.profile`.

---

## Providers, Auth & Usage

### เลือกแหล่ง compute ได้ 3 ทาง
| Provider | ตั้งค่า model เป็น | บิล / โควต้า | ทำอะไรได้ |
| --- | --- | --- | --- |
| **Claude (Plan)** | `opus`/`sonnet`/`haiku` + auth=`plan` | โควต้า subscription | full agent (แก้ไฟล์/รันคำสั่ง) |
| **Claude (API key)** | เหมือนกัน + auth=`apikey` | จ่ายตาม API token | full agent |
| **Ollama (local)** | `ollama:<name>` เช่น `ollama:qwen2.5-coder:7b` | **ฟรี / $0** ไม่กินโควต้า | gen ข้อความ/ร่าง/แผน (แก้ไฟล์เองไม่ได้) |

**สลับ auth (Plan ↔ API key)** — ปุ่ม `💳 Plan / 🔑 API key` บนแถบ auth ใน UI (หรือ `config.auth.mode`).
กลไก: ตอน spawn agent จะปรับ `ANTHROPIC_API_KEY` ใน env ของ child process — `plan` ลบออก, `apikey` ใส่เข้า.
ปุ่ม API key จะใช้ไม่ได้ถ้าไม่พบ key ใน env.

**Ollama** — ตั้ง `config.ollama.host` (ดีฟอลต์ `http://127.0.0.1:11434`). ต้องมี `ollama serve` รันอยู่ +
`ollama pull <model>` ก่อน. route ได้ 2 ทาง: เปลี่ยน `config.routing` (เช่น `"worker": "ollama:llama3.2"`)
หรือ `assign` ต่อ task จาก dropdown ใน UI (กลุ่ม 🦙 ollama). เอาต์พุตสตรีมเข้า Agent Room เหมือน claude.
UI โชว์สถานะ 🦙 ollama up/down + จำนวน model.

> Ollama เป็นการ gen ข้อความล้วน — เหมาะกับ task ประเภทวางแผน/ร่าง/วิเคราะห์ หรือทำออฟไลน์/ประหยัดโควต้า.
> ผลที่ได้คือโค้ด/แผนใน log ให้คนหรือ claude agent เอาไปใช้ต่อ (ไม่ลงมือแก้ repo เองแบบ claude agent).

### Usage (Current session / Weekly)
แถบ usage แสดง 2 การ์ด — **Current session (≤5h)** และ **Weekly (≤7d)** — สรุปจาก `usage.jsonl`
ที่บันทึก token + cost ของทุก agent (claude มี $cost จริงจาก result event; ollama = $0):
- cost รวม, จำนวน agents, token in/out/cache, แยกตาม model
- ตั้ง `config.usageLimits.sessionUsd` / `weeklyUsd` → การ์ดโชว์แถบ % + เตือนเมื่อใกล้ (≥80%) / เกินงบ

> ⚠️ ตัวเลขนี้นับ **เฉพาะที่ agent ของ orchestrator ใช้** — ไม่ใช่ % คงเหลือทางการของ Max plan
> (`claude` CLI ไม่เปิด API ให้ดึง limit จริงแบบ headless; ดูเพดานจริงที่ `/usage` ใน Claude Code).
> หน้าต่าง 5h/7d อิงรอบ rate-limit ของ Max plan เพื่อให้เทียบเคียงได้.

---

## วิธีใช้จริง

### โหมด 1 — วางแผน / มอบหมายเอง (แนะนำช่วงแรก)
```bash
node orchestrator.mjs next            # ดูว่าอะไรทำได้
node orchestrator.mjs claim S-1 -w you
# ... ทำงาน (หรือเปิด Claude Code อีกหน้าต่างทำ task นั้น) ...
node orchestrator.mjs done S-1        # ปลดล็อก task ถัดไปใน DAG
```

### โหมด 2 — worker pool อัตโนมัติ (agent ทำเอง)
1. เปิดสิทธิ์ให้ agent แก้ไฟล์ได้ — แก้ `config.json`:
   ```json
   "executor": { "extraArgs": ["--permission-mode", "acceptEdits"] }
   ```
   *(ค่าเริ่มต้นปล่อยว่างเพื่อความปลอดภัย — agent จะถามสิทธิ์ ทำให้ headless ค้าง)*
2. รัน:
   ```bash
   node orchestrator.mjs run --execute --max 3
   ```
   orchestrator จะวน: claim งานที่ ready → dispatch ไป `claude -p --model <tier>` →
   mark done/failed → ปลดล็อก task ถัดไป → จนกว่างานหมดหรือเหลือแต่ manual/failed.
   ผลแต่ละ agent อยู่ใน `logs/<id>.<worker>.log`.

> **ข้อควรระวัง:** worker pool เรียก `claude` จริงหลายตัวพร้อมกัน = ใช้โควต้า/โทเค็นจริง.
> เริ่มจาก `--max 1` หรือ DRY-RUN ก่อนเสมอ. งาน `manual` (เช่น `PRE` toolchain) ถูกข้าม — ต้องทำเอง.

---

## ปรับแต่ง

- **เพิ่ม task:** เติมใน `backlog.json` (มี `id`, `type`, `deps`, `accept`) — orchestrator sync ให้เอง
- **เปลี่ยนการ route:** แก้ `config.json` → `routing` / `models`
- **เปลี่ยน concurrency / lease:** `config.json` → `concurrency`, `leaseMs`
- **executor อื่น:** เปลี่ยน `executor.command`/`baseArgs` (เช่นชี้ไป API gateway ของคุณเอง)

---

## ข้อจำกัดที่รู้ตัว

- lock เป็น single-host (busy-wait บน lock file) — เหมาะกับเครื่องเดียวหลาย worker process.
  ถ้าจะกระจายหลายเครื่องจริง ต้องเปลี่ยน `state.json` เป็น DB/Redis ที่มี atomic CAS.
- agent ที่ dispatch ไม่รู้ผลของกันและกันระหว่างทำ wave เดียว (independent) — DAG จึงต้องจัด deps
  ให้งานที่ต้องเห็นผลกัน **อยู่คนละ wave**. backlog ปัจจุบันจัดไว้แล้ว.
- ไม่ verify เองว่า acceptance ผ่านจริง — `done` ปัจจุบัน = "ทำจบ" (exit/มี output/ไม่ BLOCKED)
  ไม่ใช่ "ผ่าน". **กำลังจะแก้ด้วย Verify Gate** (reviewer agent อิสระตรวจ output เทียบ acceptance
  ก่อน mark done) — ดู spec + ADR: [`docs/SPEC--VERIFY-GATE.md`](docs/SPEC--VERIFY-GATE.md),
  [`docs/ADR-O-001--verify-gate.md`](docs/ADR-O-001--verify-gate.md) *(สถานะ: Proposed, ยังไม่ implement)*
