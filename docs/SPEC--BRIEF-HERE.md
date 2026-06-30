---
version: "0.1.0b"
created_at: "2026-06-30T00:00:00+07:00,ATHER,pending"
last_update: "2026-06-30T00:00:00+07:00,ATHER"
status: "candidate"
superseded_by: null
attributes:
  domain: "orchestration"
  doc_type: "feature-specification"
  scope: "RWANG / G-Orchestra mandatory clarification workflow"
  language: "th"
---

# SPEC--BRIEF-HERE

## 1. Summary

`Brief Here` is a mandatory clarification protocol for RWANG agents.

When an agent does not have enough context, requirements, acceptance criteria, or authority to proceed safely, RWANG must pause execution and create a Brief Room. The room lets assigned agents debate the gap, gather allowed context, produce focused questions, ask the user or an approved source, then emit a Brief Packet before the task can resume.

Alias: `บรีฟเหี้ย`

Product intent: stop agents from pretending they understand the task when they do not.

## 1.1 Self-Contained Rule

This spec must be usable inside RWANG without reading any external repository. If another project has a similar governance idea, it is treated as historical inspiration only. The enforceable local source is `SPEC--RWANG-STANDALONE-GOVERNANCE-FRAMEWORK.md`, plus the rules repeated in this document.

Brief Here uses the RWANG axis model:

| Axis | Brief Here usage |
| --- | --- |
| `C` | Higher complexity increases required review before resume. |
| `H` | Limits how far Brief Room agents may retrieve context. |
| `D` | Controls how compact or detailed the Brief Packet should be. |
| `T` | Selects human, cloud, local, reviewer, or A2A participants. |
| `W` | Caps room fan-out and debate participant count. |

## 2. Local Context

This document repeats the rules it needs to stand alone. The files below are local RWANG context only, not required reading for applying Brief Here.

| Local doc | Context |
| --- | --- |
| `SPEC--RWANG-STANDALONE-GOVERNANCE-FRAMEWORK.md` | Local self-contained governance source for C/H/D/T/W axes, docs-to-code gate, Brief Here trigger rules, and version lifecycle. |
| `DESIGN--G-ORCHESTRA-V2.md` | Preserves governed autonomy, human-confirmed uncertainty, H-tier context limits, and one-object-many-lenses UI model. |
| `MASTERPLAN--G-ORCHESTRA-V2.md` | Fits P1/P2 as a Mission Control differentiator after AtomStore/Cockpit/Copilot basics. |
| `RUNBOOK--DOC-TO-CODE-PIPELINE.md` | Inserts a clarification checkpoint before dispatch and before implementation resume. |
| `ADR-O-006--topology-core-faces-a2a.md` | Must apply across GUI, daemon, MCP, and A2A entry points. |
| `FEAT--MULTI-AGENT-ORCHESTRATOR.md` | Extends Agent Room, Copilot Console, Review State, and blocked/escalation surfaces. |

## 3. Problem

Current agent workflows can fail in three expensive ways:

| Failure mode | Effect |
| --- | --- |
| Missing context | Agent edits from partial information and creates rework. |
| Vague requirement | Agent chooses one interpretation silently. |
| Hidden authority gap | Agent performs work that should have required user, architect, or governance approval. |

Brief Here turns these into visible, reviewable pauses instead of silent assumptions.

## 4. Trigger Conditions

Brief Here must trigger when any condition is true:

| Trigger | Example |
| --- | --- |
| Missing acceptance criteria | Task says "improve UI" with no target state. |
| Missing context docs | `scope.needs` points to absent or unreadable files. |
| Contradictory context | SRS and ADR disagree on product boundary. |
| Multiple material interpretations | Implementation path changes schema, UX, architecture, or security behavior. |
| H-tier violation risk | Agent needs broader context or file access than the atom allows. |
| Role authority gap | Worker needs architect or user decision before proceeding. |
| Verify ambiguity | Reviewer cannot determine pass/fail because original requirement is unclear. |
| User input required | Agent needs a preference, missing credential, product decision, or external fact. |

