# Spec Template — the SSOT the Router Reads

> The spec is the **single source of truth the router reads to assign tiers.** Routing is
> not a side-channel heuristic — it is *derived from the spec.* This template extends the
> existing `spec-driven-development` skill's Phase-3 task list with exactly **two new
> routing fields** (`tier_hint`, plus the executable `verify_command`); it does not
> replace the spec layer.
>
> **Composes with:** run the `spec-driven-development` skill first to produce
> Requirements (EARS acceptance criteria) → Design → Tasks. Then fill the routing fields
> below onto each Phase-3 task. Do **not** rewrite the spec layer from scratch.
>
> **Design invariant #3:** a unit is cheap-routable iff it has a `verify_command`. No
> machine-checkable AC → no cheap routing → escalate by default to T2+.

---

## 0. Goal

One or two sentences. The change this spec covers, in plain language. The "why."

```
Goal: <what we are building/fixing and the user-visible outcome>
```

## 1. Constraints

Hard boundaries the router and executors must respect.

```
Constraints:
  - Language/domain: <e.g. Rust, src/lib.rs storage core>
  - Must not regress: <e.g. cargo test green; no perf regression on HQL path>
  - Engine alignment: <e.g. any embedding query MUST use bge-m3 — engine-matched>
  - Human-in-the-loop: assemble + any external write action requires approval
  - Out of scope: <explicitly list what this change does NOT touch>
```

---

## 2. Definition of Done — MULTI-LEVEL

Three nested tiers of acceptance criteria. **Rule of thumb: a checkpoint exists iff a
model is routed across it or a human signs off at it.** That yields exactly
**1 epic DoD + 4 phase gates + N per-task ACs** — no sprint-level or per-agent DoDs.

### 2a. Epic DoD (SSOT, human-owned) — count: 1

One block, EARS-format, the contract the **final human review** checks.

```
EPIC DoD:
  WHEN <trigger/condition>
  THE SYSTEM SHALL <observable, testable outcome>
  AND <second clause ...>
  Done means: <the whole change is complete — checked by a human at Assemble>
```

### 2b. Per-phase gate AC (the routing interlock) — count: 4

One machine-checkable gate at each boundary of the spine. These are the **economic
safety interlocks**: no unverified cheap output crosses a phase boundary.

```
PHASE GATES:
  Verify-gate:   every finding carries a resolving evidence command (grep/test/line-cite)
                 that re-runs and resolves; ≥ N verifiers returned structured finding+evidence.
  Author-gate:   author outputs reference only findings that passed the Verify-gate;
                 every claim traces to a verified finding id.
  Review-gate:   adversarial reviewer returns PASS with no unresolved blocking objection.
  Assemble-gate: files assembled; epic DoD re-checked by a human; external writes approved.
```

### 2c. Per-task AC (executable, smallest routable unit) — count: N

Each Phase-3 task carries a **named command** that returns pass/fail. This is the unit the
router grades to decide cheap-vs-escalate, and the **RED test** the composed `tdd-workflow`
turns GREEN. The per-task AC and the RED test are the same artifact viewed from two skills.

---

## 3. Task list — per-task routing schema

Each Phase-3 task entry carries these fields:

```yaml
- id: T-<n>                      # stable task id (used by depends_on / review_gate refs)
  description: "<the unit of work, one routable thing>"
  requirement_ref: R-<x.y>       # traceability back to the EARS requirement (existing)
  tier_hint: <T0|T1|T1.5|T2|T3>  # router's STARTING rung; router may escalate on gate fail
  executor_model: "<model tag>"  # concrete model for tier_hint (e.g. aroow-rust-coder-9b)
  verify_command: "<cmd>"        # the executable per-task AC = the RED test (Q4/Q5 keystone)
  depends_on: [T-<k>, ...]       # tasks that must pass first (empty = independent/parallel)
  review_gate: <true|false>      # true → output must clear the adversarial Review phase
```

Field notes:

- **`verify_command`** — the machine-checkable AC and the RED test. Its *existence* is what
  makes a task cheap-eligible. **No command → not routable cheap → default to T2+.**
  Examples: `cargo test --test temporal_queries_tests -- retract_visible_as_of`,
  a `grep` that must resolve, a `schema-validate`, a compile.
- **`tier_hint`** — the *starting* rung, derived deterministically from task signals
  (file type, token estimate, presence of `verify_command`, domain = Rust → an
  `Aroow-Rust-Coder`-class model). It is a hint, not a verdict: on a failed gate the
  router **escalates one rung** `T0 → T1 → T1.5 → T2 → T3` per the FrugalGPT cascade.
