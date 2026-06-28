---
id: guard--governance-gate
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H2
role: coder
status: todo
---

# GUARD: Governance Gate [L2-AccessControl] guard--governance-gate

**Phase:** P0 · **Tier:** H2 · **Type:** guard · **Est:** 2 · **MoSCoW:** must

### Description
Human-confirm gate triggered by an explicit `requiresConfirm` field PLUS auto for Safety::*/deploy/merge/irreversible. Enforced PRE-DISPATCH in the Rust core (blocks claimed->running for gated atoms), never trusting the agent. This hard pre-dispatch stop stays mandatory; algo--approval-chain is the optional multi-role DACI human-workflow layer that feeds verdicts into it -- it never replaces the hard gate.

### Acceptance (DoD)
A gated atom cannot transition claimed->running without an explicit human confirm; non-gated atoms flow normally.

### Depends on
[[entity--atom-schema]]
