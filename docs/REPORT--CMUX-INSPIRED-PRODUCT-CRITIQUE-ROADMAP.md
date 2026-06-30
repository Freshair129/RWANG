---
version: "0.1.0b"
created_at: "2026-06-30T00:00:00+07:00,ATHER,pending"
last_update: "2026-06-30T00:00:00+07:00,ATHER"
status: "candidate"
superseded_by: null
attributes:
  domain: "product-strategy"
  doc_type: "product-critique-roadmap"
  scope: "RWANG / G-Orchestra Mission Control feature prioritization"
  language: "th"
---

# REPORT--CMUX-INSPIRED-PRODUCT-CRITIQUE-ROADMAP

## 1. Executive Summary

RWANG should not copy cmux as a feature checklist. RWANG should absorb the interaction model:

- every running agent has visible attention state;
- every workspace/pane is a controllable execution object;
- human input waits are first-class workflow states;
- agents can be grouped, supervised, and resumed from one Mission Control;
- automation can drive the same primitives as the UI.

The highest-value direction is to turn RWANG from a task board that can dispatch agents into a live agent mission-control shell. The core product question is not "can the agent run?" but "can the human instantly see which agent needs them, why, and what happens next?"

## 2. Product Critique

### 2.1 What RWANG Already Has

RWANG already has the foundation for this direction:

| Existing capability | Product value |
| --- | --- |
| DAG atoms and dependency gating | Agents can run in planned waves instead of ad hoc terminals. |
| Provider routing | Work can be assigned to Claude, Ollama, Codex, or other providers. |
| Governance gate | Unsafe work can pause for human confirmation. |
| Agent Room / Live Cockpit direction | The UI already wants a real-time supervision surface. |
| Copilot Console atom | Natural language command/control is already on the roadmap. |
| Tauri shell | Native shortcuts, local process control, and desktop UX are feasible. |
| A2A / MCP face design | Future programmable and peer-agent surfaces are already conceptually aligned. |

The gap is that RWANG currently thinks mostly in tasks and providers. The cmux-style leap is to think in live workspaces, panes, attention, and controllable agent sessions.

### 2.2 Why These Ideas Fit RWANG

| Idea | Fit with RWANG | Product critique |
| --- | --- | --- |
| Notification Rings | Very high | RWANG must make "needs human" impossible to miss. This should become a core workflow state, not decoration. |
| Vertical Tabs + Sidebar | Very high | Multi-agent work needs scanability across branches, ports, PRs, status, and last event. This is the operator map. |
| In-App Browser | Medium-high | Powerful for verification and web tasks, but security and automation scope make it expensive. Should come after the control plane stabilizes. |
| Claude Code Teams | High | Native split panes reduce setup friction. RWANG should make multi-agent work feel built-in, not tmux-dependent. |
| Programmable Everything | High | A real orchestrator must be scriptable. UI, CLI, and API should drive the same workspace/session primitives. |

### 2.3 What Not To Copy

RWANG should not become a generic terminal multiplexer. The product moat is governed autonomous orchestration:

- Keep atoms, gates, traceability, cost caps, and role authority as the source of truth.
- Treat panes as projections of agent sessions, not as independent unmanaged terminals.
- Treat browser control as an audited capability with scope and permission, not a free-for-all.
- Treat programmability as a controlled OrchestratorPort surface, not raw keystroke injection first.

## 3. Priority Roadmap

### P0 — Attention And Briefing Core

Goal: make blocked agents visible, actionable, and safe.

| Priority | Feature | Why first | Exit criteria |
| --- | --- | --- | --- |
| 1 | Standalone Governance Framework | RWANG needs its own local C/H/D/T/W, version, and doc gate rules before it can enforce behavior without external instructions. | `SPEC--RWANG-STANDALONE-GOVERNANCE-FRAMEWORK.md` is the local source of truth. |
| 2 | Attention state model | RWANG needs a first-class way to know which agent needs the human. | Tasks can enter `needs-input`, `needs-brief`, or `waiting-user` without being marked failed. |
| 3 | Notification Rings | Fastest UX win for multi-agent supervision. | Any pane/task waiting for input renders a clear active attention marker. |
| 4 | Jump-to-attention shortcut | The operator must reach the blocked agent instantly. | Global/local shortcut focuses the next waiting agent/session. |
| 5 | Brief Here | Prevents agents from guessing when context or requirements are incomplete. | Ambiguous tasks pause into a Brief Room and emit a Brief Packet before resume. |

