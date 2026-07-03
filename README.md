# Rwang

**Rwang is a standalone orchestrator repo — a control plane for autonomous, cost-tiered software work.**

It does not contain the code it builds. Instead, Rwang *drives* a **target repo** (e.g. GenesisBlock at `G:/GenesisBlock_Dev/GenesisBlock`) through a proven **VERIFY → AUTHOR → REVIEW → ASSEMBLE** loop. You hand it a **spec**, and it decomposes the work into tasks, routes each task to the cheapest model tier that can pass its machine-checkable verify gate, escalates the ones that fail, meters the cost on every tier (including local), and writes append-only progress that a live monitor reads.

Rwang is driven from a **Claude Code session**. The autonomous runner itself is a **Workflow script** (`orchestrator/run.js`) launched via the Workflow tool.

---

## What Rwang is (and is not)

- **Is:** the orchestrator / control plane. The loop logic, the model-tier router, the verify gate, the cost ledger, the progress schema, the autonomy policy.
- **Is not:** the engine being built. The target repo (GenesisBlock or any other) lives elsewhere on disk and is named *in the spec*. Rwang reads it, edits it on a branch, verifies, and reports — but the two repos stay separate.

One Rwang drives many targets. A target is just a path plus a spec.

---

## Architecture

Rwang is the [`tiered-swarm` skill](.claude/skills/tiered-swarm/references/DESIGN-RATIONALE.md) — already proven as an in-session orchestration pattern — **ported into a standalone, autonomous repo** and wrapped with a runner and a monitor.

```
┌────────────────────────────────────────────────────────────────┐
│  Claude Code session  (you talk to it; it reads the spec)        │
│      │                                                           │
│      │  launches via Workflow tool                               │
│      ▼                                                           │
│  orchestrator/run.js   ── the autonomous runner ──┐              │
│      │  drives VERIFY → AUTHOR → REVIEW → ASSEMBLE │              │
│      │                                             │              │
│      ▼                                             ▼              │
│  orchestrator/*.py  (deterministic core)     TARGET REPO         │
│    route.py          ← model-tier router      (e.g. GenesisBlock)│
│    progress.py       ← shared-schema writer   edited on a branch │
│    check_evidence.py ← the verify gate        verified in place  │
│    cost_estimate.py  ← FrugalGPT break-even                      │
│    cost_ledger.py    ← two-way token ledger                      │
│    ollama_route.sh   ← local-tier dispatch                       │
│    governance/       ← Governance-Matrix meta-gate (halts runs)  │
│      │                                                           │
│      ▼                                                           │
│  runs/<runId>/progress.ndjson  +  progress.json  ◀── monitor/    │
└────────────────────────────────────────────────────────────────┘
```

**The two-axis model.** Capability **tiers** are orthogonal to **role** specialists.

- **Tiers (capability ladder):**
  - **T0** local-SLM — `vibethinker-3b`
  - **T1** local-mid — `aroow-rust-coder-9b`, `mellum2-12b-a2.5b`
  - **T1.5** cloud open-weights — `kimi-k2.7-code:cloud`, `deepseek-v4-pro:cloud`
  - **T2** `claude-sonnet-4-6`
  - **T3** `claude-opus-4-8`
- **Roles (specialists):** `embed` = `bge-m3` (engine-matched), `rerank` = `bge-reranker-v2-m3`, plus author/review/verify roles. **The router is a role, not a tier.**

**HARD RULE:** a task with **no machine-checkable `verify_command` is not cheap-eligible** → it floors at **T2+**. Local-first routing is allowed **only behind a verify gate**. The break-even is FrugalGPT: route cheap **iff** `p_fail < c_frontier_direct / c_frontier_fix`.

**Cost is two-way** — count × per-type price — and metered on **every** tier including local (Ollama returns `prompt_eval_count` / `eval_count`). Claude pricing is a **2026-06-04 snapshot carrying an uncertainty flag**: re-verify before billing.

---

## Repo layout

```
G:/Rwang/
├── README.md                     ← this file
├── CLAUDE.md                     ← operating instructions for a Claude Code session
├── USERFLOW.md                   ← the end-to-end human flow, step by step
├── AUTONOMY.md                   ← the three autonomy levels + safety invariants
├── .claude/skills/tiered-swarm/  ← the ported skill (SKILL.md, references/DESIGN-RATIONALE.md, …)
├── orchestrator/                 ← the runner + the deterministic core
│   ├── run.js                    ← autonomous runner (launched via Workflow tool)
│   ├── route.py                  ← model-tier router (role-based)
│   ├── progress.py               ← shared-schema writer (progress.json/ndjson + pause/approve)
│   ├── check_evidence.py         ← the verify gate
│   ├── cost_estimate.py          ← FrugalGPT break-even estimator
│   ├── cost_ledger.py            ← two-way token/cost ledger
│   ├── ollama_route.sh           ← local-tier dispatch
│   └── governance/               ← Governance Matrix: governance.yaml + governance_lint.py
│                                    (meta-gate; a non-zero lint refuses to start/resume a run) + test_guards.py
├── monitor/
│   └── monitor.html              ← reads runs/<runId>/progress.json live
├── docs/                         ← design docs + audits (e.g. DESIGN--pause-resume-runner.md)
├── specs/                        ← specs you write; see specs/_TEMPLATE.yaml
└── runs/<runId>/                 ← per-run progress.{ndjson,json} + tasks.json + approvals.ndjson
```

---

## Quickstart

```text
1. Open a Claude Code session where BOTH Rwang and the target repo are reachable on disk.
2. Write or pick a spec under specs/  (start from specs/_TEMPLATE.yaml).
3. Tell Claude:  "use Rwang to run specs/<your-spec>.yaml against G:/GenesisBlock_Dev/GenesisBlock, autonomy=autonomous"
4. Open monitor/monitor.html (or `python -m http.server` inside runs/) and watch progress.json.
5. When the run halts at an external write (commit/PR), review and approve it yourself.
```

---

## Read next

- **[USERFLOW.md](USERFLOW.md)** — the concrete, numbered flow a human follows through Claude Code.
- **[AUTONOMY.md](AUTONOMY.md)** — the three autonomy levels and the non-negotiable safety invariants.
- **[.claude/skills/tiered-swarm/references/DESIGN-RATIONALE.md](.claude/skills/tiered-swarm/references/DESIGN-RATIONALE.md)** — why the two-axis model, the verify gate, and FrugalGPT routing exist.
