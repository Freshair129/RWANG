---
id: audit--telemetry
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H1
role: worker
status: todo
---

# AUDIT: Telemetry (opt-in) [L2-AccessControl] audit--telemetry

**Phase:** P1 · **Tier:** H1 · **Type:** audit · **Est:** 1 · **MoSCoW:** could

### Description
Opt-in, OFF by default (honors local-first). Allowlist = anonymous health counters only (app version, crash, feature-used) — never code/spec/atom content or provider payloads.

### Acceptance (DoD)
Nothing leaves the machine unless opted in; the payload is restricted to the counter allowlist.

### Depends on
[[feature--atom-store]]
