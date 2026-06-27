---
id: entity--atom-schema
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H3
role: architect
status: todo
---

# ENTITY: Genesis Atom Schema [L3-Storage] entity--atom-schema

**Phase:** P0 · **Tier:** H3 · **Type:** entity · **Est:** 2 · **MoSCoW:** must

### Description
Define the GenesisAtom type: immutable slug `id` + mutable `displayName`, type, hierarchy (masterplan..subtask), context_scaling_tier H0-H6, status, body, first-class rice/moscow/requiresConfirm, and the ownership block (owner/borrow/lease/fence). Source of truth = front-matter Markdown; GenesisDB is a derived index.

### Acceptance (DoD)
TS/JSON-schema for GenesisAtom committed; round-trips Markdown<->object; passes GKS-001/002 on a sample set.

### Depends on
(none)
