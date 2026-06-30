# CLAUDE.md

Instructions for Claude Code when working in this repository.

## What RWANG is

A **governed autonomous multi-agent orchestrator** — a desktop dev tool that
dispatches real AI agents (Claude, Ollama, Codex) to execute a DAG of typed tasks
with dependency gating, DACI governance, cost controls, and live progress
monitoring.

## Project structure

```
├── engine.mjs           # Core engine (DAG, claim, lease, routing, dispatch)
├── server.mjs           # HTTP API server (:4577)
├── orchestrator.mjs     # CLI interface
├── providers.mjs        # Provider adapters (Claude, Ollama, Codex, etc.)
├── planner.mjs          # Adaptive decomposition + wave planning
├── config.json          # Configuration (routing, providers, limits)
├── personas.json        # DACI persona definitions
├── gks/                 # Genesis Knowledge System
│   ├── atoms.gorch.json # THE source of truth for atoms — edit this, not .md
│   ├── compile.mjs      # Compile JSON → backlog + .md files
│   ├── ownership.mjs    # Borrow checker
│   └── approval-chain.mjs # DACI approval state machine
├── store/               # Storage adapters (file | GenesisDB)
├── studio/              # React/Vite Studio UI
│   └── src/             # TypeScript components
├── src-tauri/           # Tauri v2 desktop shell (Rust)
├── docs/                # ADRs, specs, design docs
└── tests/               # Test suites
```

## Build & test commands

```bash
# Engine tests
node --test gks/ownership.test.mjs
node --test gks/approval-chain.test.mjs
node --test store/knowledge.test.mjs

# Studio type-check
cd studio && npx tsc --noEmit

# Compile atoms (after editing gks/atoms.gorch.json)
node gks/compile.mjs

# Dev server
node server.mjs              # Engine API :4577
cd studio && pnpm dev         # Studio UI :5599

# Tauri desktop
pnpm -C studio tauri dev      # Dev mode
pnpm -C studio tauri build    # Release build
```

## Key rules

### Atom editing
- **Edit `gks/atoms.gorch.json` then run `compile.mjs`** — the `.md` files in
  `gks/atoms/` and `backlog.gorch.json` are generated/overwritten.
- Never edit generated atom `.md` files directly.

### Engine invariants
- All state mutations go through `saveState()` — never write `state.json` directly
- File-lock serialization via `lockfile()`/`unlockfile()` for atomic claim
- Dependency gating: a task is only `ready` when all its `deps` are `done`
- Borrow checker: reviewer/auditor personas (shared &) cannot claim or dispatch

### Permission modes
- `safe` (edits only) — for config, docs, scaffold tasks
- `full` (Bash ok) — for code, eval, guard tasks
- Routed per task type in `engine.mjs` → `permissionFor(t)`

### Providers
- Engine core uses **zero external npm dependencies** — Node.js built-ins only
- Provider adapters (`providers.mjs`) handle spawn, streaming, cost extraction
- Claude spawns with `--output-format stream-json --verbose`

### Coding standards
- ES modules (`import`/`export`)
- Async/await throughout
- No comments unless the WHY is non-obvious
- Studio UI: functional React components, CSS variables for theming
- Rust: `cargo clippy -D warnings`

### Commit convention
```
feat(engine): description
fix(studio): description
docs(adr): description
```
Scope: `engine`, `studio`, `gks`, `providers`, `tauri`, `docs`
