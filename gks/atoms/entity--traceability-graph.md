---
id: entity--traceability-graph
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H3
role: architect
status: todo
---

# ENTITY: Traceability Graph (bitemporal) [L3-Storage] entity--traceability-graph

**Phase:** P2 · **Tier:** H3 · **Type:** entity · **Est:** 2 · **MoSCoW:** must

### Description
Promote the anti-error loop from a failure-only side-channel into the primary atom-keyed traceability backbone: edges implemented_by/verified_by/depends_on/supersedes/failed_with + bitemporal asOf/validFrom/causedBy.

### Acceptance (DoD)
Given an atom, the graph answers which spec asked, which task built, which test proved, and what was believed when shipped.

### Depends on
[[algo--knowledge-adapter]], [[runbook--doc-to-code-pipeline]]
