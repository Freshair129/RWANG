---
version: "0.1.0b"
created_at: "2026-07-26T17:10:00+07:00,ATHER,pending"
last_update: "2026-07-26T17:10:00+07:00,ATHER"
status: "candidate"
superseded_by: null
attributes:
  domain: "rwang-architecture"
  doc_type: "migration-baseline"
  scope: "Wave 1 freeze and baseline evidence for RWANG repository unification"
  language: "en"
---

# Baseline - RWANG Repository Unification Wave 1

## 1. Purpose

This document records the pre-import repository identities, revision boundaries,
dirty-state constraints, executable baseline, and known rehearsal failures for
Wave 1 of the RWANG repository unification.

Wave 1 is documentation and baseline evidence only. It does not import runtime
code, restructure packages, modify GoVibe, or modify a target repository.

## 2. Repository baseline

| Role | Checkout | Origin | Recorded HEAD |
|---|---|---|---|
| Canonical destination | `D:\rwang\RWANG` | `https://github.com/Freshair129/RWANG.git` | `c2f071d6425a3a4ee7d73de8c7b9dd2ba14b77c8` |
| Runtime source | `G:\Rwang` | `https://github.com/Freshair129/Rwang-orchestrator.git` | `5663aa5927142eab73a170115dfd0e92ad188f56` |

The canonical destination is the only approved destination identity. GoVibe,
GenesisBlock, G-Maiden, Motion Lab, and other target repositories remain
external consumers or targets.

## 3. Dirty-state boundary

At capture time, neither owner checkout was clean.

Canonical destination changes:

- modified `docs/SPEC--RWANG-STANDALONE-GOVERNANCE-FRAMEWORK.md`
- untracked `docs/SPEC--LOCAL-MODEL-BENCHMARK.md`

Runtime source status contained 54 changed or untracked paths, including runtime,
tests, migration documents, benchmark documents, and local RCA evidence.

Migration automation must not stage, overwrite, or absorb those owner changes.
A clean clone or isolated worktree is required for every migration rehearsal and
PR artifact.

## 4. Executable source baseline

Command:

```powershell
node --test tests/runtime-import.test.mjs tests/host-skill-registry.test.mjs tests/gesture-command-intent.test.mjs
```

Result captured from `G:\Rwang` at the recorded source HEAD:

- exit code: `0`
- tests: `5`
- passed: `5`
- failed: `0`

This source baseline does not imply that the pre-import canonical destination
already contains the runtime test files.

## 5. Known Wave 2 rehearsal failures

Rehearsal artifact `3ec4a8a95e0cdfbc6ea6fcb8f2733db53fbf6117`
is retained as non-promotable evidence only.

Known blockers:

1. It imports source parent `73fea6b`, which is 10 commits behind the recorded
   source HEAD.
2. It combines 163 changed paths and 22,582 insertions across history import,
   runtime changes, package restructuring, and generated/local agent material.
3. It tracks agent memory/session/RCA content and generated `runs/pr-body*.md`
   files that require exclusion or explicit owner approval.
4. `pnpm run test:integration` exits `1` because
   `tests/server-account-api.test.mjs` and
   `tests/session-affinity.test.mjs` are referenced but absent.
5. Four generated handoff artifacts remain untracked in the rehearsal worktree.

These failures do not block the docs-only Wave 1 decision record. They block
promotion of the rehearsal artifact and must be resolved before Wave 2.

## 6. Wave 1 acceptance criteria

- Only `docs/**` migration decision, plan, relocation map, and baseline evidence
  are changed against canonical `origin/main`.
- The canonical destination and runtime source origins and SHAs are recorded.
- Dirty owner changes are listed and remain untouched.
- The source baseline command passes with the recorded result.
- Known Wave 2 failures remain visible and are not reclassified as passes.
- No runtime, package, GoVibe, or target-repository path is changed.
- The Wave 1 review worktree contains no generated delivery artifacts.

## 7. Verification commands

```powershell
$expected = @(
  'docs/BASELINE--RWANG-REPOSITORY-UNIFICATION-WAVE1-2026-07-26.md'
  'docs/CR--RWANG-REPOSITORY-UNIFICATION.md'
  'docs/PLAN--RWANG-FILE-RELOCATION-MAP.md'
  'docs/PLAN--RWANG-REPOSITORY-UNIFICATION-MIGRATION.md'
)
$actual = @(git status --porcelain=v1 |
  ForEach-Object { $_.Substring(3).Replace('\', '/') } |
  Sort-Object)
$unexpected = @($actual | Where-Object { $_ -notin $expected })
$missing = @($expected | Where-Object { $_ -notin $actual })
if ($unexpected.Count -ne 0 -or $missing.Count -ne 0) {
  throw "Wave 1 scope mismatch. Unexpected=$unexpected Missing=$missing"
}
git -C G:\Rwang remote get-url origin
git -C G:\Rwang rev-parse HEAD
git -C D:\rwang\RWANG remote get-url origin
git -C D:\rwang\RWANG rev-parse HEAD
node --test G:\Rwang\tests\runtime-import.test.mjs G:\Rwang\tests\host-skill-registry.test.mjs G:\Rwang\tests\gesture-command-intent.test.mjs
```

The scope gate must return without throwing, and the final command must exit
`0`.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-07-26 | candidate | Recorded Wave 1 repository identities, dirty-state boundary, source baseline, and known Wave 2 rehearsal failures. | pending | ATHER |
