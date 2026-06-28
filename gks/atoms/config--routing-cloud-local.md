---
id: config--routing-cloud-local
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H2
role: architect
status: todo
---

# CONFIG: Cloud/Local Routing Split (T-axis) [L1-Config] config--routing-cloud-local

**Phase:** P1 · **Tier:** H2 · **Type:** config · **Est:** 2 · **MoSCoW:** should

### Description
Formalize the T-axis cloud/local split on top of the existing ADR-O-005 roles/providers in config.json (does not rewrite the registry). CLOUD (claude opus/sonnet) owns architect + reviewer (plan / architecture / review / complex-logic); LOCAL (ollama coder) owns coder + worker (code / refactor / scaffold). Expressed via each role's preferred chain. Orthogonal to H: a small H0 task may still route to cloud if it is complex (T != H). Local pick is VRAM-aware: on an RTX 3060 (~5GB free) the realistic coder is qwen2.5-coder-7B Q4.

### Acceptance (DoD)
Config declares cloud-roles vs local-roles; a coder dispatch goes local-first while architect/reviewer go cloud; the split is overridable per task and stays orthogonal to the H-tier.

### Depends on
[[config--cost-cap-tiers]]
