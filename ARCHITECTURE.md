# Architecture

This document describes RWANG's system architecture, key design decisions, and
component interactions.

## System overview

RWANG is a **governed autonomous multi-agent orchestrator** — it takes a DAG of
typed tasks (atoms) and dispatches real AI agents to execute them, with governance
controls at every stage.

```
┌─────────────────────────────────────────────────────────────┐
│                        RWANG System                         │
│                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────┐  │
│  │  Studio   │◄──│   Engine     │───►│   Providers       │  │
│  │  (React)  │   │ (engine.mjs) │    │ Claude/Ollama/... │  │
│  └──────────┘    └──────┬───────┘    └───────────────────┘  │
│                         │                                    │
│  ┌──────────┐    ┌──────┴───────┐    ┌───────────────────┐  │
│  │  Tauri   │    │     GKS      │    │   Store           │  │
│  │  Shell   │    │ (atom graph) │    │ (file/GenesisDB)  │  │
│  └──────────┘    └──────────────┘    └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Core components

### 1. Engine (`engine.mjs`)

The orchestration core. Single-process, file-based state management.

**Responsibilities:**
- DAG topology (topological sort, wave computation)
- Task state machine: `todo → claimed → running → done | failed`
- Atomic claim with file-lock (compare-and-swap on `state.json`)
- Lease management with automatic reclaim
- Model routing: `task.type → role → model tier`
- Permission routing: `task.type → safe | full`
- DACI borrow-checker integration
- Governance gate enforcement
- Dispatch orchestration (claim → build prompt → spawn agent → collect result)

**State machine:**
```
        ┌──────────────────────────┐
        │                          │
        ▼                          │
  ┌──────────┐  claim   ┌─────────┴──┐  dispatch  ┌─────────┐
  │   todo   │────────►│  claimed    │──────────►│ running  │
  └──────────┘          └────────────┘            └────┬─────┘
       ▲                      │                        │
       │              release │              ┌─────────┼─────────┐
       │                      │              │         │         │
       └──────────────────────┘         ┌────▼───┐ ┌───▼────┐    │
                                        │  done  │ │ failed │    │
                                        └────────┘ └────────┘    │
                                             ▲                   │
                                             │   lease expired   │
                                             └───────────────────┘
