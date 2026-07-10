---
version: "0.7.0b"
created_at: "2026-07-01T00:00:00+07:00,ATHER,pending"
last_update: "2026-07-10T00:00:00+07:00,ClaudeFable"
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

**Scope and precedence.** This framework governs the standalone RWANG engine (`engine.mjs` / `orchestrator.mjs` / `server.mjs` and their UI and automation). Runs driven by `orchestrator/run.js` remain governed by SPEC--AGENT-RUNTIME-GOVERNANCE.md and `orchestrator/governance/governance.yaml`, which take precedence on any conflict — including Section 7.2: reviewer-owned gates apply only inside the standalone engine; in `run.js` runs, reviewer output is advisory and gates are decided by the deterministic verify command.

## 2. Core Principle

Choose the minimum process that preserves correctness, safety, maintainability, traceability, and cost control.

Every non-trivial task must declare:

- Complexity level: `C-0` to `C-3`
- Access scope: `H0` to `H4` — defaults from C (`C-0`→`H0`, `C-1`→`H1`, `C-2`→`H2`, `C-3`→`H3`; `H4` by declaration + approval); declare explicitly only to override upward
- Dispatch tier: `T-local` / `T-cloud` / `T-human` / `T-a2a`
- Fan-out scale: `W2` to `W4`
- Risk: `LOW`, `MEDIUM`, or `HIGH` — defaults from C (`C-0`/`C-1` = LOW, `C-2` = MEDIUM, `C-3` = HIGH); declare explicitly only to override upward, never downward
- Required artifacts
- Verification plan

Non-trivial means `C-1` or above; `C-0` (Trivial) tasks are exempt from this full declaration. Classifying the C level is mandatory for every task, including `C-0`; an unclassified task may not dispatch.

When uncertainty exists, choose the higher safety level or trigger Brief Here.

### 2.1 Safety Invariants (never yield)

These invariants bind at every C/H/D/T/W level and for every dispatch class in Section 7, including `T-a2a`:

1. **No external write without human approval.** Push, PR, merge, and deploy are never autonomous; the runtime halts and surfaces them.
2. **The verify gate is mandatory for all gated work (`C-1` and above).** No unverified output crosses a gate boundary; `C-0` work has no gates but its change note must cite the check performed (Section 9).
3. **Halt on gate exhaustion.** A task failing at the top model level stops and surfaces to a human; never loop, never silently downgrade acceptance criteria.
4. **All work lands on a non-default branch; a human owns the merge.**

## 3. Axis Model

RWANG uses five independent axes. Do not overload one axis to mean another.

| Axis | Name | Meaning | Direction |
| --- | --- | --- | --- |
| `C` | Complexity | Process depth required before execution | Higher C = more review and artifacts |
| `H` | Access Scope | Tool/permission ceiling of the executor (formerly Context-Hop) | Higher H = wider tool access; the top tier requires approval |
| `D` | Compaction Depth | Abstraction height of the artifact — its layer in the document stack | Higher D = more abstract, closer to intent; lower D = closer to code |
| `T` | Dispatch Tier | Execution/model/provider class | Depends on provider registry |
| `W` | Fan-out Scale | Branching width / peer connection count | Higher W = more coupling risk |

## 4. Complexity Levels

| Level | Name | Workflow | Use When | Default H |
| --- | --- | --- | --- | --- |
| `C-0` | Trivial | Text -> Code | Typo, comment, tiny config, isolated copy change | `H0` |
| `C-1` | Direct | Text -> Code | Small clear task, single-file bug fix, low-risk behavior | `H1` |
| `C-2` | Doc-Driven | Text -> Doc -> Code | Feature work, multi-file work, public behavior, medium risk | `H2` |
| `C-3` | Architecture-Driven | Text -> Doc -> Diagram -> Code | Architecture, governance, security, cross-system, platform-level work | `H3` (`H4` by declaration) |

Rules:

- C-2 and C-3 require approved human-readable documentation before code.
- C-3 requires architecture review and owner approval before implementation.
- Do not downgrade complexity after approval without a recorded reason.

## 5. H Axis: Access Scope

