## Summary

Second rollout step of RFC--RESOLUTION-GRADIENT-CONTEXT-BRIEF (RFC §5 Phase 2): graded resolution goes from two tiers (FULL/MENTION, Phase 1) to the full four the origin design specified.

- `orchestrator/governance/resolution_gradient.py` — full `FULL → SUMMARY → SKELETON → MENTION` cascade: each atom lands at the highest tier that fits the remaining budget, demoting down the ladder as it tightens (RFC D4); MENTION stays the floor (never drops lower, even at the cost of reporting overflow). `tokens_summary`/`tokens_skeleton` derive from `tokens_full` (ratio + clamp into the RFC D3 token ranges) when a caller doesn't supply a real rendered size. Added `parse_atom()`/`render_summary()`/`render_skeleton()` — pure markdown-parse renderers over the GKS atom format (frontmatter + H1 title + `### Section` headings + Description first paragraph), no model call, so they stay in the deterministic core. New `render SUMMARY|SKELETON <atom.md>` CLI subcommand. `--self-test` rewritten for the cascade + new renderer fixtures; verified against real atoms in `D:/rwang/RWANG/gks/atoms`.
- `orchestrator/run.js` — context-brief agent now renders each atom at its assigned tier (FULL inline, SUMMARY/SKELETON via `resolution_gradient.py render`, MENTION as an index entry) instead of the Phase-1 FULL/MENTION-only split; executor prompt's graded-brief description updated to match.

**Note on RFC D3's own gate:** RFC D3 gates SUMMARY/SKELETON on expand() telemetry showing ≥20% of MENTION atoms get promoted; no run has produced that telemetry yet (Phase 1 has never run in anger — `runs/` has no expand() records). Shipped anyway per owner direction — D3 already scopes this as additive, no-re-architecture work, so the 20% figure is a ship-decision signal to revisit later, not a build-blocker.

Branched off `2b6d6a7` (the real Phase 1 tip on `feat/resolution-gradient-phase1`, currently PR #1), not the stray WIP commit that had landed on top of it with unrelated files from another project.

## Also on this branch: `.agents` apparatus

One additional, separately-scoped commit landed on this branch during the same session: `feat(agents): add .agents apparatus — ANCHON critic + .brain knowledge base`.

- `.agents/agt-01-anchon` (codename **ANCHON**): a standing, model-agnostic independent-critique seat — same identity (charter + accumulated memory), swappable model loadout (`fable` via Claude Code, `gpt-5.6-sol`/`gpt-5.5` via codex).
- `.agents/agt-01-anchon/.brain`: RCA of a governance-doc H-axis design defect, a 4-model cold triangulation, a runtime obligation-ledger + provenance design, and the full multi-round patch review trail (6 knowledge-blocks, 1 RCA, 22+ sessions) — kept as durable, cross-session agent memory.
- `.claude/agents/anchon.md`: the Claude Code adapter (thin — the mind lives in `.brain`).

Not required by the resolution-gradient work; included because it was built in the same session and is a standing addition to this repo's tooling, not scratch.

## Test plan

- [x] `python orchestrator/governance/resolution_gradient.py --self-test` passes (cascade math + new renderer fixtures)
- [x] `node --check orchestrator/run.js` passes, no CR bytes introduced
- [x] `python orchestrator/governance/governance_lint.py` stays green (21/21 enforced)
- [x] `render SUMMARY|SKELETON` smoke-tested against real atoms in `D:/rwang/RWANG/gks/atoms`
- [x] `plan` smoke-tested with a multi-atom/pinned-atom budget scenario exercising all four tiers
- [x] ANCHON adapter smoke-tested (fable loadout boot: reads charter + `.brain`, resolves all `MEMORY.md` pointers, reports `BOOT OK`)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
