---
id: feature--cockpit
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H2
role: coder
status: todo
---

# FEATURE: Live Cockpit [L2-Feature] feature--cockpit

**Phase:** P1 · **Tier:** H2 · **Type:** feature · **Est:** 2 · **MoSCoW:** should

### Description
Real-time agent tiles (claimed/running/reviewing), streaming logs via the IPC channel, a cost gauge reading the tier-bound caps, and intervene controls (pause/stop/kill-switch).

### Acceptance (DoD)
Running agents and live cost render in real time; the kill-switch and pause act immediately.

### Depends on
[[feature--atom-store]], [[config--cost-cap-tiers]]
