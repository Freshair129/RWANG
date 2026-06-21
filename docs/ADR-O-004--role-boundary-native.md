# ADR-O-004 — Role boundary: G-Orch เสริม Claude Code native teams (ไม่ reimplement Layer-1)

> **Series:** ADR-O (orchestrator-scoped)
> **Status:** Approved (2026-06-21, USER/Boss · RUNBOOK Gate 3)
> **Date:** 2026-06-21
> **Related:** [ADR-O-001](ADR-O-001--verify-gate.md) (Verify Gate), [ADR-O-002](ADR-O-002--govibe-integration.md)
> (GoVibe integration), [ADR-O-003](ADR-O-003--backend-store.md) (GenesisDB backend),
> [SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP.md](SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP.md)
> **Governing model:** `G:\govibe\.agents\RUNBOOK-GoVibe-Multi-Agent.md` (GVDOC-3001)

---

## Context

RUNBOOK (GVDOC-3001) วาง operating model เป็น 2 ชั้น: **Layer 1 (Native Teams, in-session)** +
**Layer 2 (3 Pillars: GitHub/GoVibe/GenesisBlockDB, cross-session)**.

ตรวจสอบกับความสามารถ **native ปัจจุบันของ Claude Code** พบว่า Layer 1 ของ RUNBOOK **เกือบทั้งหมดเป็น
ฟีเจอร์ native จริง** ไม่ใช่ของที่ต้องสร้างเอง:

