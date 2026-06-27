---
id: tech_stack--genesisdb-sidecar
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H2
role: coder
status: todo
---

# TECH_STACK: GenesisDB Node Sidecar [L4-Infrastructure] tech_stack--genesisdb-sidecar

**Phase:** P0 · **Tier:** H2 · **Type:** tech_stack · **Est:** 3 · **MoSCoW:** must

### Description
Greenfield: a thin Node sidecar hosting the GenesisDB N-API binary in-process (no port, dodging :3000). Pin a known-good win32-x64 binary; gate startup on schemaVersionSync(); supply Ollama bge-m3 (1024-dim) embeddings. Includes the first real round-trip PoC (the phantom orchestration/poc/genesis-roundtrip.mjs never existed).

### Acceptance (DoD)
Sidecar loads the pinned binary, addNode + hybridSearch + retrieveContext round-trip with bge-m3 vectors; refuses on schemaVersion mismatch.

### Depends on
(none)