`H` is the executor's tool/permission ceiling — which capabilities an agent may use while executing its task. Each tier is defined by an enforceable capability set, one-to-one with the runtime's tool allow-sets. (Historically named "Context-Hop"; the graph-distance reading returns as a separate, measured retrieval concern per RFC--H-AXIS-0.6.0 D3 — binding text does not use hop language until hops are computed.)

| H Tier | Capability set | Scope reading | Extra requirement |
| --- | --- | --- | --- |
| `H0` | edit the artifact(s) it was handed; no search | atom/subtask — hotfix, typo, unit test | — |
| `H1` | + search (glob, grep) | task/component neighborhood | — |
| `H2` | + multi-file | story/feature | — |
| `H3` | + shell | epic/module | — |
| `H4` | + network (full set) | architecture / cross-system / platform | approval before implementation |

Hard rules:

- `H` is not compaction depth.
- `H` is not model quality.
- `H` is not retrieval relevance and not budget: relevance is a retrieval-scoring concern (RFC--H-AXIS-0.6.0 D2/D3) and spend is governed by the cost caps — `H` never duplicates either.
- `H` is not write authority. Every tier may edit the artifacts it was handed; what climbs the ladder is **reach** — discovery (search), blast radius (multi-file), and escape hatches (shell, network). Whether an agent may write **at all** is a role question (Section 7.2: write is exclusive to the assigned Worker; gate-owning roles are read-only). A tier granting no write would paralyze every task routed to it, so no tier may map to a read-only execution profile.
- Higher `H` increases blast radius and review burden.
- `H4` requires approval before implementation; the grantor derives from C (Section 10): `C-2` scope — the Architecture gate owner (Architect, Section 7.2); `C-3` scope — the owner (`T-human`).
- If an agent needs a higher H than the task allows, trigger Brief Here or request approval.
- **Budget Control:** If a task's context volume exceeds its token/cost budget while staying within its allowed H tier, the agent may delegate part of the work to a peer/sub-agent instead of expanding its own context. A delegate inherits the parent task's approved H ceiling; delegation never widens H scope without approval.
- **Ceiling Limit:** If a task already at `H4` still cannot resolve its required context, the agent must halt and trigger Brief Here; the owner (`T-human`) decides how to proceed.

## 6. D Axis: Compaction Depth

`D` controls physical document packing. It answers: at which layer of the document stack does this artifact sit?

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
| `T-a2a` | External peer agent through a governed provider surface |

Rules:

- `T` is orthogonal to `H`: a small `H0` task may still need cloud execution if it is hard.
- Reviewing is a role (Section 7.2), not a dispatch class; a Reviewer runs on any T class.
- **Verify Gate:** a task's output must pass a machine-checkable acceptance check (the task's verify command) before crossing any gate in Section 7.2. A task with no machine-checkable acceptance check is not cheap-eligible: it may not dispatch to SLM/local/Edge model levels and floors at cloud Mid-tier; for such a task, the Reviewer's verdict at the strictest Reviewer-owned gate that runs for the task's C level (Review Gate at `C-1`, AC Gate at `C-2`+), or `T-human` acceptance, substitutes for the verify command.
- Reviewer and executor must be separate.
- Dispatch must respect cost caps, role authority, and governance gates.
- The runtime escalation ladder T0–T3 (defined in the runner documentation, outside this contract) is a dispatch-layer model-selection detail, not this axis.

### 7.1 Model Levels

Model levels are capability classes (**Frontier / Mid-tier / SLM / Edge**), not model names.

- **Cloud:** Frontier, Mid-tier, SLM — assigned per provider.
- **Local, open-weight (by parameter count):** Frontier ≥ 35B; Mid-tier 18B–34B; SLM 4B–17B; Edge < 4B.

Escalation order (one rung per escalation; the trigger is defined in Section 7.2 gate failure): Edge → SLM → Mid-tier → Frontier.

Concrete model-to-level assignments live in SPEC--PROVIDER-REGISTRY.md and `config.json`; this section defines only the classes Section 7.2 keys role legality on.

