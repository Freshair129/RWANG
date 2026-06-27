---
id: tech_stack--updater
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H2
role: worker
status: todo
---

# TECH_STACK: In-app Updater [L4-Infrastructure] tech_stack--updater

**Phase:** P1 · **Tier:** H2 · **Type:** tech_stack · **Est:** 2 · **MoSCoW:** should · ⛔ requiresConfirm

### Description
Mirror G-Maiden's release machinery: Tauri updater + minisign-signed installers + latest.json feed + deferred install. 'Safe to swap' = pause new dispatch and drain only ACTIVE tasks, then install (do not kill running agents, do not drain the whole backlog). Updater is NOT tier-gated.

### Acceptance (DoD)
A signed update downloads, drains active tasks, and applies on next launch; tampered signatures are rejected.

### Depends on
[[tech_stack--tauri-shell]]
