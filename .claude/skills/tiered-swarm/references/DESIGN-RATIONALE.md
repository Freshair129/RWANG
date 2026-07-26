# DESIGN RATIONALE — Multi-Model Orchestration Skill

> **Status:** Architecture brief. This is the SSOT the rest of the skill implements. It
> answers the five design questions in *present-rebut-recommend* form, then specifies the
> architecture the skill encodes.
>
> **Provenance of cost figures:** all Claude prices below are from the `claude-api` skill
> cache dated **2026-06-04**. They carry an UNCERTAINTY FLAG and **must be re-verified
> against `https://platform.claude.com/docs/en/pricing.md` before any billing logic
> ships.** Local/Ollama and cloud-open-weight prices are order-of-magnitude estimates.
>
> **What is being generalized:** a workflow that ran in the originating session — Verify
> (7 parallel code-grounded verifiers → structured finding+evidence) → Author (2 parallel:
> RCA doc + swarm plan) → Review (1 adversarial gate) → human assembles + final review.
> Telemetry: **10 agents, 594,143 tokens, 88 tool calls, ~10 min wall-clock.** That
> `verify → author → review → assemble` shape is the reusable spine; this document adds
> **model-tier routing + local-first + spec-driven + cost-awareness** to it.

---

## Q1 — MODEL TAXONOMY

### Naive answer
"Make six or seven tiers: Frontier, Large/Mid, SLM, plus VLM, embedder, orchestrator,
router, text-to-image, image-to-text — one flat list the skill picks from."

### Rebuttal
That flat list **conflates two independent dimensions and miscategorizes the router.** A
capability tier answers *"how much text-generation reasoning power, at what cost?"* — it is
text-generation power only and says nothing about what the model *does*. A role specialist
answers *"what structured sub-task does this model solve?"* — an embedder emits a float
array, a reranker emits a score, a diffusion model emits pixels and **generates no text at
all.** These do not sit on the same ladder: `bge-m3` is not "below" Opus, it is *sideways* —
a different output type entirely. Putting them in one list forces a false ordering and makes
the router's selection logic incoherent (you cannot "escalate" from an embedder to Sonnet).

Worse, the naive list treats **router/orchestrator as a peer model**. The router is the
*control plane that does the selecting* — a **role**, not a capability tier. It may be
implemented with *zero* model (regex/token-count thresholds, zero VRAM), or with a tiny 3B
classifier — but it is never a tier you route *work* to; it is the thing that routes.
Listing it as a tier is a category error that would make the skill try to "assign hard
reasoning to the router."

### Recommendation — a 2-axis taxonomy

**Axis 1 — Capability tiers (the escalation ladder).** Five rungs, cheap→expensive, because
the cloud-open-weights insert a real fourth price band between local and Claude:

| Tier | Role | Concrete model (this inventory) | Marginal cost |
|---|---|---|---|
| **T0** local-SLM | fast classify / cheap verify | `vibethinker-3b` (~2.0 GB), `chinda-qwen3-4b` (~2.6 GB) | ~$0 |
| **T1** local-mid | bulk reasoning, code, structured output | `aroow-rust-coder-9b` (~5.6 GB), `mellum2-12b-a2.5b` (~8.3 GB, ~2.5B active), `gemma-4-12b-coder` (~7.6 GB) | ~$0 |
| **T1.5** cloud-open-weights | near-frontier code at 5–20× under Claude | `kimi-k2.7-code:cloud`, `deepseek-v4-pro:cloud`, `qwen3-coder-next:cloud` (0 local VRAM) | ~$0.1–0.5 /M out |
| **T2** Claude-mid | quality general / authoring | `claude-sonnet-4-6` | $3 in / $15 out |
| **T3** Claude-frontier | hard reasoning, adversarial review | `claude-opus-4-8` | $5 in / $25 out |

**Axis 2 — Role specialists (orthogonal; selected by *task type*, not by difficulty).** A
task first picks a *role*; only text-generation roles then pick a *tier*:

