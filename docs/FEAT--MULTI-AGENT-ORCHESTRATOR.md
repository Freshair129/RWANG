---
version: "0.1.0b"
created_at: "2026-06-24T05:20:00+07:00,ATHER,pending"
last_update: "2026-06-24T05:20:00+07:00,ATHER"
status: "candidate"
superseded_by: null
attributes:
  domain: "orchestration"
  doc_type: "feature-specification"
  scope: "G-Orchestra multi-agent orchestrator feature"
  language: "th"
---

# FEAT--MULTI-AGENT-ORCHESTRATOR

## 1. Feature Summary

`G-Orchestra` คือ feature/tooling layer สำหรับคุม multi-agent build workflow ของ `G-Maiden`
โดยใช้ backlog แบบ DAG, worker pool, provider routing, live logs, usage tracking, และ UI สำหรับ monitor/supervise

## 2. User Jobs

| User | Job |
| --- | --- |
| Developer | ดูว่างานไหน ready, claimed, running, reviewing, failed หรือ done |
| Operator | ปล่อย run wave / auto run / stop / reset ได้จาก UI |
| Builder | เห็น dependency waves เพื่อรู้ว่างานไหนทำคู่ขนานได้ |
| Reviewer | ตรวจ log, review state, needs-rework, failed และ escalation |

## 3. Core Surfaces

| Surface | Purpose |
| --- | --- |
| List Monitor | แสดง task rows จาก `backlog.json` พร้อม deps, status, model, actions |
| Waves / DAG | แสดง topological waves และ dependency edges |
| Agent Room | แสดง live worker tiles และ stream logs จาก `/api/log` |
| Provider/Auth Bar | แสดง Claude plan/API key mode, Ollama status, provider readiness |
| Usage Cards | แสดง current session / weekly usage จาก `usage.jsonl` |
| Command Controls | Run wave, auto, stop, reset, dispatch, assign model |

## 4. State Model

| State | Meaning |
| --- | --- |
| `todo` | Task exists but dependencies may not be done yet |
| `ready` | Dependencies are done and task can be claimed/started |
| `claimed` | Worker reserved the task |
| `running` | Worker is actively executing |
| `reviewing` | Output is under verify-gate review |
| `needs-rework` | Review failed but can be reworked |
| `done` | Task is completed |
| `failed` | Task failed or escalated |

## 5. Acceptance Criteria

- [ ] UI opens from `node server.mjs --port 4577`.
- [ ] `/api/state` returns progress, task list, waves, provider/auth, pool, and usage data.
- [ ] List Monitor renders all tasks from current backlog/state.
- [ ] Waves / DAG renders dependency graph.
- [ ] Agent Room renders live tiles or an empty state.
- [ ] UI does not overflow horizontally on 390px mobile viewport.
- [ ] Commands that spend tokens or mutate state require explicit click/confirmation.
- [ ] Tool remains under `orchestration/` and is not promoted into `src/src/App.tsx`.

## 6. Related Docs

- [SRS--G-ORCHESTRA.md](SRS--G-ORCHESTRA.md)
- [g-orchestra-ui-sitemap-flow-board.md](g-orchestra-ui-sitemap-flow-board.md)
- [ADR-O-001--verify-gate.md](ADR-O-001--verify-gate.md)
- [ADR-O-005--provider-registry.md](ADR-O-005--provider-registry.md)

---

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0b | 2026-06-24 | candidate | Initial feature spec for the G-Orchestra multi-agent orchestrator. | pending | ATHER |
