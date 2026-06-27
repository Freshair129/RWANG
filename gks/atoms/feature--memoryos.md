---
id: feature--memoryos
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H3
role: coder
status: todo
---

# FEATURE: MemoryOS (per-agent KB) [L2-Feature] feature--memoryos

**Phase:** P2 · **Tier:** H3 · **Type:** feature · **Est:** 3 · **MoSCoW:** should

### Description
A long-term, persistent, private per-agent knowledge base backed by GenesisBlockDB (graph+vector) OR filesystem. Equipped via the Loadout. Off-Windows falls back to the file backend.

### Acceptance (DoD)
An agent writes + recalls private memory across sessions; backend swaps file<->genesisdb without API change.

### Depends on
[[algo--knowledge-adapter]], [[feature--loadout]]
