# USERFLOW.md — Driving Rwang end-to-end

This is the concrete, numbered flow a human follows to run a spec through Rwang from a Claude Code session. Each step shows **what you type** and **what Claude does**.

---

## Step 1 — Open a Claude Code session with both repos reachable

Open Claude Code. **Both Rwang and the target repo must be reachable on disk** in this session, because Rwang reads/edits the target and writes run artifacts under Rwang.

- Easiest: start the session with `cwd` at `G:/Rwang/` and make sure the target path (e.g. `G:/GenesisBlock_Dev/GenesisBlock`) exists locally.
- If the target repo is not yet in the session, add it:

  > **You type:** `add_repo GenesisBlock_Dev/GenesisBlock` (or point Claude at its local path / set the session `cwd` so both are visible)

  **Claude does:** confirms both Rwang (the orchestrator) and the target (the repo being built) are on disk and readable.

---

## Step 2 — Write or pick a spec under `specs/`

A run is driven by a spec. Start from the template.

> **You type:** `open specs/_TEMPLATE.yaml and help me write specs/refine-quant.yaml for the GenesisBlock vector-quant refinement`

**Claude does:** copies `specs/_TEMPLATE.yaml` to your new spec, helps you fill in the **epic DoD**, the **task list** (each with a `verify_command` where possible), and `depends_on` ordering. Tasks **without** a machine-checkable `verify_command` get flagged so they floor at **T2+** (see the HARD RULE in AUTONOMY.md).

---

## Step 3 — Tell Claude to run the spec

> **You type:** `use Rwang to run specs/refine-quant.yaml against G:/GenesisBlock_Dev/GenesisBlock, autonomy=autonomous`

**Claude does:**
1. **Launches the runner** via the **Workflow tool** — routing is *not* a session step; it happens inside the runner's Route phase:
   ```text
   scriptPath = orchestrator/run.js
   args = { specPath: "specs/refine-quant.yaml",
            targetRepo: "G:/GenesisBlock_Dev/GenesisBlock",
            autonomy: "autonomous",
            runDir:   "G:/Rwang/runs/<runId>",
            phase:    "route" | "execute" | "review" | "commit" }   // optional; omit to chain all
   ```
2. **The Route phase runs** `governance_lint.py` first (a hard gate — a non-zero exit refuses to start the run), then `orchestrator/route.py` to assign the cheapest eligible tier per task (honoring the verify gate), and writes the durable `tasks.json`. (`cost_estimate.py` is a standalone auditor and is NOT called during routing.)
3. Creates `runs/<runId>/` and begins writing `progress.ndjson` (one event per line), `progress.json` (the snapshot), and — once the gate/approve trio runs — `approvals.ndjson`.

You name the **autonomy** level here (`supervised` / `autonomous` / `unattended`) — see AUTONOMY.md for exactly what each does.

---

## Step 4 — Open the monitor and watch progress

The monitor reads `runs/<runId>/progress.json` live.

- **Quickest:** open `monitor/monitor.html` directly.
- **Recommended (avoids `file://` fetch issues):** serve the runs directory over HTTP so the page can `fetch` the JSON:

  ```bash
  cd G:/Rwang/runs && python -m http.server 8000
  # then open  monitor/monitor.html  pointed at  http://localhost:8000/<runId>/progress.json
  ```

  > Note: `python -m http.server` (not `python3` — `python3` is not on PATH on this machine). The HTTP tip matters because browsers block `fetch()` of `file://` JSON in many setups; serving over `http://` sidesteps it.

**You see:** per-phase status, per-task tier/model/attempts, the two-way cost ledger (local vs billed tokens, billed USD), and the event stream.

---

## Step 5 — The run drives autonomously

In `autonomous` mode the runner drives the whole VERIFY → AUTHOR → REVIEW → ASSEMBLE loop end-to-end **without per-task prompts**. It **stops only** at:

- **External writes** — `git commit` / `push` / PR / merge / deploy (never done without you).
- **Gate-exhaustion** — a task that fails even at **T3**: the run halts and surfaces it (it never loops forever).
- **`human_review`-flagged tasks** — anything the spec marked for a human.

Everything else — cheap-tier attempts, verify-gate checks, escalation up the ladder, cost metering — happens unattended. The verify gate is the interlock that lets it skip human approval at *phase* boundaries while still being safe (see AUTONOMY.md).

---

## Step 6 — Review and approve the write

When the runner halts at an external write it surfaces the proposed commit/PR (diff + which tasks passed which gate at which tier, with cost).

> **You type:** `show me the diff and the gate results, then commit to the branch` — or — `looks good, open the PR`

**Claude does:** presents the evidence, and **only on your approval** performs the external write. **A human always owns the merge** — even `unattended` mode auto-commits to a branch but never merges.

---

## The shared progress schema

Every Rwang file agrees on this exact shape. Per run, `runs/<runId>/` holds `progress.json` (snapshot) and `progress.ndjson` (append-only audit) — both below — plus `tasks.json` (the durable routed task list the Route phase writes and a standalone Execute phase rehydrates from), `approvals.ndjson` (one line per supervised approval), `governance_lint.json` (the stamped Governance-Matrix report), and — for runs of 3+ tasks — `context.md` (the facts-only target-repo brief written once at Route; every Execute agent reads it instead of re-exploring the repo, and the live repo always wins on any disagreement).

### `progress.json` (the rolled-up snapshot the monitor reads)

```json
{
  "runId": "str",
  "spec": "str",
  "target_repo": "str",
  "autonomy": "str",
  "status": "running|blocked|done|failed|phase_done:<phase>|awaiting_approval|awaiting_merge|needs_work",
  "awaiting": { "phase": "str" },
  "started_at": "iso",
  "updated_at": "iso",
  "epic_dod": "str",
  "phases": [{ "name": "str", "status": "pending|running|passed|failed" }],
  "tasks": [{
    "id": "str",
    "description": "str",
    "tier": "str",
    "model": "str",
    "status": "pending|running|passed|escalated|failed|blocked",
    "attempts": [{ "tier": "str", "model": "str", "result": "pass|fail", "verify_exit": 0 }],
    "cost_usd": 0,
    "tokens": { "local": 0, "billed": 0 },
    "verify_command": "str",
    "depends_on": ["str"],
    "updated_at": "iso"
  }],
  "ledger": { "local_tokens": 0, "billed_tokens": 0, "billed_usd": 0 },
  "events": [{ "ts": "iso", "task": "str", "event": "str", "detail": "str" }]
}
```

### `progress.ndjson` (append-only, one JSON event per line)

```json
{ "ts": "iso", "task": "str", "event": "queued|running|verify|pass|fail|escalate|blocked|phase_done|gate|approve|note", "status": "str", "tier": "str", "model": "str", "cost_usd": 0, "detail": "str" }
```

---

## Read next

- **AUTONOMY.md** — the three levels and the non-negotiable safety invariants.
- **CLAUDE.md** — operating instructions for the session (deterministic-core rule, `python` gotcha, pricing flag).
