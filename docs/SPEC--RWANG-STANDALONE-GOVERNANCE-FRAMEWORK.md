---
version: "0.1.0b"
created_at: "2026-07-01T00:00:00+07:00,ATHER,pending"
last_update: "2026-07-01T00:00:00+07:00,ATHER"
status: "candidate"
superseded_by: null
attributes:
  domain: "agent-governance"
  doc_type: "governance-framework"
  scope: "RWANG standalone orchestration governance"
  language: "en"
---

# SPEC--RWANG-STANDALONE-GOVERNANCE-FRAMEWORK

## 1. Purpose

This document is the self-contained governance framework for RWANG.

RWANG must operate as a standalone orchestra without relying on global agent instructions, external repository policy, or memory from another project. External documents may inspire the framework, but this file is the local contract agents, engine code, docs, UI, and automation must follow.

## 2. Core Principle

Choose the minimum process that preserves correctness, safety, maintainability, traceability, and cost control.

Every non-trivial task must declare:

- Complexity level: `C-0` to `C-3`
- Context-hop tier: `H0` to `H6`
- Compaction depth: `D1` to `D5`
- Dispatch tier: `T`
- Fan-out scale: `W2` to `W4` or `N/A`
- Risk: `LOW`, `MEDIUM`, or `HIGH`
- Required artifacts
- Verification plan

When uncertainty exists, choose the higher safety level or trigger Brief Here.

## 3. Axis Model

RWANG uses five independent axes. Do not overload one axis to mean another.

| Axis | Name | Meaning | Direction |
| --- | --- | --- | --- |
| `C` | Complexity | Process depth required before execution | Higher C = more review and artifacts |
| `H` | Context-Hop | Retrieval radius and tool-access scope | Higher H = wider context and higher cost |
| `D` | Compaction Depth | How many structural layers are packed into one physical document | Higher D = more abstract, fewer layers packed |
| `T` | Dispatch Tier | Execution/model/provider class | Depends on provider registry |
| `W` | Fan-out Scale | Branching width / peer connection count | Higher W = more coupling risk |

## 4. Complexity Levels

| Level | Name | Workflow | Use When | Default H |
| --- | --- | --- | --- | --- |
| `C-0` | Trivial | Text -> Code | Typo, comment, tiny config, isolated copy change | `H0` |
| `C-1` | Direct | Text -> Code | Small clear task, single-file bug fix, low-risk behavior | `H1` |
| `C-2` | Doc-Driven | Text -> Doc -> Code | Feature work, multi-file work, public behavior, medium risk | `H2` |
| `C-3` | Architecture-Driven | Text -> Doc -> Diagram -> Code | Architecture, governance, security, cross-system, platform-level work | `H3-H6` |

Rules:

- C-2 and C-3 require approved human-readable documentation before code.
- C-3 requires architecture review and owner approval before implementation.
- Do not downgrade complexity after approval without a recorded reason.

## 5. H Axis: Context-Hop / Access Scope

`H` controls how far an agent may retrieve context, inspect files, and request tool access.

| H Tier | Scope | Typical Work | Runtime intent |
| --- | --- | --- | --- |
| `H0` | Atom/subtask only | Tiny local edit, patch, config value | No broad search; atom-local context only |
| `H1` | Task/component | Component assembly, immediate imports/exports | Local neighborhood only |
| `H2` | Story/feature | Feature folder, nearby types, data contracts | Feature-level context |
| `H3` | Epic/module | Cross-module surface, integration, API/event contracts | Module-level context |
| `H4` | Phase/architecture | Architecture, governance, security, access control | Architecture scan, approval required |
| `H5` | Masterplan/roadmap | Platform direction, operating model | Whole-product context, owner approval required |
| `H6` | Full-network ceiling | Systemic coupling analysis, recovery, emergency audit | Rare escalation ceiling |

Hard rules:

- `H` is not compaction depth.
- `H` is not model quality.
- Higher `H` increases token cost and review burden.
- `H4-H6` require architecture approval before implementation.
- If an agent needs a higher H than the task allows, trigger Brief Here or request approval.

## 6. D Axis: Compaction Depth

`D` controls physical document packing. It answers: how many structural layers should be represented in one document?

| D Tier | Meaning | Typical Artifact |
| --- | --- | --- |
| `D5` | High-level abstraction | PRD, masterplan, architecture overview |
| `D4` | System design | SDD, ADR, platform standard |
| `D3` | Design-to-implementation bridge | feature spec, integration spec, runbook |
| `D2` | Low-level implementation design | LLD, API contract, test plan |
| `D1` | Code-adjacent detail | task note, patch note, exact command/check |

Rules:

- Use `D` only for document packing and abstraction height.
- A high `H` task can still use a low `D` artifact if it is doing precise work inside broad context.
- A low `H` task can still cite a high `D` document if the document is already approved and only used as a constraint.
- Generated atom files should stay compact; source docs carry the human-readable detail.

