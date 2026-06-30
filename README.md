# RWANG (อาหวัง)

**Governed autonomous multi-agent orchestrator** — a desktop dev tool that dispatches
real AI agents (Claude, Ollama, Codex) to execute a DAG of tasks with dependency
gating, DACI governance, cost controls, and live progress monitoring.

> Zero external dependencies — runs on Node.js built-ins. Dispatches to `claude -p`.

---

## What it does

RWANG takes a **task backlog** (a DAG of typed atoms with dependencies) and autonomously:

1. **Plans** — topological wave ordering, adaptive decomposition for local models
2. **Routes** — maps task type → role → model tier (opus/sonnet/haiku/local)
3. **Dispatches** — spawns real AI agents (`claude -p`, `ollama`, `codex`) with scoped prompts
4. **Governs** — DACI persona borrow-checker, governance gates, cost caps, lease reclaim
5. **Reviews** — optional verify-gate (reviewer agent checks output vs acceptance criteria)
6. **Tracks** — live log streaming, usage metering, failure recording

## Key concepts

| Concept | Description |
|---|---|
| **Genesis Atom** | The unit of work — a typed, phased task with deps, acceptance criteria, and routing metadata |
| **GKS (Genesis Knowledge System)** | Compile, validate, and query the atom graph (acyclic, unique IDs, dep resolution) |
| **DACI Personas** | 9 agent personas (ARCHON, LYRA, RKOI, ATHER, GHOST, THESEUS, JANUS, KIN, VIBE) with role-based borrow capabilities |
| **Borrow Checker** | Reviewer/auditor personas get shared (&) access only — they cannot claim/dispatch (exclusive &mut) |
| **Permission Modes** | `safe` (edits only) for config/docs tasks, `full` (Bash ok) for code/test tasks |
| **H/D/T Axes** | H=context-hop tiers, D=compaction depth, T=model-routing tiers — orthogonal scales |

---

## Quick start

### Prerequisites

- **Node.js** ≥ 18
- **pnpm** (for the Studio UI)
- **Claude Code CLI** (`claude`) — for dispatching agents
- Optional: **Rust + Cargo** (for the Tauri desktop shell)
- Optional: **Ollama** (for local model dispatch)

### Run the engine + Studio UI

```bash
# Install Studio dependencies
cd studio && pnpm install && cd ..

# Start the engine server (serves API on :4577)
GORCH_BACKLOG=gks/backlog.gorch.json node server.mjs

# In another terminal — start the Studio UI (Vite dev on :5599)
cd studio && pnpm dev
```

Open `http://localhost:5599` → **Develop** tab to see the task board.

### Run with Tauri desktop shell

```bash
# Windows
dev.bat

# Or manually
pnpm -C studio tauri dev
```

### CLI usage

