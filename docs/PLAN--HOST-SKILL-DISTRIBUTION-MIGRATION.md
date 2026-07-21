---
version: "0.1.0b"
created_at: "2026-07-22T03:25:00+07:00,ATHER,pending"
last_update: "2026-07-22T03:25:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "rwang-architecture"
  doc_type: "migration-plan"
  scope: "Replace invalid parent gitlink with reproducible host-skill source registry"
---

# Plan - Host Skill Distribution Migration

## Observed state

`G:\Rwang` tracks `RWANG-PROMAX-skills` as gitlink `d1ea5caf0f263a4ca7692a8731c60d0bd0a56213`, but the parent has no `.gitmodules` mapping. `git submodule status` therefore fails. The child is a real separate checkout with remote `Freshair129/RWANG-PROMAX` and currently has owner changes; this plan does not modify it.

## Decision

Treat the host-skill bundle as an external distribution source, not as a harness submodule. The harness will eventually consume a versioned source registry entry that records repository URL, immutable commit, package validation command, supported hosts, and adapter compatibility. It will not contain a live checkout or rely on Git submodule initialization.

## Migration sequence

1. Preserve and independently commit or otherwise resolve the child checkout's existing owner changes. This is an explicit prerequisite.
2. Add a harness-owned source registry entry pinned to a reviewed child commit and a validation record from the child repository.
3. Add a host-skill adapter manifest that maps only supported capabilities; no skill is copied into the harness.
4. Clone the harness into a clean temporary directory and verify that it has no missing-submodule error and no required working-tree child.
5. Verify the pinned source checkout separately with its bundle validator and installation smoke tests.
6. Only after steps 1-5 pass, remove the parent gitlink. Do not delete or move the external source repository.

## Acceptance criteria

- `git submodule status` is clean because the parent has no unregistered gitlink.
- A fresh clone of `G:\Rwang` is usable without `RWANG-PROMAX-skills` materialized below it.
- The registry pin resolves to a validated external source commit.
- Installation/upgrade behavior remains owned by the bundle installer, not by harness runtime code.
- No automatic update claim is made for already-installed local skills; any updater requires its own user-consent and rollback design.

## Risk and boundary

**HIGH / C-3.** This changes repository provenance and installation topology. The current child worktree is dirty, so implementation is intentionally blocked until that external work is preserved and a source commit is selected.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0b | 2026-07-22 | beta | Initial reproducible external-source migration plan. | pending | ATHER |
