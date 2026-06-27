---
id: feature--atom-store
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H2
role: coder
status: todo
---

# FEATURE: AtomStore (one object, six lenses) [L2-Feature] feature--atom-store

**Phase:** P1 · **Tier:** H2 · **Type:** feature · **Est:** 2 · **MoSCoW:** must

### Description
A single normalized client store (keyed by atom id) so Board card, Graph node, Canvas node, Copilot output, and Cockpit tile are all views of the same row — no parallel models. 'claim on board' and 'node turns amber' stay in sync.

### Acceptance (DoD)
Mutating one atom updates every surface from one store; no duplicated task/graph models.

### Depends on
[[protocol--engine-ipc]], [[entity--atom-schema]]
