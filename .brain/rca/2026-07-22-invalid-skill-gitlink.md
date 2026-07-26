---
version: "0.1.0b"
created_at: "2026-07-22T03:50:00+07:00,ATHER,pending"
last_update: "2026-07-22T03:50:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "rwang-host-skills"
  doc_type: "rca"
  scope: "Invalid parent gitlink for external skill distribution"
---

# RCA - Invalid Skill Gitlink

## Symptom

`git submodule status` failed in the harness with no `.gitmodules` mapping for `RWANG-PROMAX-skills`.

## Evidence

The parent index contained mode `160000` for `RWANG-PROMAX-skills` at `d1ea5caf0f263a4ca7692a8731c60d0bd0a56213`; the parent had no `.gitmodules`. The nested path was a separate checkout with its own remote and worktree rather than a configured submodule.

## Root Cause

An external distribution repository was recorded as a Git submodule entry without the required parent submodule configuration. The parent therefore depended on an unreproducible nested checkout.

## Why the issue escaped detection

Parent runtime tests did not run `git submodule status` or clone the repository into a clean workspace.

## Remediation

The external bundle was checkpointed at `31a61d36728824f21d67d8b10e98664abc3ba763`. The parent gitlink was removed without deleting the local checkout and replaced with `adapters/host-skills/registry.json`, an immutable external source pin, and a registry test. A clean local clone confirmed no nested checkout and no submodule failure.

## Prevention

Keep host-skill sources in an explicit registry. If submodules are ever chosen, require both an index gitlink and a valid `.gitmodules` entry, verified by a clean-clone test.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0b | 2026-07-22 | beta | Initial root cause and verified remediation. | pending | ATHER |
