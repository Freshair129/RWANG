---
id: tech_stack--cross-platform
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H4
role: worker
status: todo
---

# TECH_STACK: Cross-platform Build [L4-Infrastructure] tech_stack--cross-platform

**Phase:** P3 · **Tier:** H4 · **Type:** tech_stack · **Est:** 3 · **MoSCoW:** could

### Description
napi cross-compile CI matrix (linux-gnu / win-msvc / darwin x64+arm64) + signed release assets + npm/binary publish, lifting the Windows-first limit so mac/Linux get semantic recall (not just flat-file).

### Acceptance (DoD)
CI produces signed binaries for all targets; mac/Linux load GenesisDB N-API and pass the knowledge-adapter suite.

### Depends on
[[tech_stack--genesisdb-sidecar]]
