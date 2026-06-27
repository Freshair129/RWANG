---
id: module--multi-host
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H4
role: architect
status: todo
---

# MODULE: Multi-host Pool [L1-Module] module--multi-host

**Phase:** P3 · **Tier:** H4 · **Type:** module · **Est:** 3 · **MoSCoW:** could · ⛔ requiresConfirm

### Description
Replace the single-host .state.lock with DB-backed fencing-token leased claims owned by a Coordinator host (the ownership/fence schema designed in P1 makes this incremental). Phase-2 spike required before committing the ed25519-consensus design.

### Acceptance (DoD)
Two hosts claim from one DB without double-execution; a fenced stale claim is rejected; Coordinator failover defined.

### Depends on
[[algo--ownership-borrow-checker]], [[algo--knowledge-adapter]]
