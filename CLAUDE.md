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

### Local-model (SLM) dispatch — read before routing a task to ollama

A local 4B on a non-micro task with missing context **loops on the same failed tool call**
until `toolsMaxIter` and returns nothing (observed: `qwen3.5:4b` burned 20 iterations, $0,
no answer). The must-know rules (full guide + benchmarks: `docs/guides/small-model-prompting.md`):

- **Right model for the job.** Implementation/Rust code → **Aroow-9B**
  (`ollama:hf.co/sillykiwi/Aroow-Rust-Coder-9B-Q4_K_S-GGUF:Q4_K_S`, benchmarked 4/4, warm 2s).
  Design/quality/review → **Gemma-12B** (`gemma-4-12b-it:UD-Q4_K_XL`) or escalate to Claude.
  **`qwen3.5:4b` is worker/scout tier (light text only) — never route impl to it.**
- **Micro-task or don't bother.** 1 prompt = 1 change, ≤150 lines, scaffold-first, send only
  the relevant lines (never a whole file), append "Output ONLY the code block."
- **Anti-loop.** Give shortcuts, not broad asks ("mock only X, use `as unknown as`, DO NOT
  mock every property"). Bounds: `toolsMaxIter: 20`, `maxReworkRounds: 1` then **escalate**.
  On BLOCKED / overflow → return `BLOCKED:<reason>` and stop, never retry endlessly.
- **Inject past mistakes (G1/G2/G3).** Failures are stored (`brain/failures.jsonl` + GenesisDB,
  `bge-m3` embed) and the top-k (`k=3`, `alpha=0.5`, threshold `0.6`) are injected as a
  `[ANTI-ERROR BLOCK]` into the next prompt. Degrade to static rules + Verify Gate in file mode.
- **When NOT local.** architecture / PRD / scope-approval / broad multi-subsystem search →
  `escalate_to_lead`. Local is for extraction / one-line edits / bounded single-file / H0.
- **Reviewer must out-tier the worker** (ollama→`sonnet`, sonnet→`opus`); a model can't
  self-review. Gate order: L0 shell (free) → L1 local pre-filter (escalate-only) → L2 paid.
- **Hardware (3060 12GB):** don't set `num_ctx` globally (cold-load prefill stalls); don't set
  `OLLAMA_KV_CACHE_TYPE=q8_0`; `num_ctx 8192` sweet spot; keep prompt ≤ `scope.budgetTokens`.
  `node vram-mode.mjs build|match` toggles the Ollama VRAM budget (~9GB dev / ~3GB gaming).

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