```

**Key invariants:**
- Only one worker can claim a task at a time (file-lock serialization)
- A task is only ready when all its `deps` are `done`
- Lease expiry auto-releases back to `todo`
- Governance-gated tasks require explicit confirm before dispatch

### 2. Genesis Knowledge System (`gks/`)

The knowledge layer that defines, validates, and queries the task graph.

| File | Role |
|---|---|
| `atoms.gorch.json` | Source of truth for all atoms (tasks) |
| `compile.mjs` | Compiles JSON → backlog + generated `.md` files |
| `ownership.mjs` | Borrow-checker (exclusive &mut / shared & / lease / fence) |
| `approval-chain.mjs` | DACI approval state machine (draft → proposed → approved → done) |

**Atom schema:**
```json
{
  "id": "algo--verify-gate",
  "title": "Verify Gate Implementation",
  "type": "code",
  "phase": 2,
  "deps": ["entity--atom-schema", "safety--verify-gate-v2"],
  "accept": "reviewer agent checks output against acceptance criteria",
  "tier": "H2",
  "owner": null,
  "requiresConfirm": false
}
```

**Compilation:** `atoms.gorch.json` → `compile.mjs` → `backlog.gorch.json` (engine input) + `atoms/*.md` (human-readable).
Edit the JSON source, never the generated files.

### 3. Providers (`providers.mjs`)

Adapter layer for dispatching to different AI providers.

| Provider | Transport | Spawn pattern |
|---|---|---|
| Claude | Subprocess (`claude -p`) | stdin prompt, stream-json stdout, exit code |
| Ollama | HTTP streaming | `POST /api/generate` or `/api/chat` |
| Codex | Subprocess | Similar to Claude |
| Antigravity | Subprocess | Similar to Claude |
| OpenRouter | HTTP | REST API call |

**Common interface:**
```javascript
async function runProvider(provider, task, logStream, opts)
// Returns: { ok, cost, tokens, output, exitCode }
```

Each provider adapter handles auth, model selection, prompt formatting, streaming
output capture, and cost/token extraction.

### 4. Studio UI (`studio/`)

React/Vite single-page application with 10 tabs.

**Data flow:**
```
Studio ──GET /api/state──► Engine
Studio ──POST /api/cmd───► Engine ──► state.json
Studio ──GET /api/log────► Engine ──► logs/<id>.log
```

The UI polls `/api/state` for snapshot updates (1.5s interval). All mutations go
through `POST /api/cmd` with action + parameters.

**Key UI components:**
- `DevProgress.tsx` — the primary development interface (phase-grouped atoms,
  drag-assign personas, batch operations, live agent log)
- `Board.tsx` — kanban view
- `Graph.tsx` — dependency graph visualization
- `Cockpit.tsx` — system status and provider health

### 5. Tauri Shell (`src-tauri/`)

Native desktop wrapper providing:
- System tray with quick actions
- Window management (always-on-top, frameless option)
- Global shortcuts
- Auto-update (via Tauri updater plugin)
- Sidecar process management (engine server)

## Cross-cutting concerns

### Governance model

RWANG implements a multi-layer governance model:

1. **Persona DACI roles** — each persona has Driver/Approver/Contributor/Informed
   authorities that map to borrow capabilities
2. **Borrow checker** — review-only personas (shared &) cannot take exclusive
   borrows (claim/dispatch), preventing reviewers from self-approving
3. **Governance gates** — atoms with `requiresConfirm: true` must be explicitly
   confirmed; safety/guard types are auto-gated
4. **Permission modes** — code/test tasks get `full` (Bash ok), docs/config get
   `safe` (edits only)
5. **Cost controls** — session/weekly USD caps, auto-downgrade at 80%, local
   fallback at 90%
6. **Kill switch** — emergency halt for all dispatch

### Context scoping (POLA)

Agents receive only the context they need:

- `scope.docs` — which documents to include in the prompt
- `scope.needs` — required context files
- `scope.excludes` — files to omit
- `scope.budgetTokens` — max prompt tokens
- `scope.profile` — Ollama profile (fast/balanced/ui-heavy)

Orchestrator-only documents (concept docs, `leak_risk:high`) are filtered from
worker prompts.

### Concurrency model

Single-host, multi-process:
- Engine runs as a single Node.js process
- Agents are spawned as child processes (one per dispatched task)
- Concurrency is capped by `config.concurrency`
- State serialization uses file-based locking (busy-wait on `.state.lock`)
- No distributed coordination — designed for single-machine operation

### Storage

Dual-adapter storage layer (`store/knowledge.mjs`):
- **File adapter** (default) — JSON files on disk
- **GenesisDB adapter** — N-API in-process for graph + vector queries

The adapter is selected at startup based on config. Both implement the same
interface for CRUD + query operations.

## Design decisions

Detailed rationale for major decisions lives in `docs/ADR-O-*.md`:

| ADR | Decision |
|---|---|
| ADR-O-001 | Verify Gate — reviewer agent validates output before marking done |
| ADR-O-002 | GoVibe Integration — UI separation between orchestrator and domain UI |
| ADR-O-003 | Backend Store — file-first with GenesisDB upgrade path |
| ADR-O-004 | Role Boundary — native DACI enforcement in engine |
| ADR-O-005 | Provider Registry — pluggable provider adapters |
| ADR-O-006 | Topology — core-faces-A2A agent communication model |

## Scaling considerations

Current design is single-host. For multi-host scaling:
- Replace `state.json` + file lock with a DB with atomic CAS (Redis, SQLite, Postgres)
- Add a message broker for agent result collection
- Shard the task graph by independent subgraphs (waves)

The engine's internal abstractions (`saveState`, `claim`, `release`) are designed
to make this swap straightforward without changing the dispatch or governance logic.
