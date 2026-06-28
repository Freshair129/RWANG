---
id: feature--loadout
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H2
role: coder
status: todo
---

# FEATURE: Agent Loadout (inventory) [L2-Feature] feature--loadout

**Phase:** P1 · **Tier:** H2 · **Type:** feature · **Est:** 3 · **MoSCoW:** must

### Description
The game-inventory surface: per role equip Model (hat), Tools/Capabilities, Skills, MemoryOS, context scope+tier, and a Persona preset (from config--persona-presets, which sets persona + DACI authority). Owner-approved SLM/LLM-as-tool slot. An override+enrichment layer over roles[role].preferred (empty loadout = current behavior).

### Acceptance (DoD)
Drag gear onto slots; stats (cost/speed/capability) render; the equipped loadout actually routes the next dispatch.

### Depends on
[[feature--atom-store]], [[entity--atom-schema]], [[config--persona-presets]]
