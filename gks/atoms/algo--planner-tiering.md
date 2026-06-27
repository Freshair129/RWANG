---
id: algo--planner-tiering
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H3
role: architect
status: todo
---

# ALGO: Planner Tiering [L3-Logic] algo--planner-tiering

**Phase:** P1 · **Tier:** H3 · **Type:** algo · **Est:** 2 · **MoSCoW:** must

### Description
The Planner owns the H-tier heuristic: assign the lowest tier that suffices by WBS rung (subtask->H0 .. masterplan->H5, author-overridable); auto-downgrade when near the cost cap. H is enforced as tool access-control (H0 = glob forbidden).

### Acceptance (DoD)
Atoms get a sane default tier by rung; near-cap runs downgrade tier; an H0 task literally cannot glob.

### Depends on
[[entity--atom-schema]], [[config--cost-cap-tiers]]
