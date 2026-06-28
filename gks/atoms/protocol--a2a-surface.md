---
id: protocol--a2a-surface
block_id: Genesis::G-Orchestra-v2
context_scaling_tier: H3
role: architect
status: todo
---

# PROTOCOL: A2A Interop Surface (contract) [L2-Communication] protocol--a2a-surface

**Phase:** P3 · **Tier:** H3 · **Type:** protocol · **Est:** 3 · **MoSCoW:** could

### Description
Open Agent-to-Agent (A2A) interop seam; supersedes protocol--govibe-mcp-bridge (ADR-O-006). G-Orch speaks A2A as server (Agent Card at /.well-known/agent-card.json exposing skills author-atoms/run-pipeline/verify/query-graph; maps the A2A Task lifecycle submitted->working->input-required->completed/failed onto the 8-state machine) and as client (a remote A2A agent registers as a Provider with transport `a2a` per ADR-O-005, so borrow-checker/gates/cost-cap/Verify Gate apply uniformly). Distinct from MCP: MCP=vertical (Claude Code director calls G-Orch tools), A2A=horizontal (agent<->agent peers). Consumer-agnostic; GoVibe is only the first reference consumer.

### Acceptance (DoD)
A versioned A2A contract exists (Agent Card schema + Task<->8-state mapping + the atoms/events crossing the seam + A2A-remote-as-Provider registration); end-to-end, an external A2A agent can delegate a task to G-Orch and receive an artifact, and G-Orch can delegate one task out via the registry, both passing the pre-dispatch governance gate.

### Depends on
[[entity--traceability-graph]], [[entity--atom-schema]]
