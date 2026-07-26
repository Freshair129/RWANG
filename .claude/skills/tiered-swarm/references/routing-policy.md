# Routing Policy — the decision rules

> **SSOT:** `references/DESIGN-RATIONALE.md` (Q2, Q3, Q4). This file is the operational
> rulebook the router and operator follow to decide *cheap-vs-escalate* and to enforce the
> verify gate. Read `references/model-tiers.md` to map a chosen tier to a concrete model.

The whole policy reduces to one sentence: **route a unit to the cheapest tier that has a
machine-checkable way to prove it succeeded, behind a gate that stops a wrong cheap output
before it reaches an authoring agent.** Everything below makes that precise.

---

## 1. The cheap-eligibility test (the gate to even consider going cheap)

A task is **cheap-eligible** iff it is verifiable by a deterministic or near-free check —
NOT merely "looks doable by a small model." Concretely, the task must carry a
`verify_command` whose result is unambiguously pass/fail:

- a named test: `cargo test --test temporal_queries_tests -- retract_visible_as_of`
- a compile: `cargo build --no-default-features --features bins`
- a schema-validate: `python scripts/check_evidence.py finding.json`
- a `grep` that MUST resolve to a real line: `rg -n "fn retract_edge" src/lib.rs`

```
cheap_eligible(task)  ⟺  task has a verify_command that returns pass/fail at ~$0
```

If a task has **no** `verify_command`, it is **not cheap-eligible** — it does not enter the
cheap ladder at all; it starts at **T2 (Claude-mid)** by default. You cannot safely route a
model to work you cannot cheaply grade. This is the keystone rule tying the whole skill
together: no machine-checkable AC at the unit being routed ⟹ no cheap routing.

`scripts/route.py` computes this deterministically and emits the `tier_hint`.

---

## 2. The FrugalGPT break-even inequality (cheap-vs-frontier-direct)

Even when a task is cheap-eligible, route it cheap only when the *expected total cost* of
going cheap beats doing it directly on frontier:

```
E[cost_cheap] = c_cheap + p_fail · (c_verify + c_frontier_fix)   <   c_frontier_direct
```

where `p_fail = 1 − p(correct_cheap)`. With local `c_cheap ≈ 0` and a cheap deterministic
verifier `c_verify ≈ 0`, this collapses to the clean routing rule:

```
route cheap  ⟺  p_fail  <  c_frontier_direct / c_frontier_fix
```

The decisive term is the ratio **`c_frontier_fix / c_frontier_direct`** — how much *more* a
fix costs than doing it right the first time. A fix pays the frontier price **anyway**
*plus* the wasted cheap+verify work *plus* propagation to any downstream agent that already
consumed the bad output.

| Situation | `c_frontier_fix / c_frontier_direct` | Threshold on `p_fail` | Verdict |
|---|---|---|---|
| Cheap output is independently verifiable & self-contained (a fix ≈ a fresh frontier attempt, no propagation) | ≈ 1 | ≈ 1 (almost any `p_fail`) | **local-first almost always wins** (the summarization case) |
| Cheap output feeds downstream agents *before* verification (verifier→author chain) | ≫ 1 | tiny | **escalate, or insert a verify gate between producer and consumer** (the tight-CI case: even 1% error justifies escalation) |

**Architectural consequence:** local-first is permitted **only behind a verify gate.** The
skill never lets an unverified cheap output cross a phase boundary into an authoring agent.
FrugalGPT reports 40–70% cost reduction at <2% quality loss *specifically when a verifier
gate sits in the cascade*; remove the gate and the savings invert into rework.

---

## 3. The escalation ladder

On a **failed** verify gate, escalate exactly ONE rung and re-execute:

```
T0 local-SLM ──▶ T1 local-mid ──▶ T1.5 cloud-OW ──▶ T2 Claude-mid ──▶ T3 Claude-frontier
 vibethinker     aroow-rust-coder   kimi-k2.7-code     sonnet-4-6        opus-4-8
 chinda-qwen3    mellum2 / gemma4   deepseek-v4-pro
```

- Never skip two rungs at once — each rung is a real price band, and skipping wastes the
  cheaper attempt's information.
- The break-even (§2) applies at **every** rung boundary, not just local→Claude: local-mid
  → cloud-OW, then cloud-OW → Claude. Escalate when the *expected error cost at this rung*
  exceeds the *price delta to the next rung*.
- A task that exhausts the ladder (fails even at T3) is a spec problem, not a routing
  problem — surface it to the human at ASSEMBLE; do not loop.

---

## 4. The verification gate (three stages, cheapest first)

The gate runs between every phase boundary (Verify→Author, Author→Review, Review→Assemble)
and after every per-task execution. It is the economic interlock. Apply stages in order and
stop at the first that gives an unambiguous verdict:

1. **Deterministic check (~$0)** — run the `verify_command`. Compile / test / schema-
   validate / `grep`-resolves. If it returns a clean pass/fail, that is the verdict. Most
   well-specified tasks stop here. `scripts/check_evidence.py` is the enforcer for
   findings: it confirms a finding's cited evidence command actually resolves to a real
   line before the finding is allowed to cross into the author phase.
2. **Cheap judge (T0 SLM, ~$0)** — only if the deterministic check is genuinely fuzzy
   (e.g. "is this summary faithful?"). Use `vibethinker:3b` or `claude-haiku-4-5` as a
   cheap LLM-judge. Its job is narrow: confirm the output meets the AC, not to redo the
   work.
