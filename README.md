# RWANG

**RWANG is the canonical repository for the governed autonomous execution kernel and control plane.**

It unifies the former split between `Freshair129/RWANG` as architecture authority and `Freshair129/Rwang-orchestrator` as active implementation, so architecture, runtime, tests, and migration state can now converge in one repository.

---

## What RWANG is

RWANG is the reusable execution kernel for governed autonomous software work.

It owns:

- orchestration and execution runtime behavior;
- routing, verification, review, and governance policy;
- provider, worker, SCM, and verification boundaries;
- reusable contracts and core package surfaces inside the monorepo.

---

## Repository boundaries

RWANG is the kernel and control plane. It is **not** the visual Mission Control product and it is **not** the target application repository being changed.

- `GoVibe` remains a separate consumer/product repository.
- Target repositories such as `GenesisBlock`, `G-Maiden`, and other projects remain external.
- RWANG executes against or is consumed by those repositories through explicit boundaries rather than absorbing them into the canonical tree.

---

## What the unified repository contains now

The unified repository brings together:

- canonical architecture and change-request documents;
- active runtime entrypoints and orchestration logic;
- governance and verification tooling;
- migration tooling for the repository unification itself;
- initial monorepo package surfaces such as `@rwang/contracts` and `@rwang/core`.

---

## Monorepo direction

RWANG is converging toward a modular monorepo shape with workspace metadata at the root and reusable package boundaries under `packages/`.

Current migration direction includes:

- `packages/contracts` for canonical task and adapter contracts;
- `packages/core` for reusable execution-kernel helpers;
- `orchestrator/` for deterministic routing, governance, verification, and runner logic;
- `tests/` for runtime and package verification.

This README describes the intended canonical repository identity. It does not claim that every long-term folder move is already complete on every migration branch.

---

## Quick start

Typical verification flow in the canonical repository:

```powershell
pnpm install
pnpm run runtime:smoke
pnpm run test
```

Migration-specific helpers in this repository support:

- preflight import checks;
- conflict-resolution assistance;
- post-import overlay application;
- destination-side migration audit.

---

## Migration status

As of 2026-07-26, the repository-unification workflow includes:

- history-preserving import preparation for `Freshair129/Rwang-orchestrator` into `Freshair129/RWANG`;
- rehearsed conflict-resolution guidance for the known top-level authority conflicts;
- phase-based overlay tooling for re-applying monorepo bootstrap and package extraction work;
- end-state audit tooling for the canonical destination.

---

## Read next

- `docs/CR--RWANG-REPOSITORY-UNIFICATION.md`
- `docs/PLAN--RWANG-REPOSITORY-UNIFICATION-MIGRATION.md`
- `docs/PLAYBOOK--CANONICAL-RWANG-HISTORY-IMPORT.md`
- `docs/PLAYBOOK--CANONICAL-RWANG-CONFLICT-RESOLUTION.md`
- `docs/PLAN--CANONICAL-RWANG-POST-IMPORT-MONOREPO-OVERLAY.md`
- `docs/SPEC--CANONICAL-RWANG-ENDSTATE-AUDIT.md`