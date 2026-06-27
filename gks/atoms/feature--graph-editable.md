---
id: feature--graph-editable
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H3
role: coder
status: todo
---

# FEATURE: Editable Graph (Obsidian) [L2-Feature] feature--graph-editable

**Phase:** P2 · **Tier:** H3 · **Type:** feature · **Est:** 3 · **MoSCoW:** must

### Description
View AND edit the dependency/relation graph: nodes=atoms, edges=wikilinks; create/edit/delete edges by dragging; traverse, filter, focus. Focus-mode hop depth is coupled to the retrieval tier (focus depth = H visualization).

### Acceptance (DoD)
Dragging creates/removes a real dependency edge (acyclic-checked, GKS-002); focus depth maps to H-tier.

### Depends on
[[feature--atom-store]], [[algo--knowledge-adapter]]
