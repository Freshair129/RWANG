# RWANG Repository Cutover Compatibility Contract

## Purpose

This document defines how consumers move from the split repositories to the canonical RWANG repository without absorbing GoVibe or any target repository. The canonical URL is:

```text
https://github.com/Freshair129/RWANG
```

The former `Freshair129/Rwang-orchestrator` repository is the historical implementation and deprecation target. It is not declared archived by this document.

## State Model

### Pre-cutover

- `Freshair129/RWANG` is the canonical destination for architecture and the migration record.
- `Freshair129/Rwang-orchestrator` remains the historical implementation reference and is not yet archived.
- Stacked PRs `#25`-`#28` are open/pending and must be treated as unmerged.
- GoVibe and target repositories continue using their existing reviewed integration paths.
- No consumer may claim that a tagged canonical release is available based on this documentation alone.

### Cutover

The repository is in the cutover state only when both conditions are true:

1. The stacked PR chain `#25`-`#28` has been merged into `Freshair129/RWANG`.
2. A tagged RWANG release exists, or the owner has explicitly confirmed cutover for a specific commit.

After those conditions are met, each consumer still requires its own reviewed PR to change its dependency, endpoint, adapter configuration, or pinned commit. Cutover does not merge GoVibe or target source into RWANG.

### Post-cutover

- Consumers use the owner-approved RWANG tag or commit from `https://github.com/Freshair129/RWANG`.
- GoVibe remains a separate product repository and records its own compatibility decision.
- Target repositories remain external execution targets.
- `Freshair129/Rwang-orchestrator` may be archived only through a separate owner-authorized repository action or PR after consumer migration is verified. It is a deprecation target, not an already archived repository.

## Current-to-Target Mapping

| Current state | Target state | Owner of the change |
|---|---|---|
| Architecture and CR history in `Freshair129/RWANG` | Canonical architecture, runtime, contracts, and migration record in `https://github.com/Freshair129/RWANG` | RWANG PR chain |
| Runtime history in `Freshair129/Rwang-orchestrator` | History-preserved implementation ancestry represented in RWANG | RWANG import/overlay PRs |
| GoVibe consumer/product boundary | Separate GoVibe repository consuming a documented RWANG SDK, service/API, or adapter contract when available | GoVibe consumer PR |
| GenesisBlock, G-Maiden, and other target repositories | External target checkouts operated through approved adapters/workflows | Each target repository and its owner |
| Old orchestrator repository | Historical/deprecation target pending consumer verification and owner archive action | Separate old-repository PR or owner action |

## Migration Dependencies

- Wave 4 final tip: `64ec8ba`.
- Open stacked canonical PRs: [#25](https://github.com/Freshair129/RWANG/pull/25), [#26](https://github.com/Freshair129/RWANG/pull/26), [#27](https://github.com/Freshair129/RWANG/pull/27), and [#28](https://github.com/Freshair129/RWANG/pull/28).
- Canonical PR chain must merge in dependency order before cutover is declared.
- Owner must provide either a tagged RWANG release or explicit confirmation naming the approved commit.
- GoVibe requires a separate consumer PR; this repository does not implement or claim an SDK/service/API integration.
- `Freshair129/Rwang-orchestrator` requires a separate deprecation/transition PR or owner action; this repository does not archive it.
- Any target repository migration requires its own reviewed change and remains outside RWANG.

## Compatibility Rules

1. Consumers must pin an owner-approved RWANG tag or commit, not an unreviewed branch.
2. Consumers must preserve the external boundary for GoVibe and target repositories.
3. A configuration example is not evidence that an SDK, service endpoint, adapter implementation, or release exists.
4. Archive status for `Freshair129/Rwang-orchestrator` must be verified from the repository itself after owner action; this document records intent only.

## Verification Commands

Run from the canonical repository worktree:

```powershell
git diff --check
rg -n "Freshair129/RWANG|Rwang-orchestrator|cutover|GoVibe|external" README.md docs/COMPATIBILITY--RWANG-REPOSITORY-CUTOVER.md examples/govibe/README.md docs/BASELINE--RWANG-REPOSITORY-UNIFICATION-WAVE5-2026-07-26.md
git status --short
git diff --name-only
```

The final command must list only the Wave 5 allowlist. Runtime and package tests are intentionally out of scope for this documentation-only wave.
