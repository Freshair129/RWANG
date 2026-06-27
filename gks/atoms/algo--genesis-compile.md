---
id: algo--genesis-compile
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H2
role: coder
status: todo
---

# ALGO: Genesis Compile (decompose runtime) [L3-Logic] algo--genesis-compile

**Phase:** P0 · **Tier:** H2 · **Type:** algo · **Est:** 2 · **MoSCoW:** must

### Description
The first runtime primitive (seeded by gks/compile.mjs): read atoms -> validate GKS-001 (unique id) / GKS-002 (acyclic) / GKS-003 (>6 hops warn) -> assemble a runnable engine backlog + render canonical Markdown. This is the LEGO 'decompose' half GoVibe never built.

### Acceptance (DoD)
`node gks/compile.mjs` validates + emits backlog.gorch.json + atom .md; fails loudly on dup id / cycle / unresolved dep.

### Depends on
[[entity--atom-schema]]
