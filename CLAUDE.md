# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Operating instructions for a Claude Code session working **in Rwang**. Read this before driving any run or editing the core.

## What Rwang is

Rwang is an **orchestrator / control plane**. It does **not** contain the code it builds. It drives **other repos** — the **target repo** is named *in the spec* (e.g. GenesisBlock at `G:/GenesisBlock_Dev/GenesisBlock`). Your job in this session is to read a spec, route its tasks, launch the runner, and supervise the autonomy policy — not to hand-edit the target yourself.

One Rwang drives many targets. A target is just a path plus a spec.

## Architecture — how the pieces connect

The data flow of a run, end to end:

```
specs/<x>.yaml ──> run.js  (the Workflow runner)  ──> target repo (edited on a branch)
   (SSOT)            ├─ governance_lint.py gate ...... exit≠0 → refuse to start/resume
                     ├─ runs route.py ................ tier assignment
                     ├─ drives VERIFY→AUTHOR→REVIEW→ASSEMBLE
                     ├─ climbs escalation ladder T0→T1→T1.5→T2→T3
                     └─ writes via progress.py ──> runs/<runId>/progress.{json,ndjson}
                                                          └──> monitor/monitor.html (live)
```

- **`specs/*.yaml`** — the single source of truth. Each task carries `verify_command`, `tier_hint`, `executor_model`, `depends_on`, `review_gate`, and optionally `human_review: true` (surfaced to a human, never auto-run — the Route agent also sets it for any external-write task). Routing is *derived* from this file, never a side-channel. Start from `specs/_TEMPLATE.yaml`; `specs/P0-vector-quant-sidecar.yaml` is a real worked example.
- **`orchestrator/route.py`** — reads the spec, emits a tier per task from deterministic signals only. The router is a **role, not a tier** — it never sends work to a model.
- **`orchestrator/run.js`** — the autonomous runner, a **Workflow script** (see below). It topologically batches tasks into dependency **waves** (independent tasks in a wave run in `parallel()`), runs each through the verify gate + escalation ladder in `runTaskWithEscalation`, and on the first `terminal: "blocked"` (external write / gate-exhaustion / human_review) it **skips all later waves** — siblings already running in the same wave still finish — then **still runs the T3 adversarial Review + `finish --status blocked`** so the human gets an assessment, not just a halt.
- **`orchestrator/progress.py`** — the only writer of the shared progress schema. Agents inside `run.js` shell out to it (`init` / `event` / `phase-done` / `gate` / `approve` / `finish`) to keep `runs/<runId>/progress.json` (snapshot) and `progress.ndjson` (append-only audit) in sync; the pause/approval trio (`phase-done`/`gate`/`approve`) also maintains `approvals.ndjson`. The exact schema lives in this file's docstring and in USERFLOW.md — **every file agrees on that shape verbatim**.
- **`orchestrator/check_evidence.py`** — the standalone verify-gate enforcer: runs each finding's `evidence_command` and exits non-zero if any fails, so it can sit in a pipeline as a hard gate before the author phase.
- **`orchestrator/cost_estimate.py`** / **`cost_ledger.py`** — the two-way cost model (token count × per-type price). `cost_ledger.py` is a thin wrapper that reads a JSONL ledger and prints a local-vs-billed split.
- **`orchestrator/ollama_route.sh`** — local-tier dispatch: POSTs a prompt to local Ollama and prints the response text plus `prompt_eval_count` / `eval_count` for the ledger.
- **`orchestrator/governance/`** — the **Governance Matrix**: `governance.yaml` maps each policy to a guard; `governance_lint.py` (deterministic, stdlib + PyYAML) proves every ENFORCED policy's guard and exits non-zero if any is broken; `test_guards.py` is its guard test suite. `run.js` runs the lint at the **top of the Route phase and again at Execute resume** — a non-zero exit **refuses to start/resume the run** (a hard interlock). Some guards are still `PLANNED` (WIP).

## The deterministic core is sacred

