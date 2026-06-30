# CLAUDE.md — Rwang

Operating instructions for a Claude Code session working **in Rwang**. Read this before driving any run.

## What Rwang is

Rwang is an **orchestrator / control plane**. It does **not** contain the code it builds. It drives **other repos** — the **target repo** is named *in the spec* (e.g. GenesisBlock at `G:/GenesisBlock_Dev/GenesisBlock`). Your job in this session is to read a spec, route its tasks, launch the runner, and supervise the autonomy policy — not to hand-edit the target yourself.

## The deterministic core is sacred

`orchestrator/*.py` is the **deterministic core**: `route.py` (role-based model-tier router), `check_evidence.py` (the verify gate), `cost_estimate.py` (FrugalGPT break-even), `cost_ledger.py` (two-way token/cost ledger), `ollama_route.sh` (local-tier dispatch).

- **NEVER put LLM SDK calls in `orchestrator/*.py`.** They are pure, testable, deterministic functions. The model calls happen in the runner / the session, not in the core. Keeping the core LLM-free is what makes routing and cost reproducible.
- Treat these scripts as a stable contract. If you change one, it must stay deterministic and the existing CLI/IO shape must hold.

## How to run a spec

Launch the autonomous runner via the **Workflow tool**, not by shelling out:

```text
Workflow tool:
  scriptPath = orchestrator/run.js
  args = { specPath: "specs/<x>.md",
           targetRepo: "G:/GenesisBlock_Dev/GenesisBlock",
           autonomy: "supervised" | "autonomous" | "unattended" }
```

The runner reads the spec, derives the epic DoD and tasks, calls the deterministic core to route + verify + meter each task, and writes `runs/<runId>/progress.ndjson` (append-only) and `runs/<runId>/progress.json` (rolled-up snapshot the monitor reads). Both files conform to the **shared progress schema** (see USERFLOW.md / AUTONOMY.md — every file agrees on the exact shape).

## Autonomy safety invariants — NEVER yield these to autonomy

1. **No external write without human approval.** Never `git push`, open a PR, merge, or deploy on your own. The runner **halts and surfaces** these for a human; you relay, you do not act.
2. **The verify gate is mandatory.** No unverified cheap output crosses a phase boundary. A task with no machine-checkable `verify_command` is **not cheap-eligible** → floor it at **T2+**. Local-first is allowed **only** behind the gate.
3. **Halt on gate-exhaustion — never loop forever.** If a task fails even at T3 (top of the escalation ladder), the run **stops** and surfaces the task to the human. Do not retry indefinitely, do not silently downgrade the DoD.
4. **Always work on a branch.** Every run lands on a branch, never directly on the target's default branch. A human owns the merge.

When autonomy says "drive end-to-end," it means *up to* these invariants — they are the interlocks, not suggestions.

## Gotchas

- **`python`, not `python3`.** On this machine the interpreter is `python` — `python3` is **not on PATH**. Invoke the core with `python orchestrator/<script>.py`.
- **Pricing uncertainty flag.** Claude per-token prices in the cost layer are a **2026-06-04 snapshot**. They carry an uncertainty flag — **re-verify current pricing before billing** or before reporting dollar figures as authoritative. Local-tier counts are exact (Ollama returns `prompt_eval_count` / `eval_count`); the dollar conversion for Claude tiers is the part that can drift.
- Cost is **two-way**: count × per-type price, metered on **every** tier including local. Do not report only billed tokens — local tokens are tracked too.

## Where to read next

- **USERFLOW.md** — the concrete human flow through a session.
- **AUTONOMY.md** — the three levels and the invariants in depth.
- **.claude/skills/tiered-swarm/DESIGN-RATIONALE.md** — why the two-axis model and the verify gate exist.