### 7.2 Gate-Driven Execution

Model levels map to agent roles. Each role owns specific gates in the execution pipeline.

| Role | Model Level | Gate Responsibilities |
| --- | --- | --- |
| **Architect** | Frontier | Architecture gate, Final gate, Test gate, Integration gate (when no Leader), Hotfix gate (when no Leader) |
| **Reviewer** | Mid-tier | Review gate, Acceptance Criteria (AC) gate |
| **Leader** | Mid-tier (or Frontier when needed) | Manages Workers; Integration gate (when present), Hotfix gate |
| **Worker** | SLM / Mid-tier | Coding (implementation only) |

**Role definitions:**

- **Architect** — owns the highest-authority gates. Approves architecture decisions, performs final integration sign-off, and validates test evidence. Uses Frontier models.
- **Reviewer** — validates output against acceptance criteria and review standards. Uses Mid-tier models.
- **Leader** — activated when task complexity exceeds a single Worker's context boundary. Coordinates multiple Workers, owns integration and hotfix responsibilities within its scope.
- **Worker** — executes coding tasks. Does not own any gate. Output is always validated by a higher role.
- **Coding is Worker-only.** Architect, Reviewer, and Leader never write implementation code. Sole exception: the Hotfix gate — owned by the Leader when present, otherwise the Architect — triggered only by a critical defect (one that blocks an active run or violates a safety invariant in Section 2.1), authorized by an explicit human/owner override, with the code-write emitted as its own trace event carrying the authorizing identity.

Gate-owning roles (Architect, Reviewer, Leader) have read-only access to the artifacts they gate and never modify them; write access is exclusive to the assigned Worker (one writer per artifact at a time), except the Hotfix-gate owner acting through that gate.

**Gate flow:**

Gate applicability scales with `C` (Section 4): `C-0` — no gates (change note only, per Section 9); `C-1` — Review Gate; `C-2` — Review + AC + Test gates; `C-3` — full flow. The diagrams below show the full (`C-3`) pipeline.

```text
[Architecture Gate] → [Coding] → [Review Gate] → [AC Gate] → [Integration Gate] → [Test Gate] → [Final Gate]
     Architect          Worker      Reviewer        Reviewer      Architect           Architect     Architect
```

When a Leader is present (complex tasks), the Leader inserts steps into the pipeline; it never removes gates — AC and Test gates always run:

```text
[Architecture Gate] → [Leader assigns Workers] → [Coding] → [Review Gate] → [AC Gate] → [Integration Gate] → [Test Gate] → [Final Gate]
     Architect               Leader                Worker      Reviewer       Reviewer       Leader             Architect      Architect
```

**Gate failure:** A failed gate returns the work to the producing role for at most one rework round at the same model level. A second failure escalates one model level (order in Section 7.1). The ladder tops out at the highest level the producing role may use — for coding work that is the Worker's Mid-tier, since roles above Worker never code. Failure at the top reachable level halts the task and surfaces it to `T-human`. Never silent retry, never acceptance-criteria downgrade.

**Hybrid injection:**

Specialist agents may be injected at any gate point to augment the pipeline without replacing the primary role holder. Examples:

- Audit agent at Review gate (Mid-tier level)
- Security agent at Architecture gate
- Performance agent at Test gate

Hybrid agents must declare their scope and may not escalate beyond the gate they are injected into. Injection is authorized before the gate runs by the gate's owning role (or the Leader within its scope) and recorded as a trace event `{gate, specialist, scope, authorized_by}`.

**Runtime binding and precedence:**

- Engine mapping: Architect = engine role `architect`; Reviewer = engine role `reviewer`; Worker = engine role `coder` (implementation). The engine role literally named `worker` (scaffold/config/docs) does C-0/C-1 light work; its C-1 output still passes the Review Gate — only gate ownership, not gate applicability, sits outside this flow. Leader is planned and has no engine role yet — the Leader flow above is a target design, not implemented.
- Personas (`personas.json`) hold a gate only via their `role` binding; every gate verdict is recorded as `{gate, role, persona, verdict}`.
- This gate chain is the enforcement pipeline. A persona approval poll (persona verdicts such as PASS/COMPLIANT) is evidence feeding a gate; it may not add, remove, reorder, or substitute for a gate.