`orchestrator/*.py` (+ `ollama_route.sh`) is the **deterministic core**: `route.py` (role-based model-tier router), `check_evidence.py` (the verify gate), `cost_estimate.py` (FrugalGPT break-even), `cost_ledger.py` (two-way token/cost ledger), `progress.py` (shared-schema writer), `ollama_route.sh` (local-tier dispatch), `governance/governance_lint.py` (Governance-Matrix meta-gate).

- **NEVER put LLM SDK calls in the core.** They are pure, testable, deterministic functions. Model calls happen in the runner / the session, not in the core. Keeping the core LLM-free is what makes routing and cost reproducible.
- Treat these scripts as a stable contract. If you change one, it must stay deterministic and the existing CLI/IO shape must hold — `run.js`, `progress.py`, and `monitor.html` all depend on the exact schema and CLI flags.
- The core is **dependency-free stdlib** except: `route.py` needs PyYAML *only* for `.yaml` input (JSON input needs nothing); `governance_lint.py` needs PyYAML for its default `governance.yaml` matrix (and since the lint gates every run start, PyYAML is now effectively required to launch anything); `ollama_route.sh` needs `curl`.

## Commands

Use `python`, **not** `python3` (see Gotchas). Run all core scripts from `G:/Rwang`.

```bash
# Router — pretty summary to stderr, JSON to stdout; add --json for JSON only
python orchestrator/route.py specs/P0-vector-quant-sidecar.yaml
python orchestrator/route.py specs/P0-vector-quant-sidecar.yaml --json
cat specs/foo.yaml | python orchestrator/route.py -

# Cost model — run the worked example / demo (the three A/B/C scenarios)
python orchestrator/cost_estimate.py

# Cost ledger — aggregate a JSONL ledger, print local-vs-billed split
python orchestrator/cost_ledger.py ledger.jsonl

# Verify gate — run each finding's evidence_command; exit 0 iff ALL resolve
python orchestrator/check_evidence.py findings.json
python orchestrator/check_evidence.py findings.json --dry-run   # print, run nothing

# Local-tier dispatch — prints response text + token counters
bash orchestrator/ollama_route.sh mellum2-12b-a2.5b "your prompt"

# Governance Matrix — meta-gate run at the top of every run; exit 0 iff every
# ENFORCED policy proved its guard (PLANNED guards warn, don't fail)
python orchestrator/governance/governance_lint.py
python orchestrator/governance/test_guards.py          # per-policy guard test suite

# Progress schema (normally called BY the runner's agents, not by hand)
python orchestrator/progress.py runs/<runId> init --spec ... --target ... --autonomy ... --epic "..." --tasks runs/<runId>/tasks.json
python orchestrator/progress.py runs/<runId> event --task T-1 --status pass --tier T2 --model claude-sonnet-4-6 --cost 0 --note "..."
python orchestrator/progress.py runs/<runId> phase-done --phase execute              # mark a phase boundary
python orchestrator/progress.py runs/<runId> gate --phase execute --await            # supervised pause (awaiting_approval)
python orchestrator/progress.py runs/<runId> approve --phase execute --by me         # clear the pause -> running
python orchestrator/progress.py runs/<runId> finish --status done                    # done|blocked|failed|awaiting_merge|needs_work

# Monitor — serve the runs dir over HTTP so the page can fetch() the JSON
cd G:/Rwang/runs && python -m http.server 8000
# then open monitor/monitor.html pointed at http://localhost:8000/<runId>/progress.json
# (monitor.html defaults to ../runs/latest/progress.json and also has a path input + file picker)
```

There is **no build step**, and no test suite for the *runner's own* work beyond the **governance layer**, which does have both: `governance/test_guards.py` (per-policy guard tests) and `governance/governance_lint.py` (a lint run at the top of every run). The other core scripts self-verify via their `__main__` demos (`cost_estimate.py`) and their CLIs. The *target* repo has the tests; Rwang runs them via each task's `verify_command`.

## How to run a spec

Launch the autonomous runner via the **Workflow tool**, not by shelling out:

