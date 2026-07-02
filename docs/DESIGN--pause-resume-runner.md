# DESIGN + SRS — Pause/Resume Runner (unlock `supervised` & `unattended`)

- **Status:** Draft
- **Date:** 2026-07-02
- **Owner:** human (Rwang maintainer)
- **Affects:** `orchestrator/run.js`, `orchestrator/progress.py`, `monitor/monitor.html`, `AUTONOMY.md`
- **Does NOT touch:** the deterministic-core purity rule (no LLM calls in `orchestrator/*.py`), the four safety invariants, `route.py` / `check_evidence.py` / `cost_estimate.py` / `cost_ledger.py` I/O contracts.

---

## Part A — Design

### A.1 Problem statement

`orchestrator/run.js` is a single Claude Code **Workflow** script that runs `Route → Execute → Review` to completion in one invocation. Two consequences block the designed autonomy model (see AUTONOMY.md):

1. A Workflow **cannot block mid-body** waiting for human input, so `supervised` (pause-per-phase) is impossible in a monolithic runner.
2. **No state survives between Workflow invocations**, so there is nothing to resume from, so `unattended` (auto-commit to a branch across a long, resumable run) has no foundation.

Today all three levels therefore run with `autonomous` semantics and a human performs every external write, including the commit.

### A.2 Core idea

> **The pause lives *between* Workflow invocations, not inside one.** Each invocation does one phase's worth of work, rehydrating all state from disk at the start and writing a terminal status at the end. A **driver** decides whether to launch the next phase. `supervised` pauses for a human at that boundary; `autonomous`/`unattended` do not.

Two design consequences:

- **State is 100% on disk** — `runs/<runId>/progress.json`, `tasks.json`, `approvals.ndjson`. Nothing is carried in Workflow memory across invocations.
- **Gate decisions live in the driver**, not in the Workflow. A phase Workflow only *reports* status; it never waits.

### A.3 Architecture — phase-parameterized runner

Refactor `run.js` so a single invocation runs one phase, selected by `args.phase`:

```text
Workflow(run.js, args = { specPath, targetRepo, autonomy, runDir, phase })
  phase = "route" | "execute" | "review" | "commit"
```

| phase | rehydrates | does | terminal status written |
|-------|-----------|------|--------------------------|
| `route` | spec | runs `route.py`, writes durable `tasks.json`, `progress.py init` | `phase_done:route` |
| `execute` | `tasks.json`, `progress.json` | runs waves + escalation ladder; **skips tasks already `passed`** | `phase_done:execute` \| `blocked` |
| `review` | target working tree, `progress.json` | T3/opus adversarial review vs epic DoD | `phase_done:review` \| `needs_work` |
| `commit` *(unattended only)* | `progress.json` | `git commit` on the **run branch only** | `awaiting_merge` |

`tasks.json` is promoted from an ephemeral Route→init handoff into the **durable task source-of-truth** that `execute` reads on every (re)launch.

### A.4 State machine

`progress.json.status` is extended from `running|blocked|done|failed` to:

```text
                 ┌─────────────────────────────────────────────┐
   route ─▶ phase_done:route ──(driver: next)──▶ running(execute)│
                 │                                              │
   (supervised)  └─▶ awaiting_approval{phase} ──(approve)──▶ ───┘
                                                              │
   execute ─▶ phase_done:execute ─▶ review ─▶ phase_done:review
                 │                                │
                 ├─▶ blocked{reason}              ├─▶ needs_work
                 │   (T3 fail / external write /  │
                 │    human_review)               ▼
                 │                    (unattended) commit ─▶ awaiting_merge
                 ▼                                              │
              [human]                                        [human merges]
                                                                ▼
                                                              done
```

Terminal-for-human states (`blocked`, `awaiting_approval`, `awaiting_merge`, `needs_work`) always surface and stop; the run never loops.

### A.5 `progress.py` additions (stays deterministic, no LLM)

- `progress.py <runDir> phase-done --phase <p>` → set `phase_done:<p>`.
- `progress.py <runDir> gate --phase <p> --await` → set `awaiting_approval`, record `awaiting = {phase}`.
- `progress.py <runDir> approve --phase <p> --by <who>` → append to `approvals.ndjson`, clear `awaiting`, return status to a launch-eligible state.

Approvals are audited in `runs/<runId>/approvals.ndjson` (append-only, one decision per line: `{ts, phase, by, decision}`), matching the existing ndjson audit style.

### A.6 Drivers — one logic, two pause behaviors

```text
launch phase=route
loop, reading progress.json:
  phase_done:X       → is there a next phase?
                         autonomous/unattended: launch it immediately
                         supervised:            require human approval first
  awaiting_approval  → surface to human; on approve → launch next phase
  blocked | awaiting_merge | needs_work → surface; STOP (human acts)
  done               → exit
```

