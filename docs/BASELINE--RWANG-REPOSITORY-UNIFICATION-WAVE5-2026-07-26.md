---
version: "0.1.0b"
created_at: "2026-07-26T00:00:00+07:00,ATHER,pending"
last_update: "2026-07-26T20:02:05+07:00,ATHER"
status: "candidate"
superseded_by: null
attributes:
  domain: "repository-migration"
  doc_type: "baseline"
  scope: "canonical RWANG consumer cutover"
---

# Wave 5 Canonical RWANG Consumer Cutover Baseline

## Objective

Document the consumer cutover contract for the canonical RWANG repository while keeping GoVibe and all target repositories external. This wave is documentation-only and does not implement runtime, package, SDK, service, API, adapter, or consumer changes.

## Exact Scope

Allowed files:

- `README.md`
- `examples/govibe/README.md`
- `docs/COMPATIBILITY--RWANG-REPOSITORY-CUTOVER.md`
- `docs/BASELINE--RWANG-REPOSITORY-UNIFICATION-WAVE5-2026-07-26.md`

Directories may be created only for the allowed documentation path `examples/govibe/`.

Forbidden in this wave:

- runtime, package, configuration, test, lockfile, generated-state, or Wave 1-4 evidence files;
- GoVibe source or copied target-repository source;
- changes to `Freshair129/Rwang-orchestrator`;
- merges, tags, releases, or archive actions.

## Current-to-Target Architecture Mapping

| Current | Target after approved cutover |
|---|---|
| `Freshair129/RWANG` holds architecture and migration authority | `https://github.com/Freshair129/RWANG` is the canonical architecture and executable-runtime repository |
| `Freshair129/Rwang-orchestrator` holds historical implementation ancestry | Its history is represented in RWANG; the old repository remains a separate deprecation target until owner-authorized transition |
| GoVibe is a separate visual product/control-plane consumer | GoVibe remains external and consumes only a documented RWANG SDK, service/API, or adapter contract when one is actually available |
| GenesisBlock, G-Maiden, and other projects are execution targets | Target repositories remain external checkouts and are not copied into RWANG |

## Migration Dependencies

- Baseline source: Wave 4 final tip `64ec8ba`.
- Open stacked PR dependencies: [#25](https://github.com/Freshair129/RWANG/pull/25), [#26](https://github.com/Freshair129/RWANG/pull/26), [#27](https://github.com/Freshair129/RWANG/pull/27), and [#28](https://github.com/Freshair129/RWANG/pull/28).
- Cutover requires the PR chain to be merged plus a tagged release or explicit owner confirmation naming the approved commit.
- GoVibe needs a separate reviewed consumer PR and is not changed by this wave.
- The old `Freshair129/Rwang-orchestrator` repository needs a separate deprecation/transition PR or owner action and is not archived by this wave.
- Any target-repository dependency update remains a separate consumer/target change.

## Acceptance Criteria

1. Every document names `https://github.com/Freshair129/RWANG` as the canonical URL.
2. The compatibility contract distinguishes pre-cutover, cutover, and post-cutover states.
3. Cutover is blocked until the merged PR chain and tagged release or explicit owner confirmation exist.
4. `Freshair129/Rwang-orchestrator` is identified as historical/deprecation target and not already archived.
5. `examples/govibe/README.md` is documentation/configuration shape only and does not claim an implemented SDK.
6. GoVibe and target repositories are explicitly external.
7. README status says the PR chain is open/pending and makes no completed-release claim.
8. No file outside the allowlist changes.

## Verification Commands

```powershell
git diff --check
rg -n "Freshair129/RWANG|Rwang-orchestrator|cutover|GoVibe|external" README.md docs/COMPATIBILITY--RWANG-REPOSITORY-CUTOVER.md examples/govibe/README.md docs/BASELINE--RWANG-REPOSITORY-UNIFICATION-WAVE5-2026-07-26.md
git diff --name-only
git status --short
```

Expected verification:

- `git diff --check`: PASS.
- The `rg` command finds canonical URL, old-repository transition, state wording, GoVibe boundary, and external-boundary wording in the allowlisted documents.
- `git diff --name-only` contains only the four allowed files.
- No runtime/package/test command is required because Wave 5 changes no executable surface.

## Risk And Worker Split

Risk: **MEDIUM**. The change is documentation-only, but inaccurate state or release wording could cause an external consumer to cut over prematurely.

- **Luna implementation:** edit only the allowlisted documentation, preserve pending/owner gates, and run the requested text and scope checks.
- **Terra review:** independently review the diff for false release/archive claims, boundary leakage, missing migration dependencies, and allowlist violations.
- **Parent final grade:** verify the actual worktree, resolve any review findings, and report residual actions that require merge, release, consumer-PR, deprecation-PR, or archive authority.

## Separate Follow-up Work

- Canonical RWANG: merge PRs `#25`-`#28` in dependency order.
- Owner/release authority: create a tagged release or explicitly confirm the approved cutover commit.
- GoVibe: open and review a separate consumer PR after the canonical cutover gate passes.
- Old repository: open a separate deprecation/transition PR or perform an owner-authorized archive action only after consumer migration is verified.
- Target repositories: update each external consumer independently; no target source enters RWANG.

## Changelog

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-07-26 | candidate | Documented canonical consumer cutover, external boundaries, and owner-gated transition. | pending | ATHER |