```text
Workflow tool:
  scriptPath = orchestrator/run.js
  args = { specPath: "specs/<x>.yaml",
           targetRepo: "G:/GenesisBlock_Dev/GenesisBlock",
           autonomy: "supervised" | "autonomous" | "unattended",
           runDir:   "G:/Rwang/runs/<runId>",
           phase:    "route" | "execute" | "review" | "commit"  // optional; omit to chain all
         }
```

Omit `phase` to chain phases per the autonomy level. Pass a single `phase` to run exactly one and return — this is how the supervised session driver pauses between boundaries (see AUTONOMY.md "The supervised driver contract").

The runner reads the spec, then: runs `route.py` to assign tiers; has each Execute agent run the task's `verify_command` **directly** to verify; and records token/cost estimates via `progress.py`. It writes `runs/<runId>/progress.ndjson` (append-only) and `runs/<runId>/progress.json` (rolled-up snapshot the monitor reads), both conforming to the **shared progress schema** (USERFLOW.md and `progress.py`'s docstring — every file agrees on the exact shape).

**What run.js does and does not call:** it invokes `route.py`, `progress.py`, `governance/governance_lint.py` (the hard governance gate — a non-zero exit at Route entry or Execute resume aborts the run), and — via local-tier Execute agents — `ollama_route.sh`. The remaining core scripts — `check_evidence.py`, `cost_estimate.py`, `cost_ledger.py` — are **standalone** gates/auditors it does *not* invoke. Consequently the `cost_usd` values in `progress.json` are each agent's **rough self-estimate**, not a `cost_estimate.py` computation; run `cost_ledger.py` over a real token ledger if you need audited dollars.

### run.js is a Workflow script — the constraints that shape it

`run.js` runs in the Workflow sandbox, which is why it looks the way it does:

- **Pure JS only.** No `fs`, `Bash`, or Node APIs in the script *body*. All filesystem/shell/progress writes happen **inside `agent()` calls** (agents have tools; the body only orchestrates).
- **`Date.now()` / `Math.random()` / argless `new Date()` THROW** in the body. Every timestamp is produced inside an agent (or pinned via `progress.py --ts`). `progress.py` itself runs as a normal CLI, so `datetime` is fine *there*.
- Must begin with `export const meta = {...}` as a pure literal (a **single string literal** for `description` — no `+` concatenation, or the loader rejects it).
- Available hooks: `agent(prompt, opts)`, `parallel(thunks)`, `pipeline(items, ...stages)`, `phase(title)`, `log(msg)`, and the global `args`.
- **The body is top-level, not `export default`.** The runtime executes the body directly (top-level `await`/`return` are fine); wrapping it in `export default async function run() {…}` makes the runtime reject the second export. (`node --check` still passes — CommonJS allows top-level `return`.)
- **`args` may arrive as a JSON string**, not an object — so `args.specPath` is `undefined` and `Object.keys(args)` returns char indices. `run.js` normalizes once (`const CFG = typeof args === "string" ? JSON.parse(args) : args`), reads `CFG` everywhere, and fails fast on missing args.
- **The file must be committed LF** (`.gitattributes` pins `*.js`/`*.py`/`*.sh` to `eol=lf`) — the Workflow loader rejects a script carrying CR bytes as "control characters".

## Autonomy safety invariants — NEVER yield these to autonomy

1. **No external write without human approval.** Never `git push`, open a PR, merge, or deploy on your own. The runner **halts and surfaces** these for a human; you relay, you do not act.
2. **The verify gate is mandatory.** No unverified cheap output crosses a phase boundary. A task with no machine-checkable `verify_command` is **not cheap-eligible** → floor it at **T2+**. Local-first is allowed **only** behind the gate. (`route.py` enforces this HARD RULE; do not bypass it in a spec.)
3. **Halt on gate-exhaustion — never loop forever.** If a task fails even at T3 (top of the escalation ladder), the run **stops** and surfaces the task to the human. Do not retry indefinitely, do not silently downgrade the DoD.
4. **Always work on a branch.** Every run lands on a branch, never directly on the target's default branch. A human owns the merge.

When autonomy says "drive end-to-end," it means *up to* these invariants — they are the interlocks, not suggestions.