- **`supervised` → the Claude Code session is the driver.** It genuinely stops at each boundary, using the Workflow completion notification, and only relaunches on the human's go-ahead.
- **`autonomous` / `unattended` → no human pause between phases**, so they may be chained by an **outer meta-runner Workflow** (via the `workflow()` inline hook) or by the session. Same driver logic; the only difference is whether it waits for a human.

### A.7 Resumability — two levels

1. **Coarse (phase-level):** a dead phase is relaunched and rehydrates from `progress.json`; earlier phases are not re-run (their results are already in the target repo + `progress.json`).
2. **Fine (task-level, inside `execute`):** on (re)launch, `execute` skips every task already `passed` (optionally re-running its `verify_command` to confirm still-green) and runs only `pending`/`failed` tasks → `execute` is idempotent and continues from where it stopped.
3. **Bonus:** native Workflow `resumeFromRunId` replays cached `agent()` calls for crash-recovery *within* a single invocation.

### A.8 `unattended` commit phase — the only real behavioral delta

After `review` passes, the `commit` phase runs `git add/commit` on the **run branch only**, reachable **iff `autonomy == "unattended"`**, and never `push`/`merge`. It ends at `awaiting_merge`; a human always performs the merge.

---

## Part B — Software Requirements Specification (SRS)

### B.1 Purpose & scope

Specify the requirements for a pause/resume-capable Rwang runner that unlocks the `supervised` and `unattended` autonomy levels described in AUTONOMY.md, without weakening any safety invariant. In scope: `run.js`, `progress.py`, `monitor.html`, `AUTONOMY.md`. Out of scope: routing/cost/verify core logic (`route.py`, `check_evidence.py`, `cost_estimate.py`, `cost_ledger.py`), the target repos, and any merge/push automation.

### B.2 Definitions

- **Phase** — one of `route`, `execute`, `review`, `commit`.
- **Driver** — the agent (session or meta-runner) that launches phases and applies pause behavior.
- **Gate** — a boundary at which the run may stop for a human (approval, block, or merge).
- **Durable state** — files under `runs/<runId>/` that fully reconstitute a run.

### B.3 References

- `AUTONOMY.md` — the three levels + the four safety invariants.
- `USERFLOW.md` — the shared progress schema.
- `CLAUDE.md` — the deterministic-core rule and the `run.js` Workflow-sandbox constraints.

### B.4 Functional requirements (EARS)

- **FR-1 (phase selection).** WHEN the runner is invoked with `args.phase = P`, THE SYSTEM SHALL execute only phase `P` and then return, without advancing to any other phase.
- **FR-2 (rehydration).** WHEN a phase starts, THE SYSTEM SHALL reconstruct all needed run state exclusively from `runs/<runId>/` on disk, AND SHALL NOT rely on any state held in Workflow memory from a prior invocation.
- **FR-3 (durable task list).** WHEN `route` completes, THE SYSTEM SHALL persist the routed task list to `runs/<runId>/tasks.json` as the source of truth read by `execute`.
- **FR-4 (idempotent execute).** WHEN `execute` (re)starts, THE SYSTEM SHALL skip every task whose recorded status is `passed` and run only `pending`/`failed` tasks.
- **FR-5 (phase-done signalling).** WHEN a phase finishes without a blocking condition, THE SYSTEM SHALL set `status = phase_done:<phase>` via `progress.py` before returning.
- **FR-6 (supervised pause).** WHILE `autonomy == "supervised"`, WHEN a phase boundary is reached, THE SYSTEM SHALL set `status = awaiting_approval` with the pending phase recorded, AND SHALL NOT launch the next phase until a matching approval exists in `approvals.ndjson`.
- **FR-7 (approval recording).** WHEN a human approves a phase, THE SYSTEM SHALL append the decision to `approvals.ndjson` and clear the `awaiting` marker via `progress.py approve`.
- **FR-8 (autonomous chaining).** WHILE `autonomy ∈ {autonomous, unattended}`, WHEN `status = phase_done:<p>` and a next phase exists, THE SYSTEM SHALL launch the next phase without human input.
- **FR-9 (unattended commit).** WHILE `autonomy == "unattended"`, WHEN `review` passes, THE SYSTEM SHALL run a `commit` phase that commits to the run branch only and then set `status = awaiting_merge`.
- **FR-10 (blocked surfacing).** WHEN any phase reaches gate-exhaustion (T3 fail), an external-write requirement, or a `human_review` task, THE SYSTEM SHALL set `status = blocked` with a reason and stop the run.
- **FR-11 (monitor visibility).** WHEN `status ∈ {awaiting_approval, awaiting_merge, needs_work}`, THE SYSTEM SHALL render that state distinctly in `monitor.html`.

