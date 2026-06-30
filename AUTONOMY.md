# AUTONOMY.md — How Rwang runs itself, safely

Autonomy is what makes Rwang useful: given a spec, it drives the whole **VERIFY → AUTHOR → REVIEW → ASSEMBLE** loop without per-task human prompts. **Autonomy raises throughput; the verify gate keeps it safe; a human still owns the merge.** This file defines the three levels, the safety invariants that never yield, the halt rule, and how the verify gate substitutes for human approval at phase boundaries.

---

> **Implementation status (current).** The runner (`orchestrator/run.js`) is a Workflow script that executes to completion, so it cannot pause for human input mid-run. Therefore **all three levels currently run with `autonomous` semantics**: the run drives end-to-end and **a human performs *every* external write — including the commit** (the runner never `git commit`s, even in `unattended`). `supervised` (pause-per-phase) and `unattended` (auto-commit-to-branch) are the **designed** behaviors documented below and the roadmap target; they are not yet wired. This fails *safe* — the un-wired behaviors only ever err toward halting before a write, so the safety invariants hold regardless.

## The three autonomy levels

You pick the level when you launch a run (`autonomy=` arg to `orchestrator/run.js`).

### 1. `supervised`
- **Asks before each phase.** The runner pauses at every phase boundary (VERIFY → AUTHOR → REVIEW → ASSEMBLE) and waits for a human go-ahead before proceeding.
- **Does not** advance phases, escalate, or write anything without a prompt.
- Use when you're calibrating a new spec or don't yet trust the routing.

### 2. `autonomous`
- **Drives end-to-end.** Runs every phase, every cheap-tier attempt, every verify-gate check, and every escalation up the ladder **without per-task prompts**.
- **Stops only at three things:**
  1. **External write actions** — `git commit` / `push` / PR / merge / deploy.
  2. **Gate-exhaustion** — a task that fails even at **T3** (top of the ladder).
  3. **`human_review`-flagged tasks** — anything the spec explicitly marked for a human.
- **Does not** perform any external write, and does not auto-commit.
- The default for real work.

### 3. `unattended`
- **Everything `autonomous` does, plus auto-commits to a branch.**
- **Never merges.** It commits its verified work to a run branch so a human can review and merge later — but the merge itself is always a human action.
- **Still stops** at gate-exhaustion and `human_review` tasks (those invariants never relax).
- Use for long jobs you want to come back to — the work lands on a branch, nothing reaches the default branch or production.

| Level         | Advances phases | Escalates | Auto-commits (branch) | Merges / pushes / PR | Stops on gate-exhaustion |
|---------------|:---------------:|:---------:|:---------------------:|:--------------------:|:------------------------:|
| `supervised`  | on prompt       | on prompt | no                    | **never (human)**    | yes                      |
| `autonomous`  | yes             | yes       | no                    | **never (human)**    | yes                      |
| `unattended`  | yes             | yes       | **yes (branch only)** | **never (human)**    | yes                      |

---

## Non-negotiable safety invariants

These **never yield to autonomy**, at any level:

1. **No external write without human approval.** No push, PR, merge, or deploy happens without a human saying yes. The runner halts and surfaces the proposed write; the human acts.
2. **No unverified cheap output crosses a phase boundary.** The **verify gate is the interlock**. A task routed to a cheap tier must pass its machine-checkable `verify_command` before its output is allowed into the next phase. A task with **no** machine-checkable `verify_command` is **not cheap-eligible** and floors at **T2+** (the HARD RULE). Local-first is allowed **only** behind this gate.
3. **A task that exhausts the escalation ladder halts the run.** It surfaces to the human — **never loops forever**, never silently downgrades the DoD.
4. **Every run is on a branch.** Never directly on the target's default branch.

---

## The escalation ladder and the halt rule

When a task's cheap attempt fails its verify gate, the runner **escalates one rung** and retries:

```
T0 → T1 → T1.5 → T2 → T3
local-SLM  local-mid  cloud-open  Sonnet  Opus
```

- Each rung is a single bounded attempt against the same `verify_command`.
- The decision to *start* cheap at all is FrugalGPT break-even: route cheap **iff** `p_fail < c_frontier_direct / c_frontier_fix`. If the math says the cheap path's expected fix cost exceeds going straight to frontier, the task starts higher.
- **If the task fails at the top rung (T3), the run halts.** The task is marked `failed` / gate-exhausted in `progress.json`, an `escalate`→`blocked` event chain is written to `progress.ndjson`, and the run **stops and surfaces it to the human**. There is **no infinite loop** — the ladder is finite and the top is terminal.

This is invariant #3 in operation: bounded ladder, terminal top, human surface.

---

## How the verify gate substitutes for human approval — but only at phase boundaries

A human can't sit in the loop for every cheap-tier attempt; that would defeat the throughput win. So at **phase boundaries** the **verify gate stands in for human approval**:

- The gate is **machine-checkable** (`verify_command` exits 0/non-0). Passing it is objective, not a judgment call — that's *why* it can replace a human checkpoint there.
- Output that fails the gate **cannot advance**; it escalates instead. So nothing unverified ever moves forward, even with no human watching.

But the gate does **not** substitute for human approval on **external writes**. Verifying that code is correct is a different thing from deciding to *publish* it. So:

- **Phase boundaries:** verify gate decides (autonomous).
- **External writes (commit-to-shared / push / PR / merge / deploy):** **human decides, always.**

That split is the whole safety model: autonomy inside the loop, human authority at the boundary where work leaves the branch.

---

## Optional: scheduled / unattended long jobs

Long runs can be paced or resumed without ever violating the no-auto-merge rule:

- **Resume:** a run launched via the Workflow tool (`orchestrator/run.js`) can be continued via Claude Code Workflow **resume** — it picks up from `progress.json` state.
- **Pacing:** for long jobs you can drive firings on a schedule (e.g. `ScheduleWakeup` / a cron-style trigger) so the run advances in windows rather than one long block.

In every case the invariants hold: scheduled or resumed, the run still **stops at gate-exhaustion and `human_review` tasks**, still **auto-commits only to a branch** (in `unattended`), and **still never merges**. Scheduling changes *when* work happens, not *who* approves the write.

---

## The one-line summary

Autonomy raises throughput by removing per-task prompts; the verify gate keeps it safe by letting nothing unverified cross a phase boundary; the escalation ladder is finite and halts at the top instead of looping; and a human always owns the merge.

---

## Read next

- **USERFLOW.md** — the concrete human flow and the shared progress schema.
- **CLAUDE.md** — the deterministic-core rule, the `python`-not-`python3` gotcha, and the pricing uncertainty flag.
- **.claude/skills/tiered-swarm/DESIGN-RATIONALE.md** — the two-axis model and FrugalGPT routing in depth.
