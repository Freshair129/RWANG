---
name: tiered-swarm
description: "Orchestrate a multi-step build/audit/refine task across local Ollama models + Claude under a token budget. Use when a job decomposes into many sub-tasks (verify, author, review), some cheap-and-machine-checkable and some hard, and you want to route each to the cheapest tier that can pass its acceptance check on local GPU hardware (e.g. an RTX 3060 12GB) before escalating to Claude. Spec-driven (composes spec-driven-development), TDD per task (composes tdd-workflow), cost-metered on every tier including local."
---

# tiered-swarm

Spec-driven, local-first, cost-tiered multi-model orchestration. Routes each unit of
work to the cheapest model tier that can pass a **machine-checkable acceptance command**,
escalating up the ladder (local SLM → local mid → cloud open-weights → Claude) only when
a cheap tier fails its gate. The proven shape is **VERIFY → AUTHOR → REVIEW → ASSEMBLE**;
this skill adds tier routing + a verify gate + a two-way cost ledger on top of it.

## When to trigger

Use this skill when ALL of the following hold:
- The task decomposes into multiple sub-tasks (an audit, a multi-file build, a refactor,
  a verify→author→review sweep).
- You have local Ollama models available and want to spend Claude tokens only where they
  earn their price.
- Each cheap-routed sub-task can be graded by a deterministic command (a test, a compile,
  a schema-validate, a `grep` that must resolve). Sub-tasks that cannot be graded cheaply
  are NOT cheap-eligible — they escalate by default.

If the job is a single atomic task with no cheap-checkable sub-units, do not use this
skill — just do it directly at the right tier.

## The core loop

```
SPEC ──▶ ROUTE ──▶ EXECUTE(tier) ──▶ VERIFY(cheap gate) ──▶ ESCALATE-or-ACCEPT ──▶ ASSEMBLE ──▶ FINAL-REVIEW
```

1. **SPEC** — Compose `spec-driven-development` to produce EARS requirements → design →
   a sequenced Phase-3 task list. Extend each task entry with two fields this skill adds:
   `acceptance.verify_command` (the machine-checkable AC) and `tier_hint` (router's
   starting rung). A task with NO `verify_command` is not cheap-eligible (see hard rule).
2. **ROUTE** — Run `scripts/route.py` over the task list. It computes a deterministic
   `tier_hint` per task from signals (file type, token estimate, domain, presence of a
   `verify_command`). The router is a ROLE (rules-first, zero-VRAM), never a tier you
   send work to. Read `references/routing-policy.md` for the decision rules.
3. **EXECUTE(tier)** — Dispatch the task to the hinted tier via Claude Code's built-in
   sub-agent (Task) mechanism for Claude tiers, or via the Ollama HTTP API for local /
   cloud-open-weight tiers. Per implementation task, compose `tdd-workflow`:
   RED (= the `verify_command`) → GREEN (@ routed tier) → REFACTOR.
4. **VERIFY (cheap gate)** — Run the `verify_command`. Tiered judge: deterministic check
   first (compile/test/grep, ~$0), then a T0-SLM cheap judge if the check is fuzzy, then a
   Claude judge only if still ambiguous. This gate is the economic interlock — no
   unverified cheap output may cross a phase boundary into an authoring agent.
5. **ESCALATE-or-ACCEPT** — If the gate passes, ACCEPT. If it fails, ESCALATE one rung
   (T0→T1→T1.5→T2→T3) and re-execute. Each finding that crosses a phase boundary must
   carry a re-runnable evidence command; `scripts/check_evidence.py` confirms it resolves.
6. **ASSEMBLE** — Human-in-the-loop: the human orchestrator assembles the files /
   findings. No external write action happens without human approval.
7. **FINAL-REVIEW** — Check the assembled result against the epic-level DoD (the EARS SSOT
   from `spec-driven-development`). Emit the cost ledger via `scripts/cost_ledger.py`.

## Compact routing table

Task class → starting tier → concrete model. The router escalates on a failed gate.

| Task class | Start tier | Concrete model (ollama tag / id) |
|---|---|---|
| classify / triage / cheap verify | T0 local-SLM | `vibethinker:3b`, `chinda-qwen3:4b` |
| bulk code / structured output / verify findings | T1 local-mid | `aroow-rust-coder:9b` (Rust), `mellum2:12b-a2.5b`, `gemma4-coder:12b` |
| near-frontier code (local slot busy) | T1.5 cloud-OW | `kimi-k2.7-code:cloud`, `deepseek-v4-pro:cloud`, `qwen3-coder-next:cloud` |
| quality authoring / general | T2 Claude-mid | `claude-sonnet-4-6` |
| hard reasoning / adversarial review gate | T3 Claude-frontier | `claude-opus-4-8` |
| embed (engine-matched, MANDATORY) | role: embed | `bge-m3:latest` / `bge-m3:q8` |
| rerank (completes recall pipeline) | role: rerank | `bge-reranker-v2-m3` |
| code-domain retrieval (separate index) | role: embed-code | `jina-code-embeddings:1.5b` |
| multimodal retrieval (separate collection) | role: embed-mm | `qwen3-vl-embedding:2b` |
| image→text caption | role: VLM | `polaris-vga:0.8b` |
| summarize | role: summarizer | `clarityqwen2-summarizer` |
| TTS (load on call, unload after) | role: TTS | `orpheus:3b` / `omnivoice` |

