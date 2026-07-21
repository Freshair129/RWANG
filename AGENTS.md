---
version: "0.1.0b"
created_at: "2026-07-22T04:40:00+07:00,ATHER,pending"
last_update: "2026-07-22T04:40:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "agent-governance"
  doc_type: "core-directive"
  scope: "G:\\Rwang"
---

# RWANG Repository Working Agreement

## Repository boundaries

`G:\Rwang` is the canonical RWANG harness/control plane. It owns orchestration, governance, providers, runtime evidence, and adapter contracts. It does not become the source checkout for every target project it orchestrates.

- `adapters/desktop-motion/` validates the local-only `gesture_command_intent/v1` contract. It records redacted intent evidence only; it does not open a listener or dispatch OS input.
- `D:\rwang-motion-lab` is a separate experimental Tauri/React project. It is not `RWANG-PROMAX`; do not claim release readiness without the hardware gates in `docs/CR--RWANG-MOTION-LAB-BOUNDARY.md`.
- `adapters/host-skills/registry.json` is the source of truth for host-skill distribution pins. The harness must not reintroduce `RWANG-PROMAX-skills` as an unregistered gitlink or nested tracked checkout.

## Change discipline

1. Classify cross-repository, adapter, provenance, policy, or OS-input changes as **HIGH / C-3**. Start from the approved CR/RCA, update the relevant documentation, implement surgically, then run architecture and runtime checks.
2. For runtime failures, record an evidence-backed RCA in `.brain/rca/` before changing behavior.
3. Preserve unrelated dirty files. Stage only the files in scope.
4. Do not push, create PRs, merge, deploy, or add remote transports without explicit owner approval.
5. Treat hardware evidence as distinct from unit/build evidence. Never promote `RWANG-PROMAX` from simulated or offline tests alone.

## Required checks

Run the smallest relevant set, then include all of these for harness/adapter boundary changes:

```powershell
node --test tests/runtime-import.test.mjs
node --test tests/gesture-command-intent.test.mjs
node --test tests/host-skill-registry.test.mjs
```

For a distribution-topology change, make a clean local clone and verify it has no required nested skill checkout or submodule error. For Motion Lab changes, run its focused test and production build in its own repository.

## Current promotion gates

`RWANG-PROMAX` remains reserved. The remaining gates are real camera/media hardware E2E, depth-gesture proof on hardware, and a separately approved live transport if the harness is ever to consume desktop intents.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0b | 2026-07-22 | beta | Initial harness boundary, validation, and promotion-gate agreement. | pending | ATHER |
