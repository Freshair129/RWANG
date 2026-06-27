---
id: protocol--engine-ipc
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H2
role: coder
status: todo
---

# PROTOCOL: Engine IPC Bridge [L2-Communication] protocol--engine-ipc

**Phase:** P0 · **Tier:** H2 · **Type:** protocol · **Est:** 2 · **MoSCoW:** must

### Description
Tauri commands + events + channels bridging the Rust shell and the engine sidecar: snapshot/state pull, command dispatch (claim/done/dispatch/run/stop), and a live log stream channel for the Cockpit.

### Acceptance (DoD)
UI receives live snapshot + log stream; a dispatch command round-trips to the engine and mutates state.

### Depends on
[[tech_stack--tauri-shell]]
