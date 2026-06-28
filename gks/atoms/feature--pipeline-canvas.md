---
id: feature--pipeline-canvas
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H3
role: coder
status: todo
---

# FEATURE: Pipeline Canvas (React Flow DAG builder) [L2-Feature] feature--pipeline-canvas

**Phase:** P2 · **Tier:** H3 · **Type:** feature · **Est:** 5 · **MoSCoW:** should

### Description
An n8n/ComfyUI-style structured DAG builder using React Flow (@xyflow/react): drag a node = create an atom (todo); connect an edge port->port = create a depends_on (acyclic-checked, GKS-002); drag an agent/loadout onto a node = assign; Run a sub-graph = autonomous wave. Reuses the existing backend verbatim -- engine.mjs setDeps() (persists deps -> atoms.gorch.json + recompile), waves() (topological layout), detectCycle() -- via POST /api/cmd {action:setdeps}. Absorbs/supersedes the custom SVG editor studio/src/Graph.tsx. The canvas is an authoring surface bound to the AtomStore (single source of truth), not its own state.

### Acceptance (DoD)
Dragging a node + connecting an edge creates a real depends_on edge in the DAG (persisted to atoms.gorch.json, recompiled); a cycle is rejected; running a sub-graph dispatches a wave; node/edge state stays 1:1 with the AtomStore.

### Depends on
[[feature--atom-store]], [[protocol--engine-ipc]]