- Agent Teams (lead + teammates) — native (experimental, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
- Shared Task List (Ctrl+T) — native, file-based ที่ `~/.claude/tasks/{team}/` + file-locking + deps + self-claiming
- `TaskCreated` / `TaskCompleted` / `TeammateIdle` hooks — native (exit 2 = block + feedback)
- Plan Mode / headless `-p` + stream-json — native

ที่ **ไม่ใช่ native** (ต้อง custom): task-type→model routing, cross-vendor (Anthropic+Google+Qwen),
Ollama local, independent-reviewer Verify Gate, anti-error loop (GenesisDB), cost ledger/caps, web UI.

**ข้อแก้ที่ต้องบันทึก:** RUNBOOK §3.1 "Delegate Mode (Shift+Tab) ล็อก Lead เป็น PM-only (ไม่มี Bash/Edit)"
— **ไม่ใช่ฟีเจอร์ native**; lead เป็น full coding agent เสมอ. ถ้าต้องการ PM-only จริงต้อง enforce เองด้วย
subagent ที่จำกัด `tools`.

ผลคือ G-Orch (ที่สร้าง shared-task-list / claim-lease / dependency-gating / "hook ตอนจบงาน" เอง)
**ทับซ้อนกับ native**. ต้องนิยามขอบเขตให้ชัดว่าอะไรเลิกทำเอง / อะไรเก็บไว้.

## Decision

**G-Orch วางตัวเป็น layer เสริม (complement) ไม่ใช่ทดแทน native** — แบ่งหน้าที่ตาม **โหมดการทำงาน**:

### ขอบเขตตามโหมด

| โหมด | เจ้าภาพ | เหตุผล |
| --- | --- | --- |
| **In-session interactive** (มนุษย์นั่งคุม, teammates คุยกัน) | **Claude Code native teams** | native ทำ task-list/claiming/locking/hooks/UI ได้ครบและใหม่กว่า |
| **Headless / cross-session / cross-vendor batch** | **G-Orch engine** | native teams เป็น in-session/one-team/no-nest/lead-fixed/Anthropic-only — เอื้อมไม่ถึงงาน batch ข้าม vendor |

### 3 ถัง — อะไรทำต่อ / อะไรหยุด

**🔴 ถัง A — หยุด reimplement สำหรับ in-session; เก็บไว้เฉพาะ headless mode**
ของพวกนี้ G-Orch มี แต่ native ทำได้แล้ว → **ห้ามขยาย/ทำ UI แข่ง native**. คงไว้เท่าที่จำเป็นต่อ headless
loop เท่านั้น (state.json/claim/lease/DAG ยังต้องใช้ตอนรัน pool แบบไม่มีมนุษย์):
- shared task list, self-claiming/file-lock, dependency gating, "hook ตอนจบงาน"
- **บริดจ์แทนการแข่ง:** เมื่ออยู่ in-session ให้ G-Orch **emit เข้า native** (สร้าง native task,
  ลงทะเบียน hook) ไม่ใช่เปิด UI/механизм ของตัวเองซ้อน

**🟢 ถัง B — เก็บและลงทุนต่อ (moat ของ G-Orch — native ทำไม่ได้)**
- task-type → model-tier routing (opus/sonnet/haiku) + **cross-vendor + Ollama local**
- **Verify Gate** (reviewer คนละ tier + needs-rework loop, ADR-O-001)
- **Anti-error loop (GenesisDB)** — พิสูจน์แล้ว (SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP)
- cost ledger + caps (USD), web Mission Control UI

**🟡 ถัง C — หยิบ native มาใช้แทนของเดิม**
- ใช้ **hooks framework เต็ม (23 events)** เป็นจุดเสียบ: `TaskCompleted` → เรียก Verify Gate;
  `TeammateIdle` → auto-assign งานถัดไป; `TaskCreated` → pre-dispatch gate (ADR-O-002 §4.3)
- ใช้ native file-locking/self-claiming เมื่อ in-session แทน `.state.lock` ของเราเอง

### G-Orch "ขับ" native ยังไง (bridge contract)
1. **Dispatch:** ใช้ native `claude -p --output-format stream-json` เป็น executor (ทำอยู่แล้ว) +
   ขยายให้ spawn เป็น native teammate ได้เมื่อ in-session
2. **Quality gate:** ลงทะเบียน `TaskCompleted` hook (settings.json) ที่เรียก Verify Gate + anti-error
   loop ของ G-Orch → exit 2 ถ้า fail (block completion + ส่ง issues กลับ)
3. **Knowledge:** anti-error loop (GenesisDB) ป้อน "❌ past mistakes" เข้า prompt ก่อน dispatch — ชั้นนี้
   เป็นของ G-Orch ล้วน ไม่มี native equivalent

### Dispatch model: branch → PR → review (ตามมติ + RUNBOOK Pillar 1)
เปลี่ยนจาก `--permission-mode acceptEdits` (แก้ไฟล์ตรง) เป็น **PR-as-handoff**:
- 1 task = 1 branch `GVBR-{n}-{slug}-{agent}` (git worktree isolation ต่อ agent กัน conflict)
- agent push → เปิด PR → **`TaskCompleted` hook รัน Verify Gate/Auditor** → human merge (role gate)
- ผูกกับ RUNBOOK §4.1 (Lead merges, Teammate ห้าม merge) — สิทธิ์ merge enforce ที่ branch protection

## Alternatives considered

| ทางเลือก | ทำไมไม่เลือก |
| --- | --- |
| **G-Orch = engine ของ Layer 1 (แทน native)** | reinvent task-list/claiming/locking/hooks ที่ native ทำได้+ใหม่กว่า; ต้องไล่ตาม native ตลอด |
| **ทิ้ง G-Orch ใช้ native ล้วน** | เสีย moat: cross-vendor, Ollama, Verify Gate, anti-error, cost-caps, web UI — native ไม่มี; native teams ยัง experimental + in-session เท่านั้น |
| **ไม่ตัดสิน ปล่อยทับซ้อน** | สอง task-list/lock แข่งกัน → state ขัด, งง source of truth |

## Consequences

**บวก:**
- เลิกไล่ตาม native; โฟกัสถัง B ที่เป็นคุณค่าจริง
- in-session ได้ UX native (Ctrl+T, hooks) ฟรี; headless ได้ engine ข้าม vendor ของ G-Orch
- `TaskCompleted` hook = จุดเสียบมาตรฐานสำหรับ Verify Gate + anti-error loop (ไม่ต้อง patch executor)
- dispatch branch→PR ปลอดภัยกว่า acceptEdits + ตรง RUNBOOK governance (human merge gate)

**ลบ / ต้นทุน:**
- ต้องดูแล 2 โหมด (in-session bridge vs headless engine) — boundary ต้องคมไม่ให้ task-list ชนกัน
- native Agent Teams ยัง **experimental** — bridge อาจต้องปรับเมื่อ API เปลี่ยน
- branch→PR ช้ากว่า acceptEdits ต่อ task (แต่ได้ governance + reviewable diff)
- ผูกกับ git/PR workflow (ต้องมี branch protection + CI)

## Compliance / กันพัง

- **ไม่ทำ UI/механизм ทับ native** เมื่อ in-session — emit เข้า native เท่านั้น
- **ถัง B ต้องรันได้ทั้ง 2 โหมด** (in-session ผ่าน hook, headless ผ่าน pool)
- Verify Gate (ADR-O-001) ยังเป็น regression gate; ตอนนี้เสียบผ่าน `TaskCompleted` hook ด้วย
- แก้ RUNBOOK §3.1 (Delegate Mode ไม่จริง) หรือ enforce PM-only ด้วย tool-restricted subagent
- zero-dep ของแกน (ADR-O-003 P1) ไม่กระทบ — bridge เป็น config/hook ไม่ลาก dependency

## Follow-ups

- เขียน `TaskCompleted` hook ที่เรียก Verify Gate + anti-error loop (settings.json)
- ปรับ executor: เพิ่มโหมด branch→PR (git worktree ต่อ task) ข้าง acceptEdits เดิม
- นิยาม bridge: G-Orch backlog task ↔ native task (`~/.claude/tasks/`) mapping สำหรับ in-session
- ทดสอบ native Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) ว่า bridge ได้จริง
- อัปเดต RUNBOOK §3.1 ให้ตรงความจริงของ native