## 8. W Axis: Fan-out Scale

`W` controls branching width and coupling risk.

| W Scale | Meaning | Rule |
| --- | --- | --- |
| `W2` | Normal | 0-5 sibling or peer connections |
| `W3` | Warning | 6-8 connections; lead review required |
| `W4` | Super-hub danger | 9+ connections; block high-risk deployment until decomposed or approved |

Use W-scale for task decomposition breadth, graph node degree, roadmap branching, agent room participant count, and context packets that risk token explosion.

## 9. Artifact Requirements

| Context | Required Artifact | Examples |
| --- | --- | --- |
| `C-0/H0` | Change note or task comment | tiny fix note, command output |
| `C-1/H1` | Task spec or issue note | local bug report, component contract |
| `C-2/H2` | Feature spec, runbook, or test plan | feature spec, API contract, acceptance criteria |
| `C-3/H3` | SDD, ADR, architecture standard, threat model | module design, access model, migration plan |
| `C-3/H4` | PRD, roadmap, operating model, systemic audit | masterplan, platform governance, recovery brief |

Row selection: if a task's `C` and `H` point to different rows, the row further down the table (the stricter one) applies; `C-3`'s two rows are distinguished by the task's `H`.

## 10. Docs-To-Code Gate

For `C-2` and `C-3`, implementation must be backed by an approved human-readable artifact.

A document or artifact is **approved** iff its frontmatter version carries no `b` suffix AND its status is `active` (Section 12); removing the suffix and setting status `active` is the approval act, recorded in the document's changelog row with the approver. Approval authority (total over C): `C-2` documents (any H) — the Architecture gate owner (Architect, Section 7.2); `C-3` documents (any H) — the owner (`T-human`). Implementation approval for `H4` scope follows the same C-derived grantor (Section 5).

Required trace:

```text
source document -> requirement/section -> atom/task -> agent assignment -> artifact -> review -> test evidence -> changelog
```

Each link in this trace must be a stable identifier (doc id + section anchor, atom/task id, agent id, artifact path, review id, test-evidence id), not a prose description.

An **atom** is a compact, machine-readable unit (task, feature, guard, config, …) derived from a source document for retrieval, graph linking, and dispatch. If an atom conflicts with its source document, the source document wins until a new document revision is approved.

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

A Brief Packet records: `hold_id`, the trigger condition fired (from the list above), the question(s), the answer/decision, `decided_by` (the owner, `T-human`), and a timestamp; it is recorded as an event on the run's audit trail. A Brief Here hold is resolved iff its Brief Packet exists with a recorded decision.

## 12. Version Lifecycle

