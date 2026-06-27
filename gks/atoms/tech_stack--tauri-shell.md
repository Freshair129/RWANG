---
id: tech_stack--tauri-shell
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H3
role: worker
status: todo
---

# TECH_STACK: Tauri v2 + React Shell [L4-Infrastructure] tech_stack--tauri-shell

**Phase:** P0 · **Tier:** H3 · **Type:** tech_stack · **Est:** 3 · **MoSCoW:** must

### Description
Scaffold the Tauri v2 + Rust shell with a React/Vite webview, wrapping the proven engine.mjs as a supervised sidecar (strangler-around-a-sidecar). Replaces the legacy Node :4577 web UI for end users.

### Acceptance (DoD)
`pnpm tauri dev` opens the desktop window; webview renders a placeholder Board fed by engine snapshot over IPC.

### Depends on
(none)
