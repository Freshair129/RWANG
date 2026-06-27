---
id: algo--ownership-borrow-checker
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H3
role: architect
status: todo
---

# ALGO: Ownership Layer (agent borrow-checker) [L3-Logic] algo--ownership-borrow-checker

**Phase:** P1 · **Tier:** H3 · **Type:** algo · **Est:** 3 · **MoSCoW:** must

### Description
Model claim/lease as Rust ownership: claim = exclusive &mut (<=1), context read = shared & (unlimited), lease = lifetime, move = fencing token. MVCC via GenesisDB bitemporal asOf (readers snapshot last-stable; writer supersedes). DACI = ownership roles; reviewer/Informed get & only.

### Acceptance (DoD)
Two agents cannot &mut the same atom (conflict rejected); readers never block the writer; stale-fence holders are rejected.

### Depends on
[[entity--atom-schema]]
