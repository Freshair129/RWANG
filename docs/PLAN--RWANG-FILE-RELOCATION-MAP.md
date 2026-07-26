---
version: "0.1.1b"
created_at: "2026-07-26T15:55:00+07:00,ATHER,pending"
last_update: "2026-07-26T23:08:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "rwang-architecture"
  doc_type: "relocation-plan"
  scope: "Current-file to target-location mapping for unified RWANG repository"
  language: "en"
---

# Plan - RWANG File Relocation Map

## 1. Purpose

This document maps the **current live RWANG implementation tree** to the target unified repository structure so migration work can be scoped surgically instead of moving files ad hoc.

## 2. Mapping rules

1. This map is directional guidance, not permission to move every file in one PR.
2. A target location indicates ownership intent, not mandatory immediate renaming.
3. Generated/runtime artifacts should be removed from source control paths or isolated, not re-homed as first-class source.
4. `GoVibe` and target repositories are not part of this relocation map.
5. `examples/govibe/*`, if present in the destination repo, are example integrations only and must not become a shadow copy of the real `GoVibe` source tree.

## 3. Top-level runtime files

| Current path | Target home | Reason |
|---|---|---|
| `README.md` | `README.md` | canonical repository entrypoint |
| `engine.mjs` | `packages/core/*` plus temporary top-level compatibility shell | execution-kernel logic |
| `server.mjs` | `orchestrator/runner/*` or operator API assembly | runtime/operator surface, not contracts |
| `providers.mjs` | `adapters/worker/*` plus shared adapter helpers in `packages/adapters/*` | worker-provider implementation surface |
| `planner.mjs` | `packages/core/*` or `orchestrator/routing/*` | routing/planning logic |
| `session-leases.mjs` | `orchestrator/state/*` or `packages/core/*` | execution/session ownership |
| `accounts.mjs` | `adapters/worker/*` or provider-account support module | provider/runtime support |
| `accounts-admin.mjs` | `orchestrator/runner/*` admin surface | operational control, not pure core |
| `account-identity.mjs` | `packages/contracts/*` or worker support utilities | identity shape and normalization |
| `worker-io.mjs` | `packages/core/*` or `adapters/worker/*` | worker artifact I/O helper |
| `image.mjs` | `adapters/worker/*` | provider-specific execution support |
| `ollama-vram.mjs` | `adapters/worker/*` | provider-specific resource helper |
| `runs-reader.mjs` | `orchestrator/state/*` | runtime observation surface |
| `chain-verify.mjs` | `orchestrator/verification/*` | verification surface |
| `config.json` | temporary root until config packaging is designed | active runtime config |
| `backlog.json` | temporary root or future fixture/example path after ProjectAdapter extraction | current local task source |
| `state.json` | runtime data, not long-term canonical source | mutable runtime state |

## 4. Orchestrator tree

| Current path group | Target home | Reason |
|---|---|---|
| `orchestrator/run.js` | `orchestrator/runner/*` | runtime entrypoint assembly |
| `orchestrator/route.py` | `orchestrator/routing/*` | deterministic routing surface |
| `orchestrator/progress.py` | `orchestrator/state/*` | durable runtime-state update surface |
| `orchestrator/check_evidence.py` | `orchestrator/verification/*` | deterministic verification |
| `orchestrator/cost_estimate.py` | `orchestrator/routing/*` or `orchestrator/state/*` | routing/cost support |
| `orchestrator/cost_ledger.py` | `orchestrator/state/*` | cost state tracking |
| `orchestrator/ollama_route.sh` | `orchestrator/routing/*` | provider-specific route helper |

## 5. Governance subtree

| Current path group | Target home | Reason |
|---|---|---|
| `orchestrator/governance/*.py` | `orchestrator/governance/*` and `orchestrator/verification/*` split by role | deterministic governance and gate tooling |
| `orchestrator/governance/*.md` | `docs/governance/*` if canonical docs, else keep beside scripts only if truly operational | separate canonical docs from script-local notes |
| `orchestrator/governance/governance.yaml` | `orchestrator/governance/*` | active runtime policy data |
| `orchestrator/governance/event_schema.json` | `packages/contracts/*` or governance schema home | schema-like shared contract |
| `orchestrator/governance/claude_settings.hook.json` | `orchestrator/governance/*` | runtime integration config |