| Role | Model | Note |
|---|---|---|
| **embed** | `bge-m3:latest` (~1.3 GB) / `bge-m3 Q8` (~0.7 GB) | **Engine-matched — mandatory** for any query against the GenesisBlock vector store (other embedders break recall by living in a different metric space) |
| **embed-code** | `jina-code-embeddings-1.5b` (~1.6 GB) | code-domain retrieval, *separate* index only |
| **embed-mm / VLM-retrieval** | `qwen3-vl-embedding-2b` (~2.0 GB) | multimodal collection only — never the engine default collection |
| **rerank** | `bge-reranker-v2-m3` (~0.7 GB) | cross-encoder; completes the `bge-m3 → rerank` recall pipeline the engine uses |
| **VLM / captioner** | `polaris-vga-0.8b` (~0.9 GB) | image→text |
| **summarizer** | `clarityqwen2-summarizer` (~4–5 GB) | hot-swap with Mellum2 if the slot is needed |
| **TTS** | `omnivoice` / `orpheus-3b` | load only during a TTS call, unload after |
| **router** | rules-first → `vibethinker-3b` classifier escalation | **a ROLE, see below** |

**Why router/orchestrator is a role, not a tier.** The router *observes* a task and *picks*
an Axis-1 rung or an Axis-2 specialist; it never receives delegated work itself. Encode it
cheapest-possible-first: start with **rules-based** thresholds (token count, file-type,
presence of a `verify_command`) at **zero VRAM**; only when rules are ambiguous, escalate to
a **T0 classifier SLM**. The human orchestrator from the prior run is the top of this
control plane — the skill automates the rule layer beneath them. In skill terms ("Don't
Build Your Own Agent"), the router is realized through Claude Code's built-in **sub-agent
dispatch**, not an embedded LLM framework — `scripts/route.py` computes a *tier hint*
deterministically, but the actual model invocation is the Agent/Task mechanism.

---

## Q2 — SPEC-DRIVEN + LOCAL-FIRST ECONOMICS (the crux)

### Naive answer
"The 3060 is sunk cost — push *everything* possible onto local models, escalate to Claude
only what local literally cannot do. Maximize local share, minimize Claude tokens."

### Rebuttal
This optimizes the wrong variable. The cost that matters is not *Claude tokens spent* — it
is **total cost to a correct result**, and local work that is *wrong* is not free: it costs
the verify pass that catches it **plus** the frontier pass that redoes it **plus**, in the
worst case, the cost of every downstream agent that consumed the bad output before anyone
noticed. The binding constraint is the user's own warning: *"if not rigorous, the cost of
FIXING cheap/local output can exceed just doing it with Frontier/Mid directly."* A local mid
model is ~$0/token but **not** ~$0/error. The naive policy silently assumes
p(local correct) ≈ 1; in our actual swarm topology a wrong **verifier** feeds a wrong
**author**, so one cheap mistake propagates into expensive rework. Local-first is only an
optimization **conditional on cheap, reliable verifiability.**

### Recommendation — local-first **gated on machine-checkable verifiability**

A task is **cheap-eligible** iff it is verifiable by a deterministic or near-free check (a
named test, a compile, a schema-validate, a grep that pins evidence) — *not* merely "looks
doable by a small model." This is why the spec spine (Q6) and the smallest-unit AC (Q4) are
load-bearing: **without a machine-checkable AC at the unit being routed, you cannot safely
route it cheap, because you have no cheap way to know it's wrong.**

**Break-even inequality (FrugalGPT cascade).** Route a unit to the cheap tier iff its
expected total cost beats doing it directly on frontier:

```
E[cost_cheap] = c_cheap + p_fail · (c_verify + c_frontier_fix)   <   c_frontier_direct
```

where `p_fail = 1 − p(correct_cheap)`. With local `c_cheap ≈ 0` and a cheap deterministic
verifier `c_verify ≈ 0`, this collapses to the clean routing rule:

```
route cheap  ⟺  p_fail  <  c_frontier_direct / c_frontier_fix
```

The decisive term is the ratio **`c_frontier_fix / c_frontier_direct`** — how much *more* a
fix costs than just doing it right the first time, because a fix pays the frontier price
**anyway** *plus* the wasted cheap+verify work *plus* propagation.

- If the cheap output is **independently verifiable and self-contained** (a fix ≈ a fresh
  frontier attempt, no propagation), then `c_frontier_fix ≈ c_frontier_direct`, the
  threshold is ~1, and **local-first almost always wins** (the summarization case).
- If the cheap output **feeds downstream agents before verification** (our verifier→author
  chain), `c_frontier_fix ≫ c_frontier_direct` (the tight-CI case: even a 1% local error
  rate justifies escalation), the threshold is *tiny*, and you must either **escalate** or
  **insert a verify gate between the cheap producer and its consumer.**

**The architectural consequence:** local-first is permitted **only behind a verify gate.**
The skill never lets an unverified cheap output cross a phase boundary into an authoring
agent. This is precisely the prior workflow's shape — *verify before author* — re-read as an
economic safety interlock, not just a quality nicety. FrugalGPT reports 40–70% cost
reduction at <2% quality loss **specifically when a verifier gate sits in the cascade**;
remove the gate and the savings invert into rework.

---

## Q3 — TWO-WAY COST FORMULA

### Naive answer
"Sum the tokens; fewer tokens = cheaper."

### Rebuttal
Token **count** and token **price** are different axes. A 1,000-token Opus *output* costs
**5×** a 1,000-token Opus *input* ($25 vs $5 /M). A cached prefix read costs **0.1×** fresh
input; writing that cache costs **1.25×** (5-min) or **2.0×** (1-hr). Counting tokens without
typing them mis-ranks options: a verbose-but-cached-and-input-heavy call can be far cheaper
than a terse output-heavy one. You must compute cost **per token *type*, per tier.**

### Recommendation — the two-way formula

```
cost = Σ over tiers [  in_uncached · rate_in
                     + in_cached   · rate_cacheRead
                     + cache_write · rate_cacheWrite
                     + out         · rate_out         ]
```

- **Token COUNT** = the four counters per call: `in_uncached, in_cached, cache_write, out`.
- **Token PRICE** = the per-type rate vector per model:

| Model | in | out | cacheWrite 5-min (1.25×) | cacheWrite 1-hr (2.0×) | cacheRead (0.1×) |
|---|---|---|---|---|---|
| `claude-opus-4-8` | 5.00 | 25.00 | 6.25 | 10.00 | 0.50 |
| `claude-sonnet-4-6` | 3.00 | 15.00 | 3.75 | 6.00 | 0.30 |
| `claude-haiku-4-5` | 1.00 | 5.00 | 1.25 | 2.00 | 0.10 |
| **T0/T1 local** | ~0 | ~0 | n/a | n/a | n/a |
| **T1.5 cloud-OW** | ~0.1–0.5 | ~0.1–0.5 | — | — | — |

(all $/M tokens). `in_cached` **replaces** fresh input for the cached prefix — never
double-count it as `in_uncached`.

- **Local tier rate ≈ 0** (electricity + sunk VRAM only). It is not literally zero — it is
  *off the billable axis*. **Measure it anyway:** Ollama returns `prompt_eval_count` (input)
  and `eval_count` (output) per response; log these into the same four-counter schema with
  rate 0 so the cost ledger is complete and the local/Claude split is auditable. "Local
  saved tokens" is only a defensible claim if you metered the local side.

- **Caching levers:** the 7 verifiers share a large common prefix (the spec + the codebase
  context + the verifier system prompt). Render order **tools → system → messages** and
  place a `cache_control` breakpoint after the shared block. The first verifier pays
  `cache_write` (1.25×); the rest pay `cache_read` (0.1×) — net-positive on the first reuse.
  Max 4 breakpoints/request; Opus/Haiku min cacheable prefix 4096 tokens, Sonnet 2048 —
  keep the shared prefix above the floor or caching silently no-ops.

### Worked example — the 594k-token run, three ways

Telemetry: 10 agents (7 Sonnet verifiers + 2 Opus authors + 1 Opus reviewer), **594,143
total tokens, ~10 min.** No per-type split was captured, so assume a code-grounded
read-heavy profile: **~85% input / ~15% output**, i.e. ~505k in, ~89k out. Split by role:

- Verify (7× Sonnet): ~356k total → ~303k in, ~53k out
- Author+Review (3× Opus): ~238k total → ~202k in, ~36k out

**(A) Claude-only, no cache (the baseline that was effectively run):**
```
Verify (Sonnet) : 303k·$3/M  + 53k·$15/M  = $0.909 + $0.795 = $1.704
Author (Opus)   : 202k·$5/M  + 36k·$25/M  = $1.010 + $0.900 = $1.910
TOTAL ≈ $3.61
```

**(B) Claude-only, WITH shared-prefix caching on the 7 verifiers** (~150k shared prefix,
1 write + 6 reads): TOTAL ≈ $4.00 worst-cased / ~$2.9 if prefix overlap is high. *(Caching
helps only when the prefix genuinely repeats; with low overlap the 1.25× write tax can
exceed the read savings — measure, don't assume.)*

**(C) Local-first hybrid — move the 7 verifiers to T1 local-mid; authors + reviewer stay
Claude-frontier:**
```
Verify (aroow-rust-coder-9b / mellum2, local) : ~$0   (metered via Ollama eval counts)
Author+Review (Opus, unchanged)               : $1.910
TOTAL ≈ $1.91   →  ~47% cheaper than (A)
```

**The savings (≈47%, $3.61 → $1.91) AND the risk in one frame.** The hybrid wins *only
because verification is the cheap-eligible, machine-checkable role* — each verifier returns
a structured **finding + evidence** (a grep/line-cite), exactly the deterministic check Q2
requires. But the failure mode is concrete and expensive: a **T1 verifier that hallucinates
a finding** feeds a wrong premise into a **T3 Opus author**, which spends full frontier
price authoring on a false foundation — then the reviewer catches it and the *entire author
phase reruns*. One bad local verifier can erase the $1.70 of "saved" verify cost **and** add
a ~$1.9 author redo: net *worse* than Claude-only. This is why the **verify gate (Q2) and
the per-finding executable AC (Q4) are mandatory.** Mitigation: route the verifier tier
cheap, but require each finding to carry a **re-runnable evidence command**; a T0 SLM (or a
cheap deterministic `scripts/check_evidence.py`) confirms the citation resolves before any
finding crosses into the author phase.

---

## Q4 — DoD GRANULARITY

### Naive answer
"One Definition-of-Done / acceptance-criteria block at the top of the spec. Everyone reads
it; done means done."

### Rebuttal
A single epic-level DoD is **unroutable** for a multi-model swarm. The router assigns *tiers
to units of work* (Q1); the break-even (Q2) says a unit is cheap-eligible **only if it has a
machine-checkable AC at that unit's granularity.** A monolithic DoD lives at the *feature*
level — but the cheap tiers operate at the *task/finding* level, and there is no way to
mechanically decide "did this T1 verifier succeed?" from a prose paragraph describing the
whole feature. **You cannot safely route a model to work you cannot cheaply grade.** A single
DoD also gives no *phase gate*: the prior run's safety came from verify finishing-and-passing
*before* author started — that boundary needs its own checkable criterion, or a half-baked
verify silently leaks into author.

### Recommendation — **multi-level acceptance criteria** (three nested tiers)

1. **Epic / spec-level DoD — the SSOT.** One block, human-owned, EARS-format (from
   `spec-driven-development`). Defines "the whole change is done." This is the contract the
   final human review checks. **Count: 1.**

2. **Per-phase gate AC — the routing interlock.** One checkable gate at each phase boundary
   of the spine: `Verify-gate`, `Author-gate`, `Review-gate`, `Assemble-gate`. Each states
   the machine-checkable condition for the phase's output to be allowed to cross into the
   next phase. This is the economic safety interlock from Q2. **Count: one per phase = ~4.**

3. **Per-task / per-finding AC — executable, the smallest routable unit.** Each task in the
   spec's task list carries a **named test or command** that returns pass/fail —
   `cargo test --test X -- name`, a `grep` that must resolve, a schema-validate. This is the
   unit the router grades to decide cheap-vs-escalate, and the unit `tdd-workflow` (Q5) turns
   RED→GREEN. **Count: one per task.**

**Why this shape and not more checkpoints:** phase gates align to the *existing* spine (no
new ceremony), and per-task AC align to the *existing* spec task list — so the granularity
is "free," riding structure the workflow already has. Do **not** add sprint-level or
per-agent DoDs: that adds gates with no routing decision behind them. **Rule of thumb: a
checkpoint exists iff a model is routed across it or a human signs off at it.** That yields
exactly: 1 epic DoD + 4 phase gates + N executable task ACs.

---

## Q5 — TDD: BUNDLE OR COMPOSE

### Naive answer
"Bake RED-GREEN-REFACTOR into the orchestration skill so it's all one self-contained flow."

### Rebuttal
Merging duplicates an asset that already exists and violates single-responsibility. The user
**already has a `tdd-workflow` skill** at `C:/Users/freshair/.claude/skills/tdd-workflow`
(confirmed) with a well-defined shape — RED-GREEN-REFACTOR, test categories, AAA,
anti-patterns. Inlining it would (a) duplicate content, making the TDD protocol harder to
maintain independently; (b) bloat the orchestration SKILL.md past the single-workflow
guardrail ("One skill = one workflow"); and (c) couple the inner loop's lifecycle to the
orchestrator's, so a fix to TDD discipline needs an orchestrator release.

### Recommendation — **COMPOSE** `tdd-workflow` as the per-task inner loop

The orchestration skill **delegates**: for each task in the spec's task list, it invokes the
existing `tdd-workflow` RED-GREEN-REFACTOR cycle. The mapping is exact and is *why* compose
is clean: **the per-task executable AC from Q4 *is* the RED test.** RED = write the failing
test that encodes the task AC; GREEN = the routed model (cheapest tier that can pass it)
makes it pass; REFACTOR = cleanup with the test still green. The per-task AC and the TDD loop
are the same artifact viewed from two skills — so they compose without seam.

**Where it slots in the spine:**
```
spec-driven-development  →  [task list with tier-hint + verify-command]
        │
        ▼  (router assigns a tier per task)
  for each task:  tdd-workflow{ RED = task AC test ; GREEN @ routed tier ; REFACTOR }
        │
        ▼
  Verify (parallel, cheap-eligible) → Author (frontier) → Review (frontier) → Assemble (human)
```
TDD is the **inner loop inside the implementation tasks**; the verify→author→review spine is
the **outer loop**. The orchestration skill owns the outer loop and the routing;
`tdd-workflow` owns the inner loop; `spec-driven-development` owns the spine's head. Three
skills, three responsibilities, composed in sequence.

---

## Q6 — SPEC-DRIVEN SPINE (the SSOT the router reads)

### Recommendation — **reuse `spec-driven-development`**, extend its task schema with two routing fields

The spec is the **single source of truth the router reads to assign tiers** — routing is not
a side-channel heuristic, it is *derived from the spec.* Reuse the existing
`spec-driven-development` skill (confirmed present). Its three phases — Requirements (EARS
AC) → Design → Tasks — produce the task list that becomes the router's work queue.

**Extend each task entry with two fields** (the only new schema this skill introduces):

```yaml
- task: "Verify edge retraction hides from neighbors but survives time-travel"
  requirement_ref: R-4.2          # traceability (existing)
  acceptance:                      # the Q4 per-task executable AC = the RED test
    verify_command: "cargo test --test temporal_queries_tests -- retract_visible_as_of"
  tier_hint: T1-local              # router's starting rung; router may escalate on fail
```

- **`verify_command`** — the machine-checkable AC (Q4) and the RED test (Q5). Its *existence*
  is what makes the task cheap-eligible (Q2): no command → not routable to a cheap tier →
  defaults to T2+. This single field is the keystone tying Q2/Q4/Q5/Q6 together.
- **`tier_hint`** — the router's *starting* rung, derived deterministically by
  `scripts/route.py` from task signals (file type, token estimate, presence of
  `verify_command`, domain = Rust → `aroow-rust-coder`). It is a hint, not a verdict: on a
  failed gate the router **escalates** one rung (T0→T1→T1.5→T2→T3) per the FrugalGPT cascade.
  The heavier stakeholder doc (`technical-design-doc-creator`) is invoked *only* when a
  change needs compliance/stakeholder sign-off — complementary, not on the default path.

---

## ARCHITECTURE THE SKILL ENCODES (summary)

```
spec-driven-development            ── SSOT: EARS reqs → design → task list
   │   (+ per-task verify_command + tier_hint)
   ▼
scripts/route.py (router = ROLE, rules-first, T0-SLM on ambiguity, 0-VRAM default)
   │   reads spec → assigns Axis-1 tier per task; embed/rerank/VLM by Axis-2 role
   ▼
OUTER LOOP (the proven spine):
   Verify  → N parallel, cheap-eligible (T1 local / T0 SLM), each returns finding+EVIDENCE
            └─ [Verify-gate AC: every finding's evidence command resolves]  ← economic interlock (Q2)
   Author  → parallel @ T3 Opus (e.g. RCA doc + swarm plan)   ← never fed unverified cheap output
   Review  → @ T3 Opus, adversarial gate
   Assemble→ human orchestrator: assemble files + final review vs epic DoD  ← human-in-loop

INNER LOOP (per implementation task): compose tdd-workflow  RED(=verify_command) → GREEN(@routed tier) → REFACTOR

COST LEDGER (every call, every tier):
   cost = Σ_tier [ in_uncached·rate_in + in_cached·rate_cacheRead + cache_write·rate_cacheWrite + out·rate_out ]
   - Claude rates RE-VERIFY before billing; local rate=0 but METERED via Ollama prompt_eval_count/eval_count
   - shared-prefix cache_control on the verifiers (render: tools→system→messages; breakpoint after shared spec block)

ACCEPTANCE (multi-level, Q4):  1 epic DoD (SSOT)  +  4 phase-gate AC  +  N executable per-task AC
```

**Design invariants (non-negotiable):**
1. **Capability tiers ⟂ role specialists.** Two axes, never one list. Router is a role,
   never a tier.
2. **No unverified cheap output crosses a phase boundary.** Local-first is allowed *only
   behind a verify gate* — that gate is what makes the ~47% savings real instead of a rework
   trap.
3. **A unit is cheap-routable iff it has a `verify_command`.** No machine-checkable AC → no
   cheap routing → escalate by default.
4. **Cost is two-way (count × per-type price), measured on every tier including local.**
   "Saved tokens" is only claimable if metered.
5. **Compose, don't merge.** Reuse `spec-driven-development` (head) and `tdd-workflow` (inner
   loop); the orchestration skill owns only the outer spine + routing + cost ledger. Keep
   SKILL.md thin, push detail to `references/`, deterministic routing/cost/evidence checks to
   `scripts/`.
6. **Human-in-the-loop at Assemble and before any external write action.**

---

> Both composed skills confirmed present on disk:
> `C:/Users/freshair/.claude/skills/spec-driven-development` and
> `C:/Users/freshair/.claude/skills/tdd-workflow`. The Claude pricing figures carry the
> 2026-06-04 cache UNCERTAINTY FLAG and must be re-verified at
> `https://platform.claude.com/docs/en/pricing.md` before any billing logic ships.
