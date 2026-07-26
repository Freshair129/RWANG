# `.agents` — persistent, model-agnostic agent minds

Each agent's **mind** lives in `<id>-<codename>/`; the **model** is a swappable loadout. One mind,
many eyes. The machine-readable index of who exists is [`agt-registry.yaml`](agt-registry.yaml).

## Anatomy of an agent (`<id>-<codename>/`)
- `AGENTS.md` — charter: role, principles, boot & shutdown rituals. Model-agnostic. (Also auto-loaded
  by codex when this folder is cwd.)
- `MEMORY.md` — index/pointers into `.brain/`, read at boot.
- `config.yaml` — loadouts (runner + model + tools). Swap the model here; the identity is unchanged.
- `tool/` — granted capability wiring (wrappers, optional `mcp.json`).
- `asset/` — materials the agent reads or produces: `template/`, `script/`, `artifact/`.
- `.brain/` — working mind:
  - `inbound/` — **unvetted** intake from other sessions. Claims, not facts.
  - `knowledge-block/` — vetted, canonical knowledge.
  - `memory/` — working state: `goal.md`, `todo.md`, `concern.md`.
  - `rca/` — `rca-log.jsonl` (index) + `<rca-id>.md` (detail).
  - `session/` — `session-log.jsonl` (index) + `<session-id>.md` (detail).

## Rules
- **Intake gate** — `inbound/` → **CI + FACT check** → promote to `knowledge-block/` + add a
  `MEMORY.md` pointer. Nothing unvetted becomes canonical.
- **Adapter** — Claude Code hard-codes its registry path, so each agent's CC entry lives at
  `.claude/agents/<codename>.md` (outside `.agents/`) and points back to the charter.
- **Secrets** — never stored here. `config.yaml` lists env-var *names* only; runners hold their own
  auth (codex → `~/.codex`, Claude Code → its own store).
- **House style** — `*-log.jsonl` (append-only index) + `<id>.md` (detail), mirroring Rwang's
  `progress.ndjson` + `progress.json`.
