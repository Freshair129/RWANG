# Session sess-20260712-03 — sol loadout (codex, flagship) — GenesisBlock axis review (cold)

**Runner:** `codex exec -m gpt-5.6-sol -c model_reasoning_effort=high -s read-only`, doc via stdin.
(Required `codex update` → CLI 0.144.1; 0.142.5 rejected the 5.6 models.)

## Verbatim headline (gpt-5.6-sol)
- "The H0–H6 ladder ... conflates at least four different things: retrieval breadth, abstraction level,
  task type, and authority. An API contract is not inherently 'more context' than a feature spec."
- "The schema also permits only H0–H4 while the specification defines H0–H6."
- "Bi-directional Markdown is the highest-risk component ... lacks optimistic locking, base revision,
  three-way merge, authorization, validation, audit history, and conflict semantics."
- "Mock handling is actively unsafe ... A dangling reference and an unapproved hypothesis are different
  states and must not be collapsed."

## Fresh design — independent policy axes
Scope · Concern · Authority · Trust · **Sensitivity** · Completeness · **Freshness**.
"H0–H6 could remain as convenience presets, never as the fundamental model." "Markdown may submit
proposed patches, but it should not directly mutate canonical data. Placeholders and AI drafts should
live in a quarantined proposal layer ... never satisfy release gates until explicitly approved."