## 7. T Axis: Dispatch Tier

`T` controls who or what executes the work.

| T Class | Meaning |
| --- | --- |
| `T-local` | Local model or local deterministic tool |
| `T-cloud` | Cloud model/provider |
| `T-human` | User/owner decision |
| `T-reviewer` | Independent verifier or judge |
| `T-a2a` | External peer agent through a governed provider surface |

Rules:

- `T` is orthogonal to `H`: a small `H0` task may still need cloud execution if it is hard.
- Reviewer and executor should be separate when Verify Gate applies.
- Dispatch must respect cost caps, role authority, and governance gates.

## 8. W Axis: Fan-out Scale

`W` controls branching width and coupling risk.

| W Scale | Meaning | Rule |
| --- | --- | --- |
| `W2` | Normal | 3-5 sibling or peer connections |
| `W3` | Warning | 6-8 connections; lead review required |
| `W4` | Super-hub danger | 9+ connections; block high-risk deployment until decomposed or approved |

Use W-scale for task decomposition breadth, graph node degree, roadmap branching, agent room participant count, and context packets that risk token explosion.

## 9. Artifact Requirements

| Context | Required Artifact | Examples |
| --- | --- | --- |
| `C-0/H0` | Change note or task comment | tiny fix note, command output |
| `C-1/H1` | Task spec or issue note | local bug report, component contract |
| `C-2/H2` | Feature spec, runbook, or test plan | feature spec, API contract, acceptance criteria |
| `C-3/H3-H4` | SDD, ADR, architecture standard, threat model | module design, access model, migration plan |
| `C-3/H5-H6` | PRD, roadmap, operating model, systemic audit | masterplan, platform governance, recovery brief |

## 10. Docs-To-Code Gate

For `C-2` and `C-3`, implementation must be backed by an approved human-readable artifact.

Required trace:

```text
source document -> requirement/section -> atom/task -> agent assignment -> artifact -> review -> test evidence -> changelog
```

If an atom conflicts with its source document, the source document wins until a new document revision is approved.

## 11. Brief Here Gate

Brief Here is mandatory when:

- requirements are incomplete;
- acceptance criteria are missing or vague;
- declared context is missing, stale, or contradictory;
- multiple valid interpretations would materially change behavior;
- the agent needs a higher `H` than allowed;
- the change affects architecture, security, data, public API, or UX contract;
- the verifier cannot decide pass/fail because the original requirement is unclear.

Brief Here must produce a Brief Packet before the task resumes.

## 12. Version Lifecycle

Every canonical document should carry frontmatter:

```yaml
version: "0.1.0b"
created_at: "ISO-8601 timestamp,Agent,commit-or-pending"
last_update: "ISO-8601 timestamp,Agent"
status: "candidate"
superseded_by: null
attributes:
  domain: "..."
  doc_type: "..."
  scope: "..."
```

Allowed status values:

```text
draft, candidate, beta, active, stable, unstable, need review,
under review, deprecated, superseded
```

Version bump rules:

| Change | Bump |
| --- | --- |
| Rule removed, renamed, or restructured | major |
| New rule, SOP step, section, or required artifact | minor |
| Clarification, typo, formatting, examples | patch |
| Not approved yet | append `b` suffix |

Every canonical document should include a changelog table.

## 13. Runtime Enforcement Requirements

RWANG runtime should eventually enforce:

- task cannot dispatch if its required doc gate is missing;
- task cannot exceed allowed `H` without approval;
- `H4-H6` triggers architecture approval;
- `C-2/C-3` requires doc approval before implementation;
- unresolved Brief Here rooms block dispatch;
- governance gates cannot be bypassed by UI, CLI, daemon, MCP, or A2A;
- cost caps apply to execution, review, and Brief Room activity;
- all state transitions emit trace events.

## 14. Required Task Output Format

Every non-trivial agent task should output:

```markdown
**Complexity:** C-X
**Context-Hop:** H-Y
**Compaction Depth:** D-Z
**Dispatch Tier:** T-...
**W-Scale:** W2 / W3 / W4 / N/A
**Risk:** LOW / MEDIUM / HIGH
**Required Artifacts:** ...
**Plan:** ...
**Verification:** ...
```

## 15. Acceptance Criteria

- Agents can classify work without reading any external governance document.
- `H`, `D`, `T`, `C`, and `W` are defined locally and do not collide.
- Brief Here has a clear trigger contract.
- Version lifecycle rules are locally defined.
- C-2/C-3 work has a local docs-to-code gate.
- Runtime enforcement requirements are explicit enough to become implementation tasks.

---

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0b | 2026-07-01 | candidate | Initial self-contained RWANG governance framework with C/H/D/T/W axes, docs-to-code gate, Brief Here gate, and version lifecycle. | pending | ATHER |
