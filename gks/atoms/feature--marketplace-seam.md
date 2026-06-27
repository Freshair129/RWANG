---
id: feature--marketplace-seam
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H3
role: architect
status: todo
---

# FEATURE: Marketplace Seam [L2-Feature] feature--marketplace-seam

**Phase:** P3 · **Tier:** H3 · **Type:** feature · **Est:** 2 · **MoSCoW:** could · ⛔ requiresConfirm

### Description
Design the seam (not the storefront) for sharing/selling agent loadouts/templates/skins (rarity tiers, like the Maiden Atelier). v1 ships only the signed sideload import path; payments/storefront post-v1.

### Acceptance (DoD)
A signed loadout pack imports + verifies; the seam is documented so a later storefront drops in without schema change.

### Depends on
[[feature--loadout]], [[guard--entitlement]]