3. **Frontier judge (T3, full price)** — only if the cheap judge is still ambiguous AND the
   blast radius is high (the output feeds an Opus author). Use `claude-opus-4-8` as the
   adversarial gate. This is the most expensive verdict — reserve it for the Review-gate
   and for high-propagation findings.

**Gate rule:** every finding that crosses a phase boundary must carry a **re-runnable
evidence command**. A T0 SLM or `scripts/check_evidence.py` confirms the citation resolves
*before* any finding crosses into the author phase. A finding without resolving evidence is
rejected at the gate, not passed downstream.

---

## 5. Worked routing examples

### Example A — the prior verify → author → review workflow, re-routed

The reference run was 10 agents (7 Sonnet verifiers + 2 Opus authors + 1 Opus reviewer),
594,143 tokens, ~10 min. Re-route it under this policy:

| Phase | Original | Re-routed | Why |
|---|---|---|---|
| **Verify** (7 parallel) | 7× Sonnet (T2) | **7× T1 local-mid** (`aroow-rust-coder:9b` / `mellum2:12b-a2.5b`) | Verification is cheap-eligible: each verifier returns a structured **finding + evidence command** (a `grep`/line-cite) — exactly the deterministic check §1 requires. |
| **Verify-gate** | (implicit) | `scripts/check_evidence.py` per finding; T0 SLM on fuzzy ones | No finding crosses to the author phase until its evidence command resolves. This gate is what makes the local move safe. |
| **Author** (2 parallel) | 2× Opus (T3) | **2× T3 Opus** (unchanged) | Authoring an RCA + swarm plan is hard reasoning with high blast radius — never fed unverified cheap output, never routed cheap. |
| **Review** (1) | 1× Opus (T3) | **1× T3 Opus** (unchanged) | Adversarial gate; the most expensive, highest-stakes verdict. |
| **Assemble** | human | human (unchanged) | Human-in-the-loop; assemble + final review vs the epic DoD. |

**Cost (Claude rates per `references/model-tiers.md`; ~85% in / 15% out read-heavy
profile):**
- (A) Claude-only baseline: Verify ≈ $1.70 + Author/Review ≈ $1.91 = **~$3.61**
- (C) local-first hybrid: Verify ≈ **$0** (metered via Ollama eval counts) + Author/Review
  ≈ $1.91 = **~$1.91 → ~47% cheaper.**

**The savings AND the trap in one frame:** the hybrid wins *only because* verification is
cheap-eligible and gated. The failure mode is concrete: a T1 verifier that **hallucinates a
finding** feeds a false premise into a T3 Opus author ($5/$25 per M), which authors an RCA
on a false foundation; the adversarial reviewer catches it and the **entire author phase
reruns** — net *worse* than Claude-only. The per-finding evidence command + the Verify-gate
are what turn the 47% from a trap into a real saving.

### Example B — a single Rust implementation task

```yaml
- task: "Verify edge retraction hides from neighbors but survives time-travel"
  requirement_ref: R-4.2
  acceptance:
    verify_command: "cargo test --test temporal_queries_tests -- retract_visible_as_of"
  tier_hint: T1-local
```
- Has a `verify_command` ⟹ cheap-eligible. Domain = Rust ⟹ `aroow-rust-coder:9b` (T1).
- Compose `tdd-workflow`: RED = the `verify_command` (write/confirm the failing test) →
  GREEN @ `aroow-rust-coder:9b` → REFACTOR with the test still green.
- Gate = stage 1 deterministic (`cargo test`). Pass ⟹ ACCEPT. Fail ⟹ escalate to
  `kimi-k2.7-code:cloud` (T1.5), re-run; still fail ⟹ `claude-sonnet-4-6` (T2).

### Example C — a doc-summarization task (no downstream agent)

A "summarize the audit log" task with AC "summary mentions all 5 findings" (a `grep` for
each finding id). Self-contained, no propagation ⟹ `c_frontier_fix ≈ c_frontier_direct` ⟹
threshold ≈ 1 ⟹ **route local** (`clarityqwen2-summarizer` or `mellum2:12b-a2.5b`), gate
with the deterministic `grep`. Local-first almost always wins here.

---

## 6. When NOT to go local (escalate by default)

Do not route cheap — start at T2+ — when **any** of these holds:

1. **No cheap verifier.** The task has no `verify_command` (or only a subjective "looks
   good" AC). You cannot grade it cheaply, so you cannot safely route it cheap (§1).
2. **Low `p(correct_cheap)`.** The task is in a domain the local model is weak at (complex
   Rust borrow/lifetime semantics, WAL/consensus invariants, security-sensitive logic). A
   high `p_fail` blows the break-even (§2) even with a cheap verifier.
3. **High rework blast-radius.** The output feeds downstream agents *before* it can be
   verified, so `c_frontier_fix ≫ c_frontier_direct` and the threshold on `p_fail` is tiny.
   Either escalate, or insert a verify gate between the producer and its consumer — never
   let unverified cheap output cross the boundary.
4. **Adversarial / final review.** The Review-gate and the final-review-vs-epic-DoD are
   high-stakes verdicts; run them at T3 (`claude-opus-4-8`) regardless of cost.
5. **Engine-correctness embedding queries.** Any query against the GenesisBlockDB vector
   store MUST use the engine-matched embedder `bge-m3` — this is a *role* constraint
   (Axis 2), not a tier choice. A cheaper non-engine embedder is not an "escalation
   savings," it is a correctness bug (wrong metric space, broken recall).

> Rule of thumb: **local-first is an optimization conditional on cheap, reliable
> verifiability.** Where verifiability is absent or the blast radius is large, the cheapest
> correct path is to do it at the right tier the first time.
