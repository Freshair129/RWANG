---
id: guard--entitlement
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H2
role: coder
status: todo
---

# GUARD: License & Entitlement [L2-AccessControl] guard--entitlement

**Phase:** P1 · **Tier:** H2 · **Type:** guard · **Est:** 2 · **MoSCoW:** should · ⛔ requiresConfirm

### Description
Per-machine device-bound entitlement (ed25519/PASETO v4.local) + offline grace window. License tiers (Free/Pro/Studio) bound the cost-cap ceiling. Marketplace deferred post-v1; only the signed sideload import path is in v1.

### Acceptance (DoD)
A device-bound token unlocks the tier offline within grace; tampering/expiry degrades to Free; updater stays free across tiers.

### Depends on
[[tech_stack--tauri-shell]]