```bash
node orchestrator.mjs status              # overview + progress
node orchestrator.mjs next                # next ready task + model + acceptance
node orchestrator.mjs graph               # DAG as waves
node orchestrator.mjs graph --mermaid     # DAG as mermaid diagram

node orchestrator.mjs claim <id> -w alice # claim a task
node orchestrator.mjs done <id>           # mark complete
node orchestrator.mjs fail <id>           # mark failed
node orchestrator.mjs release <id>        # release back to todo
node orchestrator.mjs assign <id> opus    # override model

node orchestrator.mjs run                 # DRY-RUN: plan waves + routing
node orchestrator.mjs run --execute       # REAL: dispatch agents
node orchestrator.mjs run --execute --max 3
node orchestrator.mjs reset               # reset all tasks to todo
```

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    RWANG Desktop                      │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────┐ │
│  │ Studio UI   │   │ Engine       │   │ Tauri     │ │
│  │ (React/Vite)│◄──│ (engine.mjs) │◄──│ Shell     │ │
│  │ :5599       │   │ :4577        │   │ (Rust)    │ │
│  └─────────────┘   └──────┬───────┘   └───────────┘ │
│                           │                          │
│              ┌────────────┼────────────┐             │
│              ▼            ▼            ▼             │
│        ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│        │ Claude   │ │ Ollama   │ │ Codex    │       │
│        │ (cloud)  │ │ (local)  │ │ (cloud)  │       │
│        └──────────┘ └──────────┘ └──────────┘       │
└──────────────────────────────────────────────────────┘
```

### File structure

```
├── engine.mjs           # Core engine (DAG, claim, lease, routing, dispatch)
├── server.mjs           # HTTP API server (:4577)
├── orchestrator.mjs     # CLI interface
├── providers.mjs        # Provider adapters (Claude, Ollama, Codex, Antigravity)
├── planner.mjs          # Adaptive decomposition + wave planning
├── config.json          # Model routing, concurrency, providers, cost caps
├── personas.json        # DACI persona definitions
├── gks/                 # Genesis Knowledge System
│   ├── atoms.gorch.json # Source of truth for all atoms
│   ├── compile.mjs      # Compile atoms → backlog + .md files
│   ├── ownership.mjs    # Borrow checker (exclusive/shared/lease/fence)
│   ├── approval-chain.mjs # DACI approval state machine
│   └── atoms/           # Generated .md per atom (do not edit directly)
├── store/               # Storage adapters
│   ├── knowledge.mjs    # Knowledge adapter (file | genesisdb)
│   └── genesis-sidecar.mjs # GenesisBlockDB N-API driver
├── studio/              # React/Vite Studio UI
│   ├── src/
│   │   ├── App.tsx      # Main app (10 tabs)
│   │   ├── DevProgress.tsx  # Development progress board
│   │   ├── Board.tsx    # Kanban board
│   │   ├── Graph.tsx    # Dependency graph
│   │   ├── Cockpit.tsx  # System cockpit
│   │   └── store.ts     # Normalized atom store
│   └── package.json
├── src-tauri/           # Tauri v2 desktop shell
├── docs/                # ADRs, specs, design docs, masterplan
├── tests/               # Test suites
└── logs/                # Agent output logs (created at runtime)
```

---

## Studio UI tabs

| Tab | Purpose |
|---|---|
| **Develop** | Phase-grouped roadmap — claim/assign/dispatch tasks, drag persona chips, filter/group by owner, batch-assign, live agent log |
| **Board** | Kanban board (todo/claimed/running/done) |
| **Graph** | Interactive dependency graph |
| **Pipeline** | React Flow DAG builder (drag nodes, connect edges) |
| **Node↔DB** | GenesisBlockDB canvas |
| **Diagram** | Diagram ingest (drop diagrams → draft atoms) |
| **Cockpit** | System status, providers, usage, cost meter |
| **Loadout** | Persona equipment + model assignment |
| **Copilot** | AI copilot console |
| **Memory** | Knowledge graph browser |

---

## Model routing

Tasks are routed to models based on their type:

```
architecture / spike / plan / design  →  architect  →  claude:opus
code / impl / integration / test      →  coder      →  claude:sonnet
scaffold / config / docs              →  worker     →  claude:haiku (or ollama)
```

Override per-task via the UI dropdown or CLI `assign` command.
Owner persona role takes precedence: assigning ARCHON (architect) routes to opus.

---

## Providers

| Provider | Transport | Capabilities |
|---|---|---|
| **Claude** (Plan/API key) | subprocess (`claude -p`) | Full agent — file edit, shell, streaming |
| **Ollama** (local) | HTTP streaming | Text gen, tool use — free, no quota |
| **Codex** | subprocess | File edit, shell |
| **Antigravity** | subprocess | File edit, shell |
| **OpenRouter** | HTTP | Text gen (many models) |

Configure in `config.json` → `providers`. Switch auth mode (Plan ↔ API key) via UI or config.

---

## Governance

- **Governance gates**: atoms with `requiresConfirm: true` (or auto-gated types like `guard`, `safety`) must be explicitly confirmed before dispatch
- **DACI borrow checker**: reviewer/auditor personas (shared &) cannot take exclusive borrows (claim/dispatch) — enforced at engine level
- **Cost caps**: session and weekly USD limits with auto-downgrade at 80% and local-fallback at 90%
- **Lease reclaim**: stale claims (exceeded `leaseMs`) are automatically released
- **Kill switch**: emergency stop for all dispatch

---

## REST API

```
GET  /api/state                → full snapshot (progress, counts, tasks[])
GET  /api/log?id=X&offset=N   → incremental agent log
GET  /api/personas             → DACI persona list
GET  /api/providers            → provider health status
GET  /api/ollama               → Ollama model list + status
GET  /api/knowledge            → knowledge outcomes

POST /api/cmd  { action, id, worker, model, owner, ... }
  actions: claim · done · fail · release · assign · assignowner ·
           dispatch · confirm · unconfirm · run · stop · reset ·
           killswitch · settier · setdeps
```

---

## Configuration

All configuration lives in `config.json`:

- `concurrency` — max parallel agents (default: 3)
- `leaseMs` — claim lease timeout (default: 30 min)
- `providers` — provider configs (command, args, auth, tiers)
- `routing` — type → role → model mapping
- `usageLimits` — session/weekly cost caps
- `review` — verify-gate settings (autoRework, maxReworkRounds)
- `scope` — context scoping rules per phase

---

## Development

```bash
# Type-check the Studio UI
cd studio && npx tsc --noEmit

# Run engine tests
node --test gks/ownership.test.mjs
node --test gks/approval-chain.test.mjs
node --test store/knowledge.test.mjs

# Compile atoms (after editing gks/atoms.gorch.json)
node gks/compile.mjs

# Build Tauri desktop app
pnpm -C studio tauri build
```

---

## Origin

RWANG was extracted from [G-Maiden](https://github.com/Freshair129/G-Maiden)
(a Dota 2 AI companion) where it orchestrates the game's multi-agent development.
This standalone version is project-agnostic — bring your own backlog.

---

## License

MIT
