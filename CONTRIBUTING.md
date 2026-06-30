# Contributing to RWANG

Thank you for your interest in contributing to RWANG. This guide covers the
development workflow, coding standards, and submission process.

## Getting started

1. **Fork & clone** the repository
2. **Install dependencies**: `pnpm install` in `studio/`
3. **Start the dev environment**: `dev.bat` (Windows) or manually:
   ```bash
   node server.mjs          # Engine API on :4577
   cd studio && pnpm dev    # Studio UI on :5599
   ```
4. **Run tests** before submitting:
   ```bash
   node --test gks/ownership.test.mjs
   node --test gks/approval-chain.test.mjs
   node --test store/knowledge.test.mjs
   ```

## Project structure

- `engine.mjs` — core orchestration engine (DAG, claim, lease, dispatch)
- `providers.mjs` — provider adapters (Claude, Ollama, Codex, etc.)
- `gks/` — Genesis Knowledge System (atom graph, compile, ownership)
- `studio/` — React/Vite Studio UI
- `src-tauri/` — Tauri v2 desktop shell (Rust)
- `docs/` — ADRs, specs, design docs

## Development workflow

### Branch naming

```
feat/<short-description>     # New feature
fix/<short-description>      # Bug fix
docs/<short-description>     # Documentation only
refactor/<short-description> # Code refactoring
```

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(engine): add verify-gate reviewer dispatch
fix(studio): correct filter reset on tab switch
docs(adr): add ADR-O-007 for cost model
refactor(providers): extract common spawn logic
```

Scope should match the subsystem: `engine`, `studio`, `gks`, `providers`, `tauri`, `docs`.

### Pull request checklist

- [ ] Tests pass (`node --test ...`)
- [ ] Type-check passes (`cd studio && npx tsc --noEmit`)
- [ ] No new lint warnings
- [ ] ADR written if the change is architecturally significant
- [ ] README updated if public API or CLI changed

## Coding standards

### JavaScript (engine, providers, GKS)

- **ES modules** (`import`/`export`, `"type": "module"` in package.json)
- **Node.js built-ins only** — no external dependencies in the engine core
- **Async/await** over callbacks or raw promises
- File-level locking via `lockfile()` / `unlockfile()` for state mutations
- All state mutations go through `saveState()` — never write `state.json` directly

### TypeScript (Studio UI)

- Strict mode enabled
- Functional components + hooks
- State management via the normalized atom store (`store.ts`)
- CSS variables for theming — no hardcoded colors

### Rust (Tauri shell)

- `cargo clippy -D warnings` must pass
- `#![allow(dead_code)]` only for built-ahead modules not yet wired up
- Follow Tauri v2 plugin patterns

## Adding a new provider

See [docs/GUIDE--ADDING-PROVIDER.md](docs/GUIDE--ADDING-PROVIDER.md) for the
step-by-step guide. In short:

1. Add provider config to `config.json` → `providers`
2. Implement `run<Name>(t, log, opts)` in `providers.mjs`
3. Register in the provider registry switch
4. Add UI controls in Studio if needed

## Writing atoms

Atoms are the unit of work in RWANG. The source of truth is
`gks/atoms.gorch.json`. **Do not edit the generated `.md` files in `gks/atoms/`
directly** — they are overwritten on compile.

```bash
# After editing atoms.gorch.json:
node gks/compile.mjs
```

## Reporting bugs

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Engine version (`package.json` → `version`)
- Node.js version (`node --version`)
- OS and architecture

## Code of Conduct

Be respectful, constructive, and inclusive. We follow the
[Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
