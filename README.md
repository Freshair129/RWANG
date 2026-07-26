# RWANG

**Canonical repository:** https://github.com/Freshair129/RWANG

**Status (2026-07-26):** Wave 5 consumer-cutover documentation is prepared on top of Wave 4 final tip `64ec8ba`. The stacked PR chain `#25`-`#28` is open/pending; no cutover, tagged release, or repository archive is claimed.

RWANG is the proposed canonical destination for the former split between `Freshair129/RWANG` as architecture authority and `Freshair129/Rwang-orchestrator` as active implementation. The transition remains approval-gated until the PR chain is merged and the owner authorizes a release or confirms cutover.

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

The consumer cutover is not complete. See the open stacked PR chain `#25`-`#28`, the [cutover compatibility contract](docs/COMPATIBILITY--RWANG-REPOSITORY-CUTOVER.md), and the [GoVibe consumer boundary example](examples/govibe/README.md) before changing an external consumer.

---

## Read next

- `docs/CR--RWANG-REPOSITORY-UNIFICATION.md`
- `docs/PLAN--RWANG-REPOSITORY-UNIFICATION-MIGRATION.md`
- `docs/BASELINE--RWANG-REPOSITORY-UNIFICATION-WAVE1-2026-07-26.md`
- `docs/BASELINE--RWANG-REPOSITORY-UNIFICATION-WAVE2-2026-07-26.md`
- `docs/BASELINE--RWANG-REPOSITORY-UNIFICATION-WAVE3-2026-07-26.md`
- `docs/BASELINE--RWANG-REPOSITORY-UNIFICATION-WAVE4-2026-07-26.md`
- `docs/COMPATIBILITY--RWANG-REPOSITORY-CUTOVER.md`
- `examples/govibe/README.md`
