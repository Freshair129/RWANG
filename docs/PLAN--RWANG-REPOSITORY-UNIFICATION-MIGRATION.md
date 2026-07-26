---
version: "0.1.1b"
created_at: "2026-07-26T15:10:00+07:00,ATHER,pending"
last_update: "2026-07-26T21:20:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "rwang-architecture"
  doc_type: "migration-plan"
  scope: "Safe phased migration from Rwang-orchestrator into the canonical RWANG repository"
  language: "en"
---

# Plan - RWANG Repository Unification Migration

## 1. Purpose

This plan defines the safe migration path for consolidating `Freshair129/RWANG` and `Freshair129/Rwang-orchestrator` into one canonical `RWANG` repository without pulling `GoVibe` or target repositories into the same tree.

## 2. Preconditions

1. `Freshair129/RWANG` is approved as the destination repository.
2. Active runtime work in the current implementation checkout is checkpointed or explicitly carried into the migration branch.
3. The migration preserves history.
4. `GoVibe` remains external and is treated as a consumer during and after the migration.

## 3. Source-to-target mapping

| Current source | Target direction |
|---|---|
| `Rwang-orchestrator/engine.mjs`, `server.mjs`, `providers.mjs`, `config.json` | `RWANG` runtime/core surfaces, then later package/orchestrator split |
| `Rwang-orchestrator/orchestrator/*` | `RWANG/orchestrator/*` |
| `Rwang-orchestrator/monitor/*` | `RWANG/monitor/*` or later `RWANG/apps/monitor/*` |
| `Rwang-orchestrator/specs/*` | `RWANG/specs/*` |
| `Rwang-orchestrator/tests/*` | `RWANG/tests/*` |
| `Rwang-orchestrator/docs/*` | `RWANG/docs/*`, deduplicated by authority and status |
| `Rwang-orchestrator/adapters/*` | `RWANG/adapters/*` |

No source mapping in this plan targets:

- `govibe/*`
- `GenesisBlock/*`
- `G-Maiden/*`
- any other target repository tree

## 4. Migration sequence

### Wave 1 - Freeze and baseline

Objective:
Capture the current baseline and stop uncontrolled topology drift during migration setup.

Allowed files:

- migration notes in `RWANG/docs/*`
- baseline evidence files if explicitly scoped

Forbidden files:

- runtime code moves
- package restructuring
- GoVibe repository changes

Dependencies:

- approved unification decision

Acceptance criteria:

- destination repo and source repo are explicitly named
- baseline commands and known failures are recorded
- no runtime files have moved yet

Verification commands:

- `git remote -v`
- `git status --short`
- `node --test tests/runtime-import.test.mjs tests/host-skill-registry.test.mjs tests/gesture-command-intent.test.mjs`

Risk level:

- MEDIUM

Recommended worker:

- repository-aware Codex

### Wave 2 - History-preserving import

Objective:
Import the implementation repository into `RWANG` while preserving commit history.

Allowed files:

- imported runtime tree
- temporary compatibility scripts or notices

Forbidden files:

- GoVibe files
- external target repository files
- provider secrets

Dependencies:

- Wave 1

Acceptance criteria:

- runtime code exists in `RWANG`
- imported history is preserved
- no second RWANG implementation repository is required to inspect runtime truth
- a clean execution-clone workflow can produce a reviewable local migrated branch artifact without touching the owner’s primary canonical checkout

Verification commands:

- history-preserving import command chosen and documented
- `git log --follow` on imported runtime files
- runtime smoke/baseline tests rerun in destination repo
- `powershell -ExecutionPolicy Bypass -File .\scripts\execute-canonical-rwang-local-migration.ps1 -CreateLocalCommit`

Risk level:

- HIGH

Recommended worker:

- repository-aware Codex

### Wave 3 - Stable path compatibility

Objective:
Keep the runtime operational immediately after import, before deeper restructuring.

Allowed files:

- import paths
- npm/node/python helper scripts
- runtime docs tied directly to moved code

Forbidden files:

- broad package redesign beyond required compatibility

Dependencies:

- Wave 2

Acceptance criteria:

- existing entrypoints still run or have explicit compatibility wrappers
- baseline runtime tests pass or known failures are unchanged and documented

Verification commands:

- `node --test tests/runtime-import.test.mjs tests/host-skill-registry.test.mjs tests/gesture-command-intent.test.mjs`
- any additional entrypoint smoke commands adopted during import

Risk level:

- HIGH

Recommended worker:

- repository-aware Codex

### Wave 4 - Internal module restructuring

Objective:
Incrementally move toward the target tree without changing product boundaries.

Allowed files:

- `packages/*`
- `orchestrator/*`
- `adapters/*`
- runtime tests
- directly related docs

Forbidden files:

- GoVibe runtime/UI code
- target project code

Dependencies:

- Wave 3

Acceptance criteria:

- module ownership is clearer than before
- core does not import GoVibe
- adapters are not hardwired into core
- docs and runtime references point to the unified repo

Verification commands:

- runtime/import tests
- package-level tests introduced by the restructure
- grep or static checks for forbidden cross-boundary imports

Risk level:

- HIGH

Recommended worker:

- repository-aware Codex

### Wave 5 - Consumer rebind and old-repo deprecation

Objective:
Point consumers and documentation at the unified repository and retire the old implementation repo.

Allowed files:

- compatibility notices
- README/deprecation notices
- example consumer references

Forbidden files:

- folding consumers into RWANG

Dependencies:

- Wave 4

Acceptance criteria:

- `GoVibe` references the unified RWANG boundary, not the old split identity
- old repository has a clear deprecation/archive path
- consumers remain external

Verification commands:

- grep repo references for old identity
- manual review of consumer-facing docs and examples

Risk level:

- MEDIUM

Recommended worker:

- repository-aware Codex

## 5. Explicit non-goals

- Merge `GoVibe` into `RWANG`
- Merge target repositories into `RWANG`
- Rewrite the runtime into a single language
- Commit live `runs/` history as source-of-truth artifacts
- Turn docs into the runtime state store

## 6. Verification gate

At minimum, every migration wave that changes code or runtime paths must report:

- changed paths;
- preserved or intentionally changed entrypoints;
- baseline test results;
- known unchanged failures;
- any new migration-only compatibility shim introduced.

## 7. Completion condition

The migration is complete when:

1. `RWANG` is the single canonical repository for architecture and runtime.
2. `Rwang-orchestrator` is no longer needed as a separate active implementation home.
3. `GoVibe` remains external and consumes RWANG through an explicit boundary.
4. Target repositories remain external.
5. The unified repository preserves runtime truth, issue/CR traceability, and verification history in one place.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.1b | 2026-07-26 | beta | Added reviewable local migrated-branch artifact as a Wave 2 proof point for safe execution-clone migration. | pending | ATHER |
| 0.1.0b | 2026-07-26 | beta | Initial safe migration plan for unifying RWANG and Rwang-orchestrator. | pending | ATHER |
