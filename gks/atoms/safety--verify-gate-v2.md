---
id: safety--verify-gate-v2
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H2
role: coder
status: todo
---

# SAFETY: Verify Gate v2 [L2-AccessControl] safety--verify-gate-v2

**Phase:** P1 · **Tier:** H2 · **Type:** safety · **Est:** 2 · **MoSCoW:** must

### Description
PASS if no `critical` issues (issue-count/severity, not a trusted score). Claude is default reviewer when enabled+under-cap; the local SLM/LLM-as-judge runs only on offline OR cost-cap-hit OR explicit Loadout pin. Auto-advance on PASS for non-governance tasks.

### Acceptance (DoD)
Non-critical output auto-advances; offline/cap routes review to the local judge; governance tasks still require human confirm.

### Depends on
[[guard--governance-gate]]
