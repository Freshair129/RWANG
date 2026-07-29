# CODEBASE_REALITY

- **Repository kind:** brownfield
- **Scan profile:** L1
- **Snapshot:** `.rwang/evidence/codebase-snapshot.json`
- **Snapshot SHA-256:** `d03fa2acb613dd6bb27ff34e88f82255720de6787665727ebc79f870c22b4d55`
- **Git HEAD:** `2d78496085e00ecf94d558a49ae00e4dea5eed85`
- **Generated:** 2026-07-26T23:55:47.5485745+07:00

## Deterministic inventory

- Files: 377
- Source files: 51
- Manifests: 7
- Tests: 45
- Automation files: 5

## Confirmed code truth

### Public skill surface

- RWANG exposes three public host skills: `rwang`, `rwang-review`, and
  `rwang-optimize`.
- The main command surface is `RWANG:init`, `RWANG:scan`, `RWANG:plan`,
  `RWANG:continue`, `RWANG:status`, `RWANG:impact`, and `RWANG:version`.
- `rwang-review` is a read-only review workflow. `rwang-optimize` is a measured
  optimization workflow with architecture-preservation gates.
- The public skills are not implemented in this repository. Their pinned
  distribution source is declared by `adapters/host-skills/registry.json` as
  the external `Freshair129/RWANG-PROMAX` bundle.

### Runtime capability surface

- `engine.mjs` owns task state, dependency, wave, claim, dispatch, review,
  worker-pool, and governance primitives.
- `planner.mjs` performs repository summarization, tier assignment, tool
  selection, and task planning.
- `providers.mjs`, `accounts.mjs`, and related account modules own provider
  capability resolution, health, dispatch, rotation, cooldown, and usage.
- `gks/` contains atom compilation, adaptive decomposition, approval chains,
  A2A surfaces, checkpoints, entitlement, loadouts, autonomy gates, ownership,
  RCA/refinement, verification, and telemetry.
- `store/` provides file and Genesis-backed knowledge storage. The current
  Genesis sidecar contains a workstation-specific default source path and is
  not a portable GoVibe integration contract.
- `orchestrator/governance/` contains the Python validation and promotion
  checks used by the current wave workflow.
- `packages/contracts` and `packages/core` are the only extracted workspace
  packages. Most runtime behavior remains in root modules.
- `studio/`, `src-tauri/`, `server.mjs`, and `monitor/` form the current local
  control and observability surfaces.

### Verification baseline

- `pnpm run verify` passed at this Git HEAD.
- Node runtime tests passed `236/236`.
- Runtime smoke checks passed `10/10`.
- Package tests passed: core `4/4`, contracts `8/8`.
- Governance contract self-test passed `8/8`; chain self-test passed `5/5`.
- The external host-skill bundle passed both `validate-bundle.ps1` and
  `test-functional.ps1`.

## Documentation drift

- `README.md`, `ARCHITECTURE.md`, and `CLAUDE.md` still present RWANG as the
  durable product/kernel identity. The latest owner direction instead makes
  GoVibe the product and command authority and treats RWANG only as a migration
  source.
- The current GoVibe owner/feature-map draft still describes RWANG as an
  external execution provider. That proposal is superseded by the newer owner
  direction but has not yet been replaced by an approved CR/ADR.
- `orchestrator.mjs` still carries a G-Maiden orchestrator identity in its
  header, despite residing in the RWANG runtime.
- The desired modular architecture is ahead of code reality: contracts and
  core are packages, while planner, providers, GKS, governance, state, and UI
  remain split across root folders and mixed-language entry points.
- The skill bundle is version-pinned outside this repository. A rename in only
  this repository would leave installed host commands and bundle provenance
  inconsistent.

## Unknowns and confidence limits

- L2 semantic indexing was not requested; this packet is an L1 structural and
  representative-source assessment.
- Final GoVibe destination paths and package names are not approved yet.
- The MSP process boundary and GenesisBlockDB adapter boundary remain governed
  by existing GoVibe ADRs and require reconciliation before runtime movement.
- The canonical relationship between human aliases such as `GoVibe:scan` and
  MCP tools such as `govibe.workspace.scan` is proposed, not implemented.
- The untracked `G:\govibe\engine\` tree was not treated as canonical target
  code because it is not committed repository truth.

## Planning gate

**Satisfied for documentation and migration planning only.**

This scan supports a C-3 capability-absorption CR. It does not authorize code
movement, deletion, repository archival, or command cutover. Those actions
require an approved GoVibe architecture/change contract and parity gates.
