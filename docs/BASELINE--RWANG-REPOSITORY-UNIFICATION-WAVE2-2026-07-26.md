---
version: "0.1.1b"
created_at: "2026-07-26T18:05:00+07:00,ATHER,pending"
last_update: "2026-07-26T19:23:31+07:00,ATHER"
status: "candidate"
superseded_by: null
attributes:
  domain: "rwang-architecture"
  doc_type: "migration-baseline"
  scope: "Wave 2 history-preserving runtime import evidence"
  language: "en"
---

# Baseline - RWANG Repository Unification Wave 2

## 1. Objective

Wave 2 imports the committed `Rwang-orchestrator` runtime history into the
canonical `RWANG` repository without absorbing dirty owner worktrees, GoVibe,
target repositories, provider secrets, or generated runtime state.

## 2. Import boundary

| Role | Revision |
|---|---|
| Wave 1 parent | `461990a` |
| Canonical base | `c2f071d6425a3a4ee7d73de8c7b9dd2ba14b77c8` |
| Imported runtime source | `5663aa5927142eab73a170115dfd0e92ad188f56` |
| Source repository | `https://github.com/Freshair129/Rwang-orchestrator.git` |
| Canonical repository | `https://github.com/Freshair129/RWANG.git` |

The source revision is the committed local source tip recorded by Wave 1. The
54 modified or untracked paths in the owner source checkout were not imported.

## 3. History strategy

The import uses an unrelated-history merge so the final Wave 2 commit has both:

1. the canonical Wave 1 lineage; and
2. `5663aa5` as the runtime-history parent.

This preserves `git log --follow` history for runtime files while allowing
conflicts to be resolved according to canonical ownership.

## 4. Conflict decisions

| Surface | Resolution |
|---|---|
| Canonical README and repository instructions | preserve canonical authority |
| `engine.mjs`, `planner.mjs` | committed runtime source; package extraction is deferred |
| `server.mjs`, `config.json` | committed runtime source |
| account, backlog, chain, and run-reader modules | preserve canonical versions; source differences were identical data or mojibake-only comments |
| `store/knowledge.mjs` | preserve canonical implementation required by canonical tests |
| standalone governance framework | import source `0.7.0 active` owner-approved contract |
| `.gitignore` | union canonical and runtime local-state, secret, cache, session, skill-checkout, and agent-memory exclusions |

## 5. Excluded generated and local state

The Wave 2 tree excludes:

- `.agents/**/.brain/**`
- `.agents/**/MEMORY.md`
- `runs/*` except `runs/.gitkeep`
- `state.json`
- provider approval tokens and caches
- nested checkouts and gitlinks
- embedded GoVibe and target-repository source trees

Source-controlled agent definitions and deterministic skill scripts remain
reviewable source; local agent memory and sessions do not. External consumer
and target path references remain configuration inputs or examples. Wave 3
normalizes RWANG-owned runtime defaults without embedding those repositories.

## 6. Acceptance criteria

- The Wave 2 commit has the Wave 1 commit and source tip `5663aa5` as parents.
- `git merge-base --is-ancestor 5663aa5 HEAD` succeeds.
- Runtime history is traversable with `git log --follow`.
- Runtime entrypoints import and the server smoke starts successfully.
- The complete JavaScript suite passes.
- Governance contract and chain self-tests pass.
- No generated agent memory, runtime state, embedded GoVibe source tree,
  embedded target source tree, gitlink, or provider secret is introduced.
- Canonical and runtime local-state exclusions both remain effective.
- The owner checkouts at `G:\Rwang` and `D:\rwang\RWANG` remain untouched.

## 7. Verification commands

```powershell
git rev-list --parents -n 1 HEAD
git merge-base --is-ancestor 5663aa5927142eab73a170115dfd0e92ad188f56 HEAD
git log --follow -- engine.mjs
$tests = @(rg --files -g '*.test.mjs' -g '!node_modules/**')
node --test @tests
py -3 orchestrator/governance/contract_selftest.py
py -3 orchestrator/governance/chain_selftest.py
git ls-files -s | Select-String '^160000 '
git ls-files | Select-String '^(govibe|GenesisBlock|G-Maiden)(/|$)'
git ls-files -- brain/failures.jsonl store/.accounts-state.json accounts.local.json
git check-ignore --no-index -- .env accounts.local.json brain/failures.jsonl store/.accounts-state.json runs/example/progress.json .agents/agt/MEMORY.md
git status --short
```

Recorded pre-commit results:

- JavaScript tests: `219 passed`, `0 failed`
- governance contract self-test: `8 passed`, `0 failed`
- governance chain self-test: `5 passed`, `0 failed`
- embedded-tree, gitlink, secret, and generated-state checks: `PASS`

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-07-26 | candidate | Preserved the canonical similarity API, united local-state exclusions, and narrowed boundary claims to tracked source trees. | pending | ATHER |
| 0.1.0b | 2026-07-26 | candidate | Recorded the history-preserving import boundary, conflict decisions, exclusions, and verification evidence. | pending | ATHER |
