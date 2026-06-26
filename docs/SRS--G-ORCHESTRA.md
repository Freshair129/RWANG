---
version: "0.1.0b"
created_at: "2026-06-24T05:20:00+07:00,ATHER,pending"
last_update: "2026-06-24T05:20:00+07:00,ATHER"
status: "candidate"
superseded_by: null
attributes:
  domain: "orchestration"
  doc_type: "software-requirements-specification"
  scope: "G-Orchestra multi-agent orchestrator"
  language: "th"
---

# SRS--G-ORCHESTRA

## 1. Scope

`G-Orchestra` คือ internal multi-agent orchestration system ภายใต้ `orchestration/`
ใช้สำหรับแตกงานจาก backlog, route งานตาม role/model/provider, คุม worker pool,
ติดตาม state/log/usage และเปิด UI สำหรับ monitor หรือสั่งงาน agent ระหว่างพัฒนา `G-Maiden`

ไม่ใช่ player-facing product และไม่เป็นส่วนหนึ่งของ Tauri runtime ที่ผู้ใช้ปลายทางติดตั้ง

## 2. Source Files

| Area | File |
| --- | --- |
| Engine / queue logic | `engine.mjs` |
| CLI | `orchestrator.mjs` |
| Web UI server | `server.mjs` |
| Web UI | `public/index.html` |
| Task source | `backlog.json` |
| Runtime state | `state.json` |
| Routing/providers | `config.json`, `providers.mjs` |
| Usage accounting | `usage.jsonl`, `cost-meter.mjs`, `savings-report.mjs` |
| Logs | `logs/` |

## 3. Functional Requirements

| ID | Requirement |
| --- | --- |
| SRS-O-001 | System shall load task definitions from `backlog.json` and expose status through CLI and `/api/state`. |
| SRS-O-002 | System shall enforce dependency gating before a task is claimable or dispatchable. |
| SRS-O-003 | System shall support atomic claim semantics via a local lock file for single-host worker pools. |
| SRS-O-004 | System shall reclaim stale claimed tasks after the configured lease window. |
| SRS-O-005 | System shall route task types to roles, then resolve roles to providers/models from `config.json`. |
| SRS-O-006 | System shall support manual task control: claim, done, fail, release, assign, dispatch, reset. |
| SRS-O-007 | System shall support pool execution modes for run wave and auto run. |
| SRS-O-008 | System shall expose task logs through `/api/log` for UI streaming and modal review. |
| SRS-O-009 | System shall display provider/auth state and usage/cost summaries in the UI. |
| SRS-O-010 | System shall surface review-gate states such as reviewing, needs-rework, failed, and blocked output. |

## 4. Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-O-001 | Orchestrator must remain internal/dev-only and must not ship inside the player-facing app installer. |
| NFR-O-002 | Web UI must remain usable on desktop and narrow mobile viewports without horizontal overflow. |
| NFR-O-003 | Local state files must tolerate UTF-8 BOM in JSON input where practical. |
| NFR-O-004 | Commands that spend real tokens or mutate state must remain explicit user actions. |
| NFR-O-005 | Provider secrets must not be written into docs, logs, or committed config. |

## 5. Related Docs

- [FEAT--MULTI-AGENT-ORCHESTRATOR.md](FEAT--MULTI-AGENT-ORCHESTRATOR.md)
- [g-orchestra-ui-sitemap-flow-board.md](g-orchestra-ui-sitemap-flow-board.md)
- [SPEC--VERIFY-GATE.md](SPEC--VERIFY-GATE.md)
- [SPEC--PROVIDER-REGISTRY.md](SPEC--PROVIDER-REGISTRY.md)
- [GUIDE--ADDING-PROVIDER.md](GUIDE--ADDING-PROVIDER.md)

---

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0b | 2026-06-24 | candidate | Initial SRS for the G-Orchestra multi-agent orchestrator. | pending | ATHER |