- **`executor_model`** — the concrete model the `tier_hint` resolves to on this host.
  Text-generation roles pick a tier; **role specialists** (embed/rerank/VLM) are picked by
  *task type*, never by difficulty — and any embedding query against the GenesisBlock
  vector store is **engine-matched to `bge-m3`** (mandatory; any other embedder breaks
  recall by living in a different metric space).
- **`depends_on`** — empty list = the task can run in the parallel fan-out; non-empty =
  it waits. The verify phase's 7 parallel verifiers are independent (`depends_on: []`).
- **`review_gate`** — `true` routes the task's output through the adversarial Review phase
  before Assemble. Author outputs are typically `true`; trivial mechanical tasks `false`.

### Tier ladder (Axis 1) quick reference

| Tier | Role | Example executor on this host | Marginal cost |
|---|---|---|---|
| T0 | local-SLM: classify / cheap verify | `vibethinker-3b`, `chinda-qwen3-4b` | ~$0 |
| T1 | local-mid: bulk reasoning / code / structured | `aroow-rust-coder-9b`, `mellum2-12b-a2.5b` | ~$0 |
| T1.5 | cloud-open-weights: near-frontier code | `kimi-k2.7-code:cloud`, `deepseek-v4-pro:cloud` | ~$0.1–0.5/M |
| T2 | Claude-mid: quality general / authoring | `claude-sonnet-4-6` | $3 in / $15 out |
| T3 | Claude-frontier: hard reasoning / adversarial review | `claude-opus-4-8` | $5 in / $25 out |

---

## 4. Filled mini-example

```yaml
Goal: Verify edge retraction hides from neighbors but survives time-travel, then
      author an RCA if the bitemporal contract is broken.

Constraints:
  - Language/domain: Rust, src/lib.rs (retract_edge + neighbors + as_of path)
  - Must not regress: cargo test --test temporal_queries_tests green
  - Human-in-the-loop: RCA doc reviewed before commit

EPIC_DoD:
  WHEN an edge is retracted at time t
  THE SYSTEM SHALL hide it from the current `neighbors` view
  AND continue to return it for `as_of` < t OR `include_invalid = true`.
  Done means: the bitemporal contract holds and any gap has a reviewed RCA.

PHASE_GATES:
  Verify-gate:   each finding cites a resolving `cargo test`/`grep`; ≥3 verifiers structured.
  Author-gate:   RCA references only verified findings by id.
  Review-gate:   adversarial reviewer returns PASS.
  Assemble-gate: human re-checks epic DoD; approves the commit.

tasks:
  - id: T-1
    description: "Confirm retract_edge advances the edge clock and sets valid_to"
    requirement_ref: R-4.2
    tier_hint: T1
    executor_model: "aroow-rust-coder-9b"
    verify_command: "cargo test --test temporal_queries_tests -- retract_advances_clock"
    depends_on: []
    review_gate: false

  - id: T-2
    description: "Confirm neighbors hides the retracted edge from the current view"
    requirement_ref: R-4.2
    tier_hint: T1
    executor_model: "aroow-rust-coder-9b"
    verify_command: "cargo test --test temporal_queries_tests -- retract_hidden_now"
    depends_on: []
    review_gate: false

  - id: T-3
    description: "Confirm as_of before retraction still returns the edge (time-travel)"
    requirement_ref: R-4.2
    tier_hint: T1
    executor_model: "mellum2-12b-a2.5b"
    verify_command: "cargo test --test temporal_queries_tests -- retract_visible_as_of"
    depends_on: []
    review_gate: false

  - id: T-4
    description: "If any of T-1..T-3 fail, author an RCA of the bitemporal gap"
    requirement_ref: R-4.2
    tier_hint: T3            # authoring on a (possibly) broken contract → frontier
    executor_model: "claude-opus-4-8"
    verify_command: "test -f .brain/rca/edge-retract-bitemporal.md"
    depends_on: [T-1, T-2, T-3]
    review_gate: true        # RCA goes through adversarial Review before Assemble
```

In the spine: the router reads this list, runs T-1..T-3 as parallel cheap-eligible
verifiers behind the **Verify-gate**, and only lets T-4 (frontier author) consume their
findings *after* each evidence command resolves. The composed `tdd-workflow` turns each
`verify_command` RED → GREEN at the routed tier.
