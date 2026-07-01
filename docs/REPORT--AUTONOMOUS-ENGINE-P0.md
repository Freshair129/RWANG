# REPORT — Autonomous Engine P0 (the "Autonamas" loop, bootstrapped)

> Implementation summary for the run that closed the autonomous loop. Built by **dogfooding
> RWANG's own flow**: a swarm of coding agents built the leaf components in parallel, then the
> frontier (orchestrator) assembled the capstone, verified DoD via tests, and wrote this report.

## What this delivered

The 7 atoms that turn RWANG from human-driven dispatch into a self-closing autonomous loop —
PLAN → BUILD → TEST → BENCHMARK → record → refine — are now implemented and tested.

| Atom | Module | Built by | Tests |
|---|---|---|---|
| `algo--genesis-compile` | `gks/compile.mjs` | swarm | 7/7 |
| `algo--planner-tiering` | `planner.mjs` | swarm | 8/8 |
| `algo--adaptive-decompose` | `gks/adaptive-decompose.mjs` | swarm | 9/9 |
| `safety--verify-gate-v2` | `gks/verify-gate.mjs` | swarm | 15/15 |
| `eval--goldset-harness` | `gks/goldset.mjs` (+ `goldset.data.json`) | swarm | 9/9 |
| `algo--knowledge-adapter` | `store/knowledge.mjs` | (pre-existing) | audited green |
| `algo--autoloop` | `gks/autoloop.mjs` | frontier (assembly) | 9/9 |

**Full new/extended suite: 57/57 green. Regression (ownership, approval-chain, knowledge):
46/46 green. No engine.mjs / config.json changes** (every component is a standalone, injectable
module — the engine binds them in a thin follow-up).

## How it works (the closed loop)

```
goal atom
   │
   ▼  PLAN  ── planner.assignTier()  +  adaptive-decompose.decompose()
   │            break down ONLY until the executor can handle a leaf (shallowest sufficient
   │            depth); each leaf carries its own minimal context (the 8k-SLM constraint).
   ▼  BUILD ── dispatchWave(leaves)   ← injected engine dispatch (Provider Registry, borrow-checked)
   ▼  TEST  ── verify-gate.classifyVerdict()  PASS iff no `critical` issue (not a trusted score);
   │            reviewer out-tiers worker; governance PASS → human-confirm.
   ▼  BENCH ── goldset.scoreGoldset() cross-checks tier + verdict vs labels; `autoSpendAllowed`
   │            keeps full-autonomy OFF until accuracy clears the threshold.
   ▼  RECORD── knowledge.recordOutcome() + linkTrace()  every round → traceability graph.
   └─ refine / loop
```

**Governed by construction (no runaway):** `runAutoLoop` stops on `cost-cap` (a `costRemaining()`
guard), `plateau` (no improvement for N rounds), `round-cap`, or `target-met`. Every round writes
`<runDir>/autoloop.checkpoint.json`, so a mid-loop crash **resumes from the last round** instead of
restarting (verified by test).

Composer entrypoint: `autonomas(goal, deps, opts)` in `gks/autoloop.mjs` wires the five components
+ the knowledge store + the checkpoint into `runAutoLoop`. `dispatchWave` and `store` are injected
so the loop is unit-testable and decoupled from `engine.mjs`.

## DoD verification (per atom)

- **genesis-compile** — `node gks/compile.mjs` validates GKS-001 (unique id) / GKS-002 (acyclic) /
  GKS-003 (>6-hop warn) + unresolved-dep, emits `backlog.gorch.json` + per-atom `.md`, fails loudly
  non-zero on dup/cycle/unresolved. ✅
- **planner-tiering** — `assignTier` → lowest H-tier by rung, explicit `tier` overrides, near-cap
  downgrades; `tierTools('H0').glob === false`. ✅
- **adaptive-decompose** — too-hard task auto-decomposes until the executor can handle it; stops at
  the shallowest sufficient depth (measurable heuristic, not always-atomic); leaves carry minimal
  context. ✅
- **verify-gate-v2** — PASS iff no `critical` issue (by issue list, not score); local-judge only on
  offline/cap/pin; governance PASS → human. ✅
- **goldset-harness** — scores tier + verdict vs labels; `autoSpendAllowed` false until threshold. ✅
- **knowledge-adapter** — same `recordOutcome/queryContext/asOf/linkTrace` API in file + genesisdb
  modes; lexical fallback when embeddings are down. ✅ (existing impl, audited)
- **autoloop** — given a goal + gold-set the loop runs unattended and stops on a defined condition
  (never runs away on cost); every round recorded; mid-loop crash resumes from checkpoint. ✅

## What's left (thin follow-ups, not blocking)

1. **Engine CLI wiring** — bind `autonomas()`'s `dispatchWave` to the engine's real wave dispatch
   and expose `node orchestrator.mjs auto-loop <goalId>` (the existing `auto-wave` command is the
   seam). Currently `dispatchWave`/`store` are injected; tests use mocks.
2. **goldset growth** — the shipped `goldset.data.json` is a 6-entry seed; grow it before flipping
   `autoSpendAllowed` on for real auto-spend.
3. **refine hook** — `autonomas` ships a pass-through `refine`; wire it to the RCA/anti-error-loop
   (G1/G2/G3) so failed rounds inject past mistakes (see `docs/guides/small-model-prompting.md`).

## Provenance

Swarm: 5 parallel coding agents (Claude), each scoped to one module + its `node --test` test, with
shared interface contracts so they compose. Frontier assembled the autoloop capstone + checkpoint +
traceability wiring, ran the full + regression suites, and authored this report. Branch
`feat/autonomous-engine-p0`; human owns the merge.