## 6. Generated/runtime artifacts that should not become canonical source

| Current path group | Target handling |
|---|---|
| `orchestrator/governance/approvals/*.json` | treat as runtime/generated data; exclude or isolate |
| `orchestrator/governance/approvals/consumed.ndjson` | treat as runtime/generated data |
| `orchestrator/governance/approvals/used/*` | treat as runtime/generated data |
| `orchestrator/**/__pycache__/*` | generated cache; exclude |
| `runs/*` | runtime data; keep out of canonical source except curated fixtures |
| `state.json` | runtime data; not canonical source |

## 7. Adapters tree

| Current path | Target home | Reason |
|---|---|---|
| `adapters/desktop-motion/gesture-command-intent.mjs` | `adapters/worker/*` or `adapters/project/*` only if the contract proves that concern; otherwise keep under `adapters/desktop-motion/*` as a bounded adapter package | bounded adapter implementation |
| `adapters/host-skills/registry.json` | `adapters/project/*` or shared adapter registry area | external-source adapter registry |

## 8. Tests

| Current path | Target home | Reason |
|---|---|---|
| `tests/runtime-import.test.mjs` | integration/runtime test area | runtime survivability |
| `tests/server-account-api.test.mjs` | orchestrator/operator API test area | runtime API behavior |
| `tests/session-affinity.test.mjs` | routing/state integration test area | execution/session policy |
| `tests/gesture-command-intent.test.mjs` | adapter contract test area | adapter-boundary proof |
| `tests/host-skill-registry.test.mjs` | adapter registry test area | registry integrity |

## 9. Monitor and scripts

| Current path | Target home | Reason |
|---|---|---|
| `monitor/monitor.html` | `monitor/*` or future `apps/monitor/*` | operator surface, not kernel core |
| `scripts/*.ps1` | `scripts/*` or future `orchestrator/runner/scripts/*` if tightly runtime-bound | helper launch scripts, not package contracts |

## 10. Documents and meta files

| Current path | Target home | Reason |
|---|---|---|
| `docs/*` | `docs/*`, later categorized under architecture/governance/RFC/change-requests | canonical design truth |
| `specs/*` | `specs/*` | task/spec truth |
| `AGENTS.md`, `CLAUDE.md`, `AUTONOMY.md`, `USERFLOW.md` | keep at root until instruction-governance cleanup is approved | repo-level operating guidance |

## 11. First extraction candidates

These are the safest first extraction targets after Phase A bootstrap:

1. `packages/contracts`
   Current likely inputs:
   - account/task/session identity shapes
   - adapter interfaces
   - event/verification reference schemas
   - governance event schema

2. `packages/core`
   Current likely inputs:
   - reusable execution-kernel logic from `engine.mjs`
   - planner/routing helpers not tied to a specific provider or operator surface

3. `adapters/worker`
   Current likely inputs:
   - provider-specific logic from `providers.mjs`, `image.mjs`, `ollama-vram.mjs`

## 12. Non-goals

- This map does not authorize moving `GoVibe` into RWANG.
- This map does not authorize moving target repositories into RWANG.
- This map does not authorize copying `G:\govibe` source into `examples/govibe/*`.
- This map does not authorize a full package split in one PR.
- This map does not treat generated caches or approvals as permanent source.

## 13. Acceptance criteria

- Every high-value current file has an intended ownership destination.
- Generated/runtime artifacts are explicitly called out as non-canonical source.
- The map supports phased migration rather than big-bang movement.
- The map preserves the product boundary between RWANG and GoVibe.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.1b | 2026-07-26 | beta | Clarified that any `examples/govibe/*` path is example-only and not a copy target for the external GoVibe repository. | pending | ATHER |
| 0.1.0b | 2026-07-26 | beta | Initial current-to-target relocation map for unified RWANG repository. | pending | ATHER |