There is also a **governance interlock** on top of these: `run.js` runs `governance_lint.py` at the top of the Route phase (and again at Execute resume) and **refuses to start/resume any run** if it exits non-zero — a broken Governance Matrix halts everything before work begins.

**Implementation status:** `run.js` is split into disk-checkpointed phases (`route`/`execute`/`review`/`commit`) via `args.phase`, so runs pause *between* invocations. `supervised` is wired (single-phase invocation + `progress.py` `gate`/`approve` + a session driver that pauses per phase — see AUTONOMY.md). `autonomous` is unchanged. `unattended` **now performs a branch-only local `git commit`** (via `phaseCommit`, hard-guarded to `unattended`, aborts on the default branch, never push/PR/merge) and stops at `awaiting_merge`; **a human still owns the merge** — that invariant never relaxes. (The commit path is implemented but not yet exercised by an end-to-end smoke.) See AUTONOMY.md and `docs/DESIGN--pause-resume-runner.md`.

## The two-axis model (context for routing changes)

Capability **tiers** are orthogonal to **role** specialists — full rationale in README.md and `references/DESIGN-RATIONALE.md`; the routing-relevant essentials:

- **Tier ladder (cheap→frontier):** T0 `vibethinker-3b` → T1 `aroow-rust-coder-9b` (Rust) / `mellum2-12b-a2.5b` (general) → T1.5 `kimi-k2.7-code:cloud` → T2 `claude-sonnet-4-6` → T3 `claude-opus-4-8`. Escalation climbs one rung per verify failure. Role specialists (`embed`=`bge-m3` engine-matched, `rerank`=`bge-reranker-v2-m3`) are picked by task TYPE, not difficulty — **the router is a role, not a tier.**
- **`route.py` raises the computed tier** from deterministic signals: no `verify_command` → floor **T2** (HARD RULE); `review_gate: true` → **T3**; frontier words (`author`, `design`, `rca`, `architect`, `plan `, `proof`, `synthes`, `adversarial`) → **T3**. A spec `tier_hint` is a **floor only** — force higher, never lower; so a review-gated task hinted `T2` resolves to `T3`/opus and is flagged `disagrees_with_spec` (expected, not a bug to "fix").
- Break-even is FrugalGPT: route cheap **iff** `p_fail < c_frontier_direct / c_frontier_fix`.

## Gotchas

- **`python`, not `python3`.** On this machine the interpreter is `python` — `python3` is **not on PATH**. This applies to the monitor's `python -m http.server` too. `ollama_route.sh` already probes for both.
- **`progress.py` accepts either argument order.** `progress.py <cmd> <runDir> ...` **and** `progress.py <runDir> <cmd> ...` both work — it swaps the first two tokens (the runner issues runDir-first, argparse wants cmd-first). Keep this normalization if you touch that file.
- **Pricing uncertainty flag.** Claude per-token prices in `cost_estimate.py` are a **2026-06-04 snapshot** carrying an uncertainty flag — **re-verify current pricing before billing** or before reporting dollar figures as authoritative. Local-tier counts are exact (Ollama returns `prompt_eval_count` / `eval_count`); the dollar conversion for Claude tiers is the part that can drift. An unknown `claude*` tag in the pricing table **raises loudly** rather than pricing at $0 — do not "fix" that by adding a silent fallback.
- Cost is **two-way**: count × per-type price, metered on **every** tier including local. Do not report only billed tokens — local tokens are tracked too, so "local saved N tokens" stays auditable.
- **`check_evidence.py` executes the commands embedded in findings.** That is the point (the gate must run the cited check), but only run findings you trust; `--dry-run` prints without executing.

## Where to read next

- **USERFLOW.md** — the concrete human flow through a session + the full shared progress schema.
- **AUTONOMY.md** — the three autonomy levels and the invariants in depth.
- **README.md** — the project overview and repo layout.
- **.claude/skills/tiered-swarm/references/DESIGN-RATIONALE.md** — why the two-axis model and the verify gate exist. (`orchestrator/*` is this skill's `scripts/*` ported into a standalone repo.)
</content>
