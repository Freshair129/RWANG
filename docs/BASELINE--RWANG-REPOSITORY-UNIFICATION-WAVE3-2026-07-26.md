---
version: "0.1.1b"
created_at: "2026-07-26T00:00:00+07:00,ATHER,pending"
last_update: "2026-07-26T19:42:00+07:00,ATHER"
status: "candidate"
superseded_by: null
attributes:
  domain: "rwang-architecture"
  doc_type: "migration-baseline"
  scope: "Wave 3 repository-relative runtime path compatibility"
  language: "en"
---

# Baseline - RWANG Repository Unification Wave 3

## 1. Objective

Make RWANG-owned runtime defaults repository-relative and add stable root
verification commands without changing external consumer or target-repository
boundaries.

## 2. Scope

Allowed files for this slice are `package.json`, `server.mjs`,
`orchestrator/run.js`, `orchestrator/governance/claude_settings.hook.json`,
`orchestrator/progress.py`, `orchestrator/governance/governance.yaml`,
`orchestrator/governance/restart_prompt.md`,
`orchestrator/governance/tool_guard.py`, `tests/runtime-import.test.mjs`, and
this evidence document. The approved dependencies are Wave 2 `8726b42` and the
Wave 1 migration plan.

Forbidden surfaces include `config.json` target paths, GoVibe files, historical
documentation, provider/account/secret logic, store modules, generated state,
lockfiles, and owner worktrees outside this named worktree.

## 3. Changes

- `server.mjs` derives the default `runs` directory from its module root and
  preserves `RWANG_RUNS_DIR` as an explicit override.
- Active `orchestrator/run.js` prompts and command instructions use the
  repository root rather than a machine-specific `G:/Rwang` path.
- Operational progress, restart, governance, and guard instructions no longer
  emit machine-specific RWANG paths.
- The Claude governance hook invokes `tool_guard.py` with a repository-relative
  command that is valid when applied from the repository root.
- `package.json` exposes `test`, `runtime:smoke`, and `verify` scripts without a
  new package manager or dependency. The Windows verification script uses the
  existing `py -3` launcher because `python` is not on this machine's PATH.
- Runtime compatibility tests assert the default-path shape, root-relative
  runner instructions, and hook command.

External consumer and target-repository paths remain inputs or examples; this
slice does not move, vendor, or modify those repositories.

## 4. Risks and assumptions

Risk is MEDIUM because the server path default and workflow command context are
runtime behavior. The workflow runner starts commands from the RWANG repository
root, and callers that need a non-default run directory continue to use
`RWANG_RUNS_DIR` or the existing run arguments.

## 5. Acceptance evidence

The following commands are the Wave 3 verification contract and are recorded
after execution:

```powershell
npm test
npm run runtime:smoke
npm run verify
node --test tests/runtime-import.test.mjs
git diff --check
rg -n --glob '!docs/**' --glob '!config.json' 'G:[/\\]Rwang' server.mjs orchestrator package.json tests
```

Recorded results:

- `npm test`: PASS, 221 tests passed and 0 failed.
- `npm run runtime:smoke`: PASS, 7 tests passed and 0 failed.
- `npm run verify`: PASS, including contract 8/8, chain 5/5, W3 review, and W4 gate checks.
- `node --test tests/runtime-import.test.mjs`: PASS, 4 tests passed and 0 failed.
- `git diff --check`: PASS.
- The active allowed surfaces `server.mjs`, `orchestrator`, `package.json`,
  and `tests` contain no `G:/Rwang` reference.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-07-26 | candidate | Covered active progress, restart, governance, and guard instructions in the repository-relative path boundary. | pending | ATHER |
| 0.1.0b | 2026-07-26 | candidate | Defined the bounded Wave 3 path-compatibility scope and evidence contract. | pending | ATHER |