## 5. State Model

Add task/session states:

| State | Meaning | Dispatch allowed |
| --- | --- | --- |
| `needs-brief` | Task is paused because context or requirements are insufficient. | No |
| `briefing` | Brief Room is active and agents are debating/gathering context. | No |
| `waiting-user` | Brief Room has generated questions and needs user input. | No |
| `brief-resolved` | Brief Packet exists and task may resume. | Yes, after normal gates |

Existing states remain valid. `brief-resolved` does not bypass dependency gates, governance gates, cost caps, or Verify Gate.

## 6. Brief Room

A Brief Room is attached to one task or atom.

```json
{
  "roomId": "brief--feature-brief-here--20260630T000000+0700",
  "taskId": "feature--brief-here",
  "status": "open",
  "participants": ["ATHER", "ARCHON", "GHOST"],
  "trigger": "missing-acceptance-criteria",
  "messages": [],
  "questions": [],
  "briefPacket": null,
  "createdAt": "2026-06-30T00:00:00+07:00",
  "resolvedAt": null
}
```

### Default Participants

| Participant | Responsibility |
| --- | --- |
| Requesting agent | States what blocks execution. |
| ATHER | Technical feasibility, implementation constraints, and DDD compliance. |
| ARCHON | Architecture, scope, and H-tier authority. |
| GHOST | Verification, risk, missing tests, and regression criteria. |
| Optional scout | Reads allowed docs or searches approved sources. |

## 7. Debate Protocol

1. Evidence scan: agents inspect only allowed task scope and declared docs.
2. Gap statement: requesting agent lists the missing or contradictory facts.
3. Debate: participants challenge assumptions and propose interpretations.
4. Question synthesis: room emits the fewest questions needed to unblock work.
5. Resolution: user or approved source answers the questions.
6. Brief Packet: room writes a compact implementation packet.
7. Resume: engine moves task to `brief-resolved`, then normal dispatch rules decide whether it can run.

## 8. Brief Packet

Every resolved room must emit:

```json
{
  "problem": "What was unclear or incomplete.",
  "knownFacts": ["Facts supported by repo docs or user answers."],
  "resolvedDecisions": ["Decisions made during the room."],
  "userAnswers": ["Answers provided by the user, if any."],
  "acceptedAssumptions": ["Assumptions now approved for execution."],
  "implementationBoundary": "What the agent may and may not touch.",
  "acceptanceCriteriaDelta": ["New or clarified acceptance criteria."],
  "resumeInstruction": "Compact instruction for the next executor.",
  "createdAt": "ISO-8601 timestamp",
  "resolvedBy": "user|source|approver"
}
```

## 9. Engine Rules

- An agent may request Brief Here from any dispatch path.
- The engine must persist the room before changing the task to `briefing`.
- Implementation work must stop while the task is `needs-brief`, `briefing`, or `waiting-user`.
- A resolved Brief Packet is appended to the task context for the next executor.
- Brief Here cannot auto-confirm governance-gated work.
- Cost cap, kill switch, and provider permissions apply to Brief Room agents.
- If the room cannot resolve the issue within its round cap, the task becomes `blocked`.

## 10. UI Requirements

| Surface | Required behavior |
| --- | --- |
| Agent Room | Show `needs-brief`, `briefing`, and `waiting-user` tiles with attention ring. |
| Sidebar | Show latest Brief Room status per workspace/task. |
| Copilot Console | Let user answer Brief Room questions and review the Brief Packet. |
| Board | Display `needs-brief` and `waiting-user` as blocked-but-actionable states. |
| Logs / Review | Link the transcript and Brief Packet to the task. |

## 11. API / Command Requirements

Suggested command actions:

| Action | Purpose |
| --- | --- |
| `brief.open` | Create a room for a task. |
| `brief.message` | Append room message. |
| `brief.questions` | Set consolidated questions. |
| `brief.answer` | Record user/source answer. |
| `brief.resolve` | Attach Brief Packet and move task to `brief-resolved`. |
| `brief.cancel` | Cancel room and keep task blocked or failed. |

Suggested read endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/briefs` | List rooms. |
| `GET /api/brief?id=<roomId>` | Read room transcript and packet. |

Transport note: the same primitives should be available through future Tauri invoke, daemon HTTP/WS, MCP, and A2A surfaces.

## 12. Persistence

MVP file layout:

```text
briefs/
  brief--<taskId>--<timestamp>.json
```

The room record is append-friendly and can later be indexed by GenesisDB as task context and traceability evidence.

## 13. Safety And Loop Limits

| Guardrail | Rule |
| --- | --- |
| Round cap | Default max 2 debate rounds before asking the user or blocking. |
| Question cap | Ask one consolidated question batch at a time. |
| Scope cap | Brief agents cannot read beyond task H-tier unless a higher authority approves. |
| Cost cap | Brief activity counts against the same session and weekly caps. |
| No silent resume | A task cannot leave `waiting-user` without an answer, cancellation, or explicit override. |

## 14. Proposed Atom

```json
{
  "id": "feature--brief-here",
  "type": "feature",
  "displayName": "Brief Here",
  "layer": "L2-Feature",
  "phase": "P1",
  "tier": "H2",
  "role": "architect",
  "deps": [
    "feature--atom-store",
    "feature--copilot-console",
    "feature--cockpit",
    "guard--governance-gate",
    "algo--approval-chain"
  ],
  "est": 3,
  "moscow": "must",
  "body": "Mandatory clarification protocol: when an agent lacks context, requirements, authority, or acceptance clarity, the engine pauses the task, creates a Brief Room, lets assigned agents debate the gap, synthesizes questions for the user or approved context source, emits a Brief Packet, then resumes only after resolution.",
  "accept": "A task with insufficient requirements enters needs-brief instead of dispatching; a Brief Room transcript and Brief Packet are persisted; user answers update task context; unresolved rooms keep the task blocked."
}
```

## 15. Implementation Plan After Approval

1. Add the `feature--brief-here` atom to `gks/atoms.gorch.json`.
2. Compile GKS to regenerate `gks/backlog.gorch.json` and `gks/atoms/feature--brief-here.md`.
3. Add Brief Room persistence helpers.
4. Add engine command actions for `brief.open`, `brief.answer`, `brief.resolve`, and `brief.cancel`.
5. Add task state transitions and dispatch blocks.
6. Add Agent Room/Board/Copilot UI states.
7. Add tests for dispatch blocking and resume after `brief-resolved`.

## 16. Acceptance Criteria

- A task with missing required docs can enter `needs-brief` instead of dispatching.
- A Brief Room record is persisted with task id, trigger, participants, transcript, questions, and status.
- A user answer can resolve the room into a Brief Packet.
- A task cannot dispatch while `needs-brief`, `briefing`, or `waiting-user`.
- A `brief-resolved` task still obeys dependency, governance, and cost gates.
- UI surfaces the waiting room with an attention marker.

## 17. Version Diff

| Artifact | Current | Proposed |
| --- | --- | --- |
| `SPEC--BRIEF-HERE.md` | none | `0.1.0b` |
| `SRS--G-ORCHESTRA.md` | `0.1.0b` | `0.2.0b` after approval |
| `FEAT--MULTI-AGENT-ORCHESTRATOR.md` | `0.1.0b` | `0.2.0b` after approval |
| `g-orchestra-ui-sitemap-flow-board.md` | `0.4.0b` | `0.5.0b` after approval |
| `gks/atoms.gorch.json` | no Brief Here atom | add `feature--brief-here` after approval |

---

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0b | 2026-06-30 | candidate | Initial Brief Here feature spec for mandatory agent clarification rooms. | pending | ATHER |