### B.5 Non-functional requirements

- **NFR-1 (determinism preserved).** `progress.py` and the rest of `orchestrator/*.py` SHALL remain LLM-free and deterministic; all new pause/approval logic in `progress.py` SHALL be pure file/state manipulation.
- **NFR-2 (sandbox compliance).** `run.js` SHALL keep the Workflow constraints: no `fs`/`Bash`/`Date.now()` in the script body; every timestamp and disk/shell write happens inside an `agent()` call or via `progress.py --ts`.
- **NFR-3 (crash safety).** Any single phase invocation MAY be killed and relaunched, and the run SHALL continue correctly from the last durably recorded state.
- **NFR-4 (auditability).** Every phase transition and approval SHALL be appended to an append-only log (`progress.ndjson` / `approvals.ndjson`).
- **NFR-5 (schema compatibility).** The extended `progress.json` SHALL remain a superset of the current shape so existing readers keep working.

### B.6 Safety invariants (constraints — MUST NOT be weakened)

- **SI-1.** No external write (push/PR/merge/deploy) without human approval. `commit` is branch-only and unattended-only; merge is always human.
- **SI-2.** The verify gate is mandatory; `execute` keeps the ladder + `verify_command` gating unchanged.
- **SI-3.** Gate-exhaustion halts the run (never loops) — realized by `blocked` (FR-10).
- **SI-4.** Every run works on a branch, never the target default branch.

> The pause/resume mechanism only **adds** gates (supervised) and a **branch-only** commit (unattended). It removes none.

### B.7 Data / interface requirements

- **DR-1.** `tasks.json` — durable routed task list (FR-3).
- **DR-2.** `approvals.ndjson` — append-only approval log (FR-7).
- **DR-3.** `progress.json.status` enum extended to include `phase_done:<p>`, `awaiting_approval`, `awaiting_merge`, `needs_work` (plus existing `running|blocked|done|failed`), with an `awaiting` object when paused.
- **DR-4.** New `progress.py` subcommands: `phase-done`, `gate --await`, `approve` (A.5).

### B.8 Traceability

| Requirement | Realized in |
|-------------|-------------|
| FR-1, FR-2, FR-5, FR-8, FR-10 | `run.js` phase runner (A.3) + driver (A.6) |
| FR-3, FR-4 | `run.js execute` + `tasks.json` (A.3, A.7) |
| FR-6, FR-7, DR-2, DR-4 | `progress.py` gate/approve (A.5) + supervised driver |
| FR-9, SI-1 | `commit` phase (A.8) |
| FR-11, DR-3 | `progress.py` status + `monitor.html` |
| NFR-1..5, SI-1..4 | cross-cutting; enforced by review gate at each phase |

### B.9 Acceptance criteria (epic DoD, EARS)

WHEN the runner is split into disk-checkpointed phases driven by an external driver, THE SYSTEM SHALL: run `supervised` with a real human pause at every phase boundary; run `unattended` end-to-end with an auto-commit to a branch and a stop at `awaiting_merge`; resume any killed phase from durable state with no repeated work on already-`passed` tasks; and keep all four safety invariants and the deterministic-core rule intact — with `autonomous` behavior unchanged from today. Done means: the three levels are behaviorally distinct (per the target comparison), a killed-and-resumed run reaches the same terminal state as an uninterrupted one, and a human has re-checked this DoD.

---

## Part C — Rollout (independently verifiable)

1. **Refactor + durable state** — split `run.js` into phases, make `tasks.json` durable, add idempotent `execute` skip. `autonomous` behavior is unchanged (a driver chains phases automatically). *Verify:* an autonomous run produces the same terminal `progress.json` as the monolith.
2. **Supervised** — add `phase-done`/`gate`/`approve` to `progress.py` + the session driver. *Verify:* the run stops at each boundary and only advances after an `approvals.ndjson` entry.
3. **Unattended** — add the `commit` phase + `awaiting_merge`. *Verify:* work lands committed on a branch, the run stops before merge, and no push/merge ever occurs.

## Part D — Risks & open questions

- **R-1 (resume semantics).** Confirm Workflow `resumeFromRunId` cache keying (prompt/opts vs `args`) before relying on native resume; the phase-level design does not depend on it, but the fine-grained bonus does.
- **R-2 (execute idempotency on retry).** Re-running a previously-`failed` task must not double-apply edits; may require a `git` clean/checkout of that task's scope before retry.
- **R-3 (driver ownership).** Decide whether autonomous/unattended chaining is owned by the session or by an outer `workflow()` meta-runner; supervised must be session-owned regardless.
- **R-4 (monitor).** Minor: teach `monitor.html` the new statuses.