Capability tiers (T0..T3) are ONE axis (escalation ladder). Role specialists (embed /
rerank / VLM / summarizer / TTS / router) are an ORTHOGONAL axis selected by task TYPE,
not by difficulty — an embedder is sideways from Opus, not below it. Never put them on one
list. Full model map + VRAM budgets in `references/model-tiers.md`.

## HARD RULE — cheap-eligibility

> **Every cheap-tier task MUST carry a machine-checkable acceptance command
> (`verify_command`). If it does not, it is NOT cheap-eligible — escalate it to T2+.**

A local model is ~$0/token but NOT ~$0/error. A wrong cheap output costs the verify pass
that catches it **plus** the frontier pass that redoes it **plus** the cost of every
downstream agent that consumed the bad output. You cannot safely route work to a tier you
cannot cheaply grade. No machine-checkable AC at the unit being routed ⟹ no cheap routing.
This is why the verify gate (step 4) is mandatory, not optional: it is what turns the
~47% local-first savings into something real instead of a rework trap.

Corollary invariants (non-negotiable):
- **No unverified cheap output crosses a phase boundary.** Local-first is permitted ONLY
  behind a verify gate.
- **Cost is two-way** (token count × per-type price), metered on EVERY tier including
  local. "Saved tokens" is only claimable if you metered the local side (log Ollama
  `prompt_eval_count` / `eval_count` at rate 0).
- **Human-in-the-loop at ASSEMBLE and before any external write action.**

## Acceptance levels

Exactly three nested levels — a checkpoint exists iff a model is routed across it OR a
human signs off at it:
1. **1 epic DoD** — the EARS SSOT from `spec-driven-development`; human-owned; checked at
   FINAL-REVIEW.
2. **~4 phase-gate ACs** — one machine-checkable gate per spine boundary (Verify-gate,
   Author-gate, Review-gate, Assemble-gate); the routing interlock.
3. **N per-task ACs** — one `verify_command` per task; the smallest routable unit and the
   RED test for `tdd-workflow`.

Do NOT add sprint-level or per-agent DoDs — they add gates with no routing decision behind
them.

## References (progressive disclosure — load on demand)

- `references/DESIGN-RATIONALE.md` — the architecture brief / SSOT this skill implements
  (the five design questions in present-rebut-recommend form, worked cost examples).
- `references/model-tiers.md` — full 2-axis taxonomy: capability tiers T0..T3 + cloud-OW ×
  role specialists, every concrete model with resident VRAM at quant, 12GB co-residency
  budget + 8GB fallback. Read before choosing a model.
- `references/routing-policy.md` — the decision rules: cheap-eligibility test, FrugalGPT
  break-even inequality, escalation ladder, the three-stage verify gate, worked routing
  examples, and when NOT to go local. Read before routing.

## Tools (deterministic — scripts/)

- `scripts/route.py` — reads the extended task list, emits a `tier_hint` per task from
  deterministic signals. Does NOT call any model (router is rules-first, zero-VRAM).
- `scripts/check_evidence.py` — confirms a finding's evidence command resolves before it
  crosses into the author phase (the Verify-gate enforcer).
- `scripts/cost_ledger.py` — the two-way cost formula over the four per-call counters
  (`in_uncached`, `in_cached`, `cache_write`, `out`) × per-type rate vector per model;
  local rate = 0 but metered. Re-verify Claude rates before any billing.

> NOTE: scripts in `scripts/` must NOT embed LLM API calls (`openai`, `anthropic`,
> `langchain`, etc.). Model invocation is the Agent/Task mechanism (for Claude) or the
> Ollama HTTP API (for local/cloud-OW). Scripts only compute deterministic hints, checks,
> and ledgers.

## Compose notes (do NOT merge these — call them)

- **`spec-driven-development`** — invoke FIRST to produce the spec spine (EARS reqs →
  design → Phase-3 task list). This skill owns only the outer routing + verify gate + cost
  ledger; it does not rewrite the spec layer. Optionally invoke
  `technical-design-doc-creator` first if the change needs stakeholder/compliance sign-off
  (off the default path).
- **`tdd-workflow`** — invoke as the per-task inner loop. The per-task `verify_command`
  IS the RED test; GREEN runs at the routed tier; REFACTOR keeps it green. The per-task AC
  and the TDD loop are the same artifact seen from two skills.
- **`claude-api`** — reference for current Claude model ids, per-type pricing, and prompt-
  caching mechanics. RE-VERIFY all Claude rates against
  `https://platform.claude.com/docs/en/pricing.md` before any billing logic ships (the
  cached figures carry a 2026-06-04 UNCERTAINTY FLAG).
- **`token`** — unrelated financial API glue; NOT part of this workflow. Mentioned only to
  disambiguate: this skill's "token" means LLM tokens, not the Token.io product.
