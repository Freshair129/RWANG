---
id: feature--copilot-console
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H2
role: coder
status: todo
---

# FEATURE: Copilot Console [L2-Feature] feature--copilot-console

**Phase:** P1 · **Tier:** H2 · **Type:** feature · **Est:** 3 · **MoSCoW:** must

### Description
Chat-to-command surface with a Maiden-style persona: natural language -> author atoms / dispatch waves via slash-commands, shown as atom diffs. Hosts the 'embeddings unavailable' health banner.

### Acceptance (DoD)
A natural-language ask produces atoms or a dispatch; banner appears when Ollama embeddings are down.

### Depends on
[[feature--atom-store]], [[protocol--engine-ipc]]
