---
id: feature--node-db-canvas
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H3
role: coder
status: todo
---

# FEATURE: Node<->DB Canvas [L2-Feature] feature--node-db-canvas

**Phase:** P2 · **Tier:** H3 · **Type:** feature · **Est:** 3 · **MoSCoW:** should

### Description
Visual canvas to drop nodes/files/atoms INTO GenesisBlockDB and render only selected atoms/files back FROM the DB. Local embeds: warn (time/VRAM), don't gate.

### Acceptance (DoD)
Dropping a node persists it to GenesisDB; a query renders only the selected atoms back onto the canvas.

### Depends on
[[algo--knowledge-adapter]], [[feature--graph-editable]]