Recommended implementation atom:

```json
{
  "id": "feature--attention-briefing-core",
  "type": "feature",
  "displayName": "Attention + Briefing Core",
  "phase": "P1",
  "tier": "H2",
  "role": "architect",
  "deps": ["feature--atom-store", "feature--cockpit", "feature--copilot-console"],
  "moscow": "must"
}
```

### P1 — Workspace Sidebar And Native Agent Panes

Goal: make each agent session readable and controllable.

| Priority | Feature | Why now | Exit criteria |
| --- | --- | --- | --- |
| 5 | Vertical workspace sidebar | Gives operators a persistent map of active work. | Sidebar shows task, owner, branch, provider, port, PR, and latest attention event. |
| 6 | Native split panes | Makes multi-agent sessions feel built-in. | Agent sessions open in managed panes with log/terminal/brief state. |
| 7 | Agent session model | Needed before serious CLI/API automation. | Engine has stable ids for sessions, panes, tasks, and rooms. |

### P2 — Programmable Mission Control

Goal: make RWANG scriptable without bypassing governance.

| Priority | Feature | Why now | Exit criteria |
| --- | --- | --- | --- |
| 8 | CLI workspace/session commands | Enables simple local automation. | CLI can create workspace, focus pane, dispatch task, and query waiting agents. |
| 9 | Socket/API control surface | Enables external tools and future integrations. | API exposes workspace/session primitives through the same permission model as UI. |
| 10 | Event stream | Required for robust automation. | Clients can subscribe to task/session/attention/brief events. |

### P3 — In-App Browser And Browser Automation

Goal: add browser-based verification and web task execution after the supervision layer is stable.

| Priority | Feature | Why later | Exit criteria |
| --- | --- | --- | --- |
| 11 | In-app browser pane | Useful but expands security and state scope. | Browser can open beside terminal/log and attach to an agent session. |
| 12 | Scoped browser tool control | Agents can click/fill/evaluate only when permitted. | Browser actions are logged, permissioned, and tied to task scope. |
| 13 | Browser verification recipes | Turns browser into a QA surface, not just convenience. | Tasks can declare browser checks as acceptance criteria. |

## 4. Recommended Build Order

1. Establish RWANG's self-contained governance framework: C/H/D/T/W axes, version lifecycle, docs-to-code gate, and Brief Here gate.
2. Add `needs-input`, `needs-brief`, `waiting-user`, and `brief-resolved` to the task/session state vocabulary.
3. Implement `Brief Here` as a workflow spec and UI surface before general pane automation.
4. Add notification rings and jump-to-attention in the Cockpit/Agent Room.
5. Add workspace sidebar metadata.
6. Add managed split panes.
7. Add CLI/API automation over stable session primitives.
8. Add in-app browser only after permission and event logs are in place.

## 5. Acceptance Criteria

- RWANG surfaces a waiting agent in under one scan: no log-diving required.
- A task with incomplete requirements does not dispatch implementation work.
- Brief Here produces a compact Brief Packet that can be attached to the task and reused by future agents.
- Sidebar shows enough state to understand each workspace without opening it.
- Automation can inspect and drive the same states exposed in the UI.
- Browser automation is permissioned, logged, and optional.
- RWANG's core workflow can be understood without reading external governance files.

## 6. Out Of Scope

- Copying cmux UI one-to-one.
- Raw uncontrolled keystroke automation as the first programmable primitive.
- Browser automation before attention/briefing state exists.
- Replacing RWANG's atom/governance model with terminal-session state.

---

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0b | 2026-06-30 | candidate | Initial cmux-inspired product critique and priority roadmap for RWANG Mission Control. | pending | ATHER |