Every canonical document must carry frontmatter:

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
draft, candidate, active, deprecated, superseded
```

Version bump rules:

| Change | Bump |
| --- | --- |
| Rule removed, renamed, or restructured | major |
| New rule, SOP step, section, or required artifact | minor |
| Clarification, typo, formatting, examples | patch |
| Status is `draft` or `candidate` (pre-approval) | append `b` suffix; drop it on approval |

Every canonical document must include a changelog table with at least the columns Version, Date, Status, Summary, and Agent; an approval row records the approver in its Agent column.

## 13. Runtime Enforcement Requirements

RWANG runtime should eventually enforce:

- task cannot dispatch if its required doc gate is missing;
- task cannot exceed allowed `H` without approval;
- `H4` triggers approval (grantor per Section 5);
- `C-2/C-3` requires doc approval before implementation;
- unresolved Brief Here holds (Section 11) block dispatch;
- governance gates cannot be bypassed by UI, CLI, daemon, MCP, or A2A;
- cost caps apply to execution, review, and Brief Here activity;
- external writes (push/PR/merge/deploy) are blocked pending human approval;
- runs execute on a non-default branch only; merge is human-owned;
- all state transitions emit append-only, hash-chained trace events carrying the Section 10 identifiers as join keys.

## 14. Required Task Output Format

Every non-trivial agent task must output:

```markdown
**Complexity:** C-X
**Access Scope:** HY (one of H0-H4; omit when equal to the C default)
**Dispatch Tier:** T-local / T-cloud / T-human / T-a2a
**Model Level:** Frontier / Mid-tier / SLM / Edge / N/A
**W-Scale:** W2 / W3 / W4
**Risk:** LOW / MEDIUM / HIGH
**Required Artifacts:** ...
**Plan:** ...
**Verification:** ...
```

Model Level is copied from the provider-registry resolution (Section 7.1), not classified by the agent; it is `N/A` iff Dispatch Tier is `T-human`, and for `T-a2a` the level is taken from the peer's provider-registry entry. The Risk line always prints the effective value — the C default or an upward override (Section 2).

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
| 0.7.0b | 2026-07-10 | candidate | **Minor bump per Section 12** (a new hard rule is added — first drafted as patch `0.6.1b`, reclassified: the bump table says "New rule → minor", and downgrading one's own change is exactly what Section 4 forbids). Coherence repair (defect found post-0.6.0, latent — no atom declares a tier today): the §5 capability column gated *write* at `H2` while §4 defaults route `C-0`→`H0` (typo fix) and `C-1`→`H1` (single-file bug fix), and the router maps coding rungs to `H1` — so a task declaring its own routed tier could not write. Root cause is the same fusion RFC D2 forbids: read-only-ness is a **role** property (§7.2), not an access-scope property. Fix: `H` bounds reach only (write unconditional; search/multi-file/shell/network climb), new hard rule added, no tier may map to a read-only profile (lint-enforced as A5). Ceiling still never raises; legacy undeclared tasks unchanged. | pending | ClaudeFable |
| 0.6.0 | 2026-07-10 | active | Approved: upstream disposition recorded (STD-Execution-Governance 2.3.0+ga stable, GVDOC-1003 1.4.0 active — signed off and merged in govibe); `b` suffix dropped per Section 12 — the approval act. | pending | Boss (approver) |
| 0.6.0b | 2026-07-10 | candidate | 0.6.0a per RFC--H-AXIS-0.6.0 (D1-D6 approved by Boss 2026-07-10): H redefined as Access Scope with five capability-defined tiers (H5/H6 removed — no atom used them; they granted nothing the top tier does not), approval grantor derives from C, H defaults from C with upward-only override, artifact table rekeyed, hop language removed from binding text pending measurement (D3). Major bump: rules removed/renamed. | pending | ClaudeFable |
| 0.5.0b | 2026-07-09 | candidate | Applied 25 adversarially-verified review fixes (see REVIEW--GOVERNANCE-FRAMEWORK-2026-07-09): added Safety Invariants (2.1) and scope/precedence vs SPEC--AGENT-RUNTIME-GOVERNANCE; repaired 7.2 gate ownership, Leader flow, failure semantics, C-scaled applicability, Worker-only coding + Hotfix definition, read-only gate roles, hybrid-injection authorization, runtime role binding; defined Verify Gate, approval, Brief Packet, non-trivial, Risk defaults; totalized W and artifact tables; fixed D direction and Budget/Ceiling rules; delegated model names to the provider registry; removed per-task D; tightened status enum and MUST language; post-apply consistency pass (verify-gate force scoping, approval-authority totality, hotfix ownership without a Leader, template notation, escalation order). | pending | ClaudeFable |
| 0.4.0b | 2026-07-09 | candidate | Added Gate-Driven Execution model (section 7.2) with role-to-gate mapping and hybrid injection rules. | pending | Antigravity |
| 0.3.0b | 2026-07-09 | candidate | Added Budget Control and Ceiling Limit rules to the H Axis section. | pending | Antigravity |
| 0.2.0b | 2026-07-09 | candidate | Added Model Levels classification under T Axis (Cloud and Local/Open-weight tiers). | pending | Antigravity |
| 0.1.0b | 2026-07-01 | candidate | Initial self-contained RWANG governance framework with C/H/D/T/W axes, docs-to-code gate, Brief Here gate, and version lifecycle. | pending | ATHER |
