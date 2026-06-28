---
id: config--persona-presets
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H2
role: architect
status: todo
---

# CONFIG: Persona Presets (DACI roster) [L1-Config] config--persona-presets

**Phase:** P1 · **Tier:** H2 · **Type:** config · **Est:** 2 · **MoSCoW:** should

### Description
A roster of equippable agent personas with DACI authority, harvested from the GoVibe agent team (reference-only, agent-registry.yaml): ARCHON (architect/approver), LYRA (planner/driver), RKOI (tech-lead/reviewer), ATHER (auditor/traceability), GHOST (QA), THESEUS (doc-writer), JANUS (devops), KIN (integration), VIBE (frontend). Each persona declares authority can/cannot, mapped onto DACI -> borrow capability (Approver/Reviewer/Informed get shared & only, never &mut; see algo--ownership-borrow-checker). Equipped via the Loadout.

### Acceptance (DoD)
A persona preset can be selected and equipped; it sets the agent's persona + DACI authority + default role routing; a reviewer/informed persona cannot acquire an exclusive (&mut) borrow.

### Depends on
[[entity--atom-schema]]
