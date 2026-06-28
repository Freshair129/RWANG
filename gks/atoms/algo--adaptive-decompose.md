---
id: algo--adaptive-decompose
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H3
role: architect
status: todo
---

# ALGO: Adaptive Decompose (ADaPT) [L3-Logic] algo--adaptive-decompose

**Phase:** P2 · **Tier:** H3 · **Type:** algo · **Est:** 3 · **MoSCoW:** should

### Description
As-needed recursive decomposition (ADaPT). Break a task down only until the assigned executor (by model capability from config--routing-cloud-local) can complete it with high enough success probability -- no finer (over-decomposition has a planning-cost break-even). Depth = f(complexity / model-capability), capped by the H-tier from algo--planner-tiering. A 7B local coder shreds down to micro/atomic; a cloud model takes coarser chunks. Each leaf carries its own self-contained context (POLA at H0).

### Acceptance (DoD)
A task too hard for the local model is auto-decomposed until an executor can handle it; decomposition stops at the shallowest sufficient depth (a measurable stop heuristic, not always-atomic); each leaf carries its own minimal context.

### Depends on
[[algo--planner-tiering]], [[config--routing-cloud-local]]
