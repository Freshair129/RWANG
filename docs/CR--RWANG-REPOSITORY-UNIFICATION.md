---
version: "0.1.1b"
created_at: "2026-07-26T15:10:00+07:00,ATHER,pending"
last_update: "2026-07-26T23:08:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  domain: "rwang-architecture"
  doc_type: "architecture-change-request"
  scope: "Unify Freshair129/RWANG and Freshair129/Rwang-orchestrator into one canonical RWANG repository"
  language: "en"
---

# CR - RWANG Repository Unification

## 1. Decision requested

Approve unifying `Freshair129/RWANG` and `Freshair129/Rwang-orchestrator` into a single canonical repository named `RWANG`, while keeping `GoVibe` and all target project repositories separate.

For avoidance of doubt:

- the canonical destination repository is `Freshair129/RWANG`;
- `Freshair129/Rwang-orchestrator` is the source implementation repository to be merged into that destination;
- `GoVibe` remains an external consumer, not a subtree to be imported.

This CR authorizes repository-topology consolidation, documentation/runtime co-location, and package/module boundary cleanup.

This CR does **not** authorize:

- folding `GoVibe` into `RWANG`;
- folding target repositories into `RWANG`;
- changing product boundaries between Mission Control and the execution kernel;
- rewriting the runtime into a new language as part of the merge.

Example and fixture note:

- `examples/govibe/*` inside `RWANG`, if added later, are example integrations only;
- they do not change product ownership or authorize copying `GoVibe` application source into `RWANG`.

## 2. Verified current state

| Surface | Confirmed truth | Current problem |
|---|---|---|
| CR authority | CR #23 and CR #24 live in `Freshair129/RWANG`. | Architecture decisions for execution/runtime land in a repository that is not the active implementation checkout. |
| Local runtime checkout | `G:\Rwang` currently points to `https://github.com/Freshair129/Rwang-orchestrator.git`. | Runtime code, issues, and CR history are split across repository identities. |
| GoVibe boundary | `G:\govibe` points to `https://github.com/Freshair129/govibe.git` and contains Mission Control UI plus MCP public surface. | GoVibe is a consumer/product surface, but the split between its public contract and RWANG kernel is still partially duplicated in code. |
| RWANG runtime | `engine.mjs`, `server.mjs`, `providers.mjs`, `orchestrator/governance/*`, `config.json`, and related tests in `G:\Rwang` are the active execution surfaces. | Runtime truth and architectural change authority are not co-located. |
| Traceability | A single CR can reference runtime behavior, verification, and delivery flow. | The implementation path currently needs cross-repo issue linking even when the product/runtime change is logically one unit. |

## 3. Problem

The current split makes one product/runtime appear to be two repositories:

- `RWANG` reads like the canonical product and architecture home;
- `Rwang-orchestrator` behaves like the active implementation/runtime home.

That split creates avoidable drift risks:

1. CRs can be approved without landing in the active runtime repository.
2. Runtime changes can ship without the canonical architecture repository reflecting them.
3. Agents and humans must inspect two repositories to understand one system.
4. Release and tag history can diverge across surfaces that belong to one execution kernel.
5. Product/runtime identity becomes ambiguous in issue, PR, and documentation references.

## 4. Architectural decision

Adopt `Freshair129/RWANG` as the single canonical repository for the RWANG product/runtime.

`Freshair129/Rwang-orchestrator` will be migrated into that repository and then archived or deprecated after compatibility and history preservation are verified.

`GoVibe` remains a separate repository and product boundary:

```text
GoVibe UI / MCP / Mission Control
        |
        | consumes
        v
RWANG SDK / service / execution API
        |
        v
RWANG execution kernel + adapters + verification
```

Target repositories also remain external:

```text
RWANG -> executes against / integrates with -> govibe, GenesisBlock, G-Maiden, other target repos
```

## 5. Target repository shape

The merged repository should converge toward this structure:

```text
RWANG/
├─ README.md
├─ docs/
│  ├─ architecture/
│  ├─ governance/
│  ├─ RFC/
│  └─ change-requests/
├─ packages/
│  ├─ contracts/
│  ├─ core/
│  ├─ adapters/
│  └─ sdk/
├─ orchestrator/
│  ├─ runner/
│  ├─ routing/
│  ├─ verification/
│  ├─ governance/
│  └─ state/
├─ adapters/
│  ├─ project/
│  ├─ worker/
│  ├─ scm/
│  └─ verification/
├─ specs/
├─ tests/
├─ monitor/
└─ examples/
   └─ govibe/
```

