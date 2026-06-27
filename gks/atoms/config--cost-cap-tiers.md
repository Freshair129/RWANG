---
id: config--cost-cap-tiers
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H1
role: worker
status: todo
---

# CONFIG: Cost-Cap (tier-bound) [L1-Config] config--cost-cap-tiers

**Phase:** P0 · **Tier:** H1 · **Type:** config · **Est:** 1 · **MoSCoW:** must

### Description
Replace usageLimits=null with non-null, license-tier-bound session/weekly USD caps (Free low -> Pro/Studio higher), user-editable within the tier ceiling, + a global kill-switch. On cap-hit: finish the current task, then stop.

### Acceptance (DoD)
Pool auto-stops at the configured session/weekly cap; cold-start uses the tier seed; kill-switch halts dispatch immediately.

### Depends on
(none)
