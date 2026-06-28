---
id: algo--autoloop
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H3
role: architect
status: todo
---

# ALGO: AutoLoop (autonomous build-test-benchmark-refine) [L3-Logic] algo--autoloop

**Phase:** P2 · **Tier:** H3 · **Type:** algo · **Est:** 5 · **MoSCoW:** should

### Description
The autonomous self-improvement engine ('Autonomas'). For a goal atom, loops PLAN (planner-tiering -> lowest-H sub-atoms) -> BUILD (dispatch wave via Provider Registry, borrow-checked) -> TEST (verify-gate-v2: compile/acceptance, deterministic-first) -> BENCHMARK (goldset-harness scores vs labeled target = self-benchmark) -> JUDGE (LLM-as-judge for what tests miss) -> if below target REFINE (RCA -> refinement spec -> re-plan) and loop, else DONE (record the improvement curve in the bitemporal traceability graph). Termination: target met / round-cap / cost-cap hit (finish-current-then-stop) / plateau K rounds / governance gate needs human. Governed by construction: cost-cap+gates+borrow-checker make autonomy safe (vs OpenHands/Devin runaway cost); each round is a durable checkpoint (Temporal-style) so a crash mid-loop replay-resumes.

### Acceptance (DoD)
Given a goal atom + gold-set, the loop runs unattended and either hits the benchmark target or stops on a defined termination condition (never runs away on cost); every round is recorded in the traceability graph with its score; cost-cap and gates are enforced on every BUILD round; a mid-loop crash resumes from the last checkpoint.

### Depends on
[[eval--goldset-harness]], [[safety--verify-gate-v2]], [[algo--planner-tiering]], [[config--cost-cap-tiers]], [[entity--traceability-graph]]