This target tree is a desired end state, not a requirement that every folder appear in the first migration PR.

## 6. Canonical boundaries after unification

### 6.1 RWANG owns

- architecture and runtime contracts;
- execution kernel;
- routing, retry, review, repair, and verification policy;
- adapters for project, worker, SCM, and verification providers;
- local state and runtime fixtures required to resume RWANG execution.

### 6.2 GoVibe owns

- product-facing Mission Control UX;
- MCP/public orchestration surface;
- consumer-side configuration and operator workflows;
- integration usage of RWANG, not RWANG core ownership.

### 6.3 Target repositories own

- their own source trees, releases, and product/runtime boundaries;
- project-specific code and local acceptance reality;
- any consumer-side integration code that depends on RWANG.

## 7. Required migration rules

1. Preserve repository history; do not copy runtime files without history when subtree or equivalent history-preserving migration is available.
2. Do not merge `GoVibe` into `RWANG`.
3. Do not move target repository code into `RWANG`.
4. Keep provider secrets, local credentials, and runtime-only state untracked.
5. Treat `runs/` as runtime data, not canonical source; only fixtures that are intentionally versioned belong in Git.
6. Do not let documentation become a runtime database merely because docs and code become co-located.
7. Core/kernel packages must not import `GoVibe`.

## 8. Phased delivery

### Phase 1 - Docs-first repository decision

- Record this repository-unification decision.
- Record target directory ownership and migration rules.
- Mark `RWANG` as the canonical destination.

### Phase 2 - History-preserving code import

- Bring runtime code from `Rwang-orchestrator` into `RWANG` with preserved history.
- Establish temporary compatibility paths where needed.

### Phase 3 - Internal restructuring

- Re-home modules into the target package/orchestrator layout incrementally.
- Keep behavior stable while boundaries are clarified.

### Phase 4 - Contract cleanup

- Align CR #23 and CR #24 implementation surfaces to the unified repository.
- Introduce explicit adapter and canonical-task boundaries inside the merged tree.

### Phase 5 - Repository deprecation

- Freeze the old repository.
- Add a compatibility notice and archive/deprecation guidance.

## 9. Acceptance criteria

- `RWANG` is the only canonical repository for RWANG architecture and runtime implementation.
- A CR against RWANG execution/runtime can be implemented, reviewed, and released from the same repository.
- `GoVibe` remains a separate repository and consumes RWANG through an explicit boundary.
- Target repositories remain external to `RWANG`.
- The merged repository preserves history for imported runtime code.
- The unified repository can explain architecture, runtime, tests, and migration state without requiring a second RWANG-named repository.

## 10. Risks

| Risk | Why it matters | Required mitigation |
|---|---|---|
| History loss | A plain file copy would destroy blame and migration evidence. | Use subtree or equivalent history-preserving migration. |
| Boundary collapse | The merge could accidentally pull GoVibe concerns into RWANG core. | Enforce package boundaries and keep GoVibe external. |
| Runtime breakage during path moves | Imports/scripts may break while files are re-homed. | Use staged compatibility passes and baseline verification gates. |
| Dirty-state confusion | The active local checkout already contains uncommitted work. | Migrate on a scoped branch with baseline verification before archive/deprecation decisions. |

## 11. Relationship to CR #23 and CR #24

- CR #23 owns review/verification-policy behavior.
- CR #24 owns provider-boundary separation between project management, execution kernel, SCM, and verification.
- This CR owns the repository topology needed so those changes land in one canonical RWANG implementation home instead of split authority across `RWANG` and `Rwang-orchestrator`.

## 12. Decision summary

`RWANG` and `Rwang-orchestrator` should become one repository.

`GoVibe` should remain separate.

Target repositories should remain separate.

The merged repository should be `Freshair129/RWANG`.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.1b | 2026-07-26 | beta | Clarified canonical destination wording and made the external-consumer boundary explicit for GoVibe examples and source ownership. | pending | ATHER |
| 0.1.0b | 2026-07-26 | beta | Initial CR for canonical RWANG repository unification and boundary preservation. | pending | ATHER |
