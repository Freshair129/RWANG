---
id: algo--approval-chain
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H3
role: architect
status: todo
---

# ALGO: Approval Chain (multi-role DACI workflow) [L3-Logic] algo--approval-chain

**Phase:** P2 · **Tier:** H3 · **Type:** algo · **Est:** 3 · **MoSCoW:** should

### Description
Multi-role DACI approval state machine layered ON TOP of the hard pre-dispatch gate (harvested from GoVibe STD-Execution-Governance + ADR-007, reference-only). Steps: classify Complexity C-0..C-3 + context tier H + W-scale -> scope gate (ARCHON, for C-2/C-3) -> doc review (ATHER: COMPLIANT/DRIFT/NON-COMPLIANT) -> feasibility (RKOI: PASS/REVISION/FAIL) -> architecture approval (ARCHON for C-3 or H4-H6: APPROVED/NEEDS_REVISION/ADR_REQUIRED) -> implementation -> QA (GHOST: VERIFIED/REJECTED) -> compliance audit (ATHER). 'no approved source doc -> BLOCKED' for C-2/C-3. Lighter C-levels skip steps. This is the human-workflow layer; guard--governance-gate stays the enforcement point.

### Acceptance (DoD)
A gated atom walks the chain scaled by its C-level; each step records role + verdict; a C-2/C-3 with no approved source doc is blocked; the chain feeds the governance gate but never bypasses it.

### Depends on
[[guard--governance-gate]], [[entity--atom-schema]]
