---
id: eval--goldset-harness
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H2
role: reviewer
status: todo
---

# EVAL: Gold-set Eval Harness [L3-Logic] eval--goldset-harness

**Phase:** P1 · **Tier:** H2 · **Type:** eval · **Est:** 2 · **MoSCoW:** should

### Description
A labeled gold-set + scorer to validate planner tiering + Verify-Gate decisions BEFORE auto-spend is trusted. Gates the 'full autonomous' switch.

### Acceptance (DoD)
Harness scores tier-assignment + review verdicts vs labels; auto-spend stays disabled until a threshold is met.

### Depends on
[[algo--planner-tiering]]
