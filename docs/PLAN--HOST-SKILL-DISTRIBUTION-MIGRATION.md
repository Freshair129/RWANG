---
version: "0.1.2b"
created_at: "2026-07-22T03:25:00+07:00,ATHER,pending"
last_update: "2026-07-22T03:50:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "rwang-architecture"
  doc_type: "migration-plan"
  scope: "Replace invalid parent gitlink with reproducible host-skill source registry"
---

# Plan - Host Skill Distribution Migration

## Observed state

`G:\Rwang` tracks `RWANG-PROMAX-skills` as gitlink `d1ea5caf0f263a4ca7692a8731c60d0bd0a56213`, but the parent has no `.gitmodules` mapping. `git submodule status` therefore fails. The child is a real separate checkout with remote `Freshair129/RWANG-PROMAX`.

## Decision

Treat the host-skill bundle as an external distribution source, not as a harness submodule. The harness will eventually consume a versioned source registry entry that records repository URL, immutable commit, package validation command, supported hosts, and adapter compatibility. It will not contain a live checkout or rely on Git submodule initialization.

## Migration sequence

1. Preserve and independently commit the child checkout. Complete at `31a61d36728824f21d67d8b10e98664abc3ba763`.
2. Add a harness-owned source registry entry pinned to that reviewed child commit and its validation record. Complete in `adapters/host-skills/registry.json`.
3. Make the nested checkout ignored by the parent; no skill is copied into the harness.
4. Remove the parent gitlink without deleting the external checkout. Complete.
5. Verify parent Git topology and the registry test from a fresh clone. Complete: no nested checkout, no submodule error, registry test pass, and runtime-import test pass.

## Acceptance criteria

- `git submodule status` is clean because the parent has no unregistered gitlink.
- A fresh clone of `G:\Rwang` is usable without `RWANG-PROMAX-skills` materialized below it.
- The registry pin resolves to a validated external source commit.
- Installation/upgrade behavior remains owned by the bundle installer, not by harness runtime code.
- No automatic update claim is made for already-installed local skills; any updater requires its own user-consent and rollback design.

## Risk and boundary

**HIGH / C-3.** This changed repository provenance and installation topology. The child checkpoint, registry pin, parent removal, and fresh-clone verification are complete.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.2b | 2026-07-22 | beta | Removed invalid gitlink and passed clean-clone topology/runtime verification. | pending | ATHER |
| 0.1.1b | 2026-07-22 | beta | Pinned validated external source after child checkpoint; ready to remove invalid parent gitlink. | pending | ATHER |
| 0.1.0b | 2026-07-22 | beta | Initial reproducible external-source migration plan. | pending | ATHER |
