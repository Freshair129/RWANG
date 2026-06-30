---
id: algo--knowledge-adapter
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H2
role: coder
status: done
---

# ALGO: Knowledge Adapter (file | genesisdb) [L3-Logic] algo--knowledge-adapter

**Phase:** P0 · **Tier:** H2 · **Type:** algo · **Est:** 2 · **MoSCoW:** must

### Description
A single swappable adapter (recordOutcome/queryContext/asOf/linkTrace) with a MANDATORY flat-file fallback. Markdown atoms stay the source of truth; GenesisDB is the rebuildable derived index. Default backend = file; genesisdb when the sidecar is up + Windows.

### Acceptance (DoD)
Same API passes in BOTH file and genesisdb modes; off-Windows auto-degrades to file; semantic query falls back to lexical when embeddings are down.

### Depends on
[[tech_stack--genesisdb-sidecar]], [[entity--atom-schema]]
