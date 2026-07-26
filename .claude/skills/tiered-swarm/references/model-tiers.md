# Model Tiers — the 2-axis taxonomy

> **SSOT:** `references/DESIGN-RATIONALE.md` (Q1). This file is the lookup table the router
> and the operator consult to pick a concrete model.
>
> **Provenance / uncertainty:** Claude prices are from the `claude-api` skill cache dated
> **2026-06-04** — they carry an UNCERTAINTY FLAG and **must be re-verified against
> `https://platform.claude.com/docs/en/pricing.md` before any billing logic ships.** Local
> (Ollama) VRAM figures are GGUF Q4_K_M estimates unless a quant is named (KV cache adds
> ~0.5–1 GB at 4K ctx). Cloud-open-weight prices are order-of-magnitude estimates.

There are **two orthogonal axes**. A task first picks a **role** (Axis 2); only
text-generation roles then pick a **tier** (Axis 1). The router is a role, never a tier.

---

## Axis 1 — Capability tiers (the escalation ladder, cheap → expensive)

These rungs describe **text-generation reasoning power at a price** and nothing else. The
router starts a task at its `tier_hint` and escalates ONE rung on a failed verify gate:
`T0 → T1 → T1.5 → T2 → T3`.

| Tier | Role on the ladder | Concrete model (ollama tag / Claude id) | Resident VRAM @ quant | Marginal cost |
|---|---|---|---|---|
| **T0** local-SLM | fast classify / triage / cheap verify | `vibethinker:3b` | ~2.0 GB (Q4) | ~$0 |
| | | `chinda-qwen3:4b` | ~2.6 GB (Q4) | ~$0 |
| **T1** local-mid | bulk reasoning, code, structured output | `aroow-rust-coder:9b` (Q4_K_S, Rust domain) | ~5.6 GB | ~$0 |
| | | `mellum2:12b-a2.5b` (MoE, ~2.5B active, Claude-distilled) | ~8.3 GB | ~$0 |
| | | `gemma4-coder:12b` (code-specialized Gemma-12B) | ~7.6 GB | ~$0 |
| | | `qwythos:9b` (quality instruct alt) | ~7.0 GB | ~$0 |
| | | `gemma4:latest` (best general quality; solo-fills GPU) | ~9.8 GB | ~$0 |
| **T1.5** cloud-open-weights | near-frontier code at 5–20× under Claude | `kimi-k2.7-code:cloud` | 0 GB (cloud) | ~$0.1–0.5 /M out |
| | | `deepseek-v4-pro:cloud` | 0 GB | ~$0.1–0.5 /M out |
| | | `qwen3-coder-next:cloud` | 0 GB | ~$0.1–0.5 /M out |
| | | `gemini-3-flash-preview:cloud` | 0 GB | ~$0.1–0.5 /M out |
| **T2** Claude-mid | quality general / authoring | `claude-sonnet-4-6` | n/a (API) | $3 in / $15 out per M |
| **T3** Claude-frontier | hard reasoning, adversarial review gate | `claude-opus-4-8` | n/a (API) | $5 in / $25 out per M |

> Local tier marginal cost is ~$0 (sunk VRAM + electricity) but **NOT $0/error** — a wrong
> cheap output costs the verify pass that catches it + the frontier pass that redoes it +
> downstream propagation. It is "off the billable axis," not free. **Meter it anyway:**
> Ollama returns `prompt_eval_count` (input) and `eval_count` (output) per response; log
> these into the cost ledger at rate 0 so the local/Claude split is auditable.

**`claude-haiku-4-5`** ($1 in / $5 out per M) sits below Sonnet on the Claude side — use it
as a cheap Claude judge in the verify gate when a deterministic check is too fuzzy but you
do not want a full Sonnet/Opus pass. It is a Claude-tier judge, not part of the local
ladder.

The cloud-open-weights band (T1.5) inserts a real fourth price tier between local and
Claude. The FrugalGPT break-even therefore applies **twice**: local-mid → cloud-OW
(escalate when local error cost > cloud price), then cloud-OW → Claude (escalate when cloud
error cost > the frontier price delta). For GenesisBlockDB Rust work the recommended
cascade is `aroow-rust-coder:9b` → `kimi-k2.7-code:cloud` → `claude-sonnet-4-6` →
`claude-opus-4-8`.

### Claude per-type rate vector (for the cost ledger — RE-VERIFY before billing)

All figures $/million tokens (cache write/read derived from input multipliers: write 5-min
= 1.25×, write 1-hr = 2.0×, read = 0.1×).

| Model | in | out | cacheWrite 5-min | cacheWrite 1-hr | cacheRead | min cacheable prefix |
|---|---|---|---|---|---|---|
| `claude-opus-4-8` | 5.00 | 25.00 | 6.25 | 10.00 | 0.50 | 4096 tok |
| `claude-sonnet-4-6` | 3.00 | 15.00 | 3.75 | 6.00 | 0.30 | 2048 tok |
| `claude-haiku-4-5` | 1.00 | 5.00 | 1.25 | 2.00 | 0.10 | 4096 tok |
| T0/T1 local | ~0 | ~0 | n/a | n/a | n/a | n/a |
| T1.5 cloud-OW | ~0.1–0.5 | ~0.1–0.5 | — | — | — | — |

`in_cached` **replaces** fresh input for the cached prefix — never double-count it as
`in_uncached`. Max 4 `cache_control` breakpoints per request; render order is
**tools → system → messages**; place the breakpoint after the shared block (the spec +
codebase context + verifier system prompt the parallel verifiers share). Keep the shared
prefix above the model's min cacheable size or caching silently no-ops.

---

## Axis 2 — Role specialists (orthogonal; selected by task TYPE, not difficulty)

These do not sit on the Axis-1 ladder — an embedder emits a float array, a reranker emits a
score, a VLM emits pixels-to-text. `bge-m3` is not "below" Opus, it is *sideways*. You
cannot "escalate" from an embedder to Sonnet. Select these by the role the task needs.

| Role | Model (ollama tag) | Resident VRAM @ quant | Note |
|---|---|---|---|
| **embed** | `bge-m3:latest` | ~1.3 GB | **Engine-matched — MANDATORY** for any query against the GenesisBlockDB vector store. This is the *same model the engine uses during `add_node` indexing* (the bge-m3 + sparse FTS5 BM25 RRF pipeline). Any other embedder lands queries in a different metric space and breaks recall. |
| **embed** (quant alt) | `bge-m3:q8` | ~0.7 GB | Semantically identical to the engine model; smaller. Safe substitute. |
| **embed-code** | `jina-code-embeddings:1.5b` | ~1.6 GB | Code-domain dense retrieval. **Separate index only** — never the engine default collection. |
| **embed-mm / VLM-retrieval** | `qwen3-vl-embedding:2b` | ~2.0 GB | Image+text embeddings. **Multimodal collection only** — never the engine default collection. |
| **embed** (lightweight) | `nomic-embed-text` | ~0.3 GB | Fastest swap-in for *non-engine* retrieval tasks only. Not engine-matched. |
| **rerank** | `bge-reranker-v2-m3` | ~0.7 GB | Cross-encoder; completes the `bge-m3 → rerank` recall pipeline the engine's BQ+rerank path uses. |
| **VLM / captioner** | `polaris-vga:0.8b` | ~0.9 GB | Lightweight image→text classify/caption. |
| **summarizer** | `clarityqwen2-summarizer` | ~4–5 GB | Specialized summarization; hot-swap with `mellum2:12b-a2.5b` if the slot is needed. |
| **commit message** | `git-commit-message` | ~1–2 GB | Single-purpose; load on demand, unload immediately. |
| **TTS** | `orpheus:3b` / `omnivoice` | ~1.5–3 GB | Audio surface, no text generation. Load only during a TTS call, unload after. |
| **router** | rules-first → `vibethinker:3b` classifier on ambiguity | 0 GB → ~2.0 GB | **A ROLE, not a tier** — see below. |

### Why router/orchestrator is a role, not a tier

The router *observes* a task and *picks* an Axis-1 rung or an Axis-2 specialist; it never
receives delegated work itself. Listing it as a tier is a category error (you cannot
"escalate" hard reasoning *to the router*). Encode it cheapest-possible-first:
1. **Rules-based** thresholds at **zero VRAM** — token count, file type, domain, presence
   of a `verify_command`. This is `scripts/route.py`.
2. **Only on ambiguity**, escalate to a **T0 classifier SLM** (`vibethinker:3b`).

The human orchestrator is the top of this control plane; the skill automates the rule layer
beneath them. In skill terms the actual model invocation is Claude Code's built-in
sub-agent (Task) dispatch for Claude tiers, or the Ollama HTTP API for local/cloud-OW
tiers — `scripts/route.py` only computes a deterministic *tier hint*, it never calls a
model.

---

## RTX 3060 12GB — co-residency budget

Resident estimates are GGUF Q4_K_M at the listed size; KV cache adds ~0.5–1 GB at 4K ctx.
The aim is to keep one mid coder + the engine-matched embed/rerank stack co-resident so dev
queries hit the same metric space as the index.

**Slot A — recommended always-on for GenesisBlockDB dev (coder + engine embed/rerank):**
```
aroow-rust-coder:9b (5.6) + bge-m3:latest (1.3) + bge-reranker-v2-m3 (0.7) + nomic-embed-text (0.3) = 7.9 GB  ✓
```
Rust-domain coder + the exact embedder the engine uses + the reranker that matches the
BQ+rerank recall path. Leaves ~4 GB of KV/headroom.

**Slot B — MoE fast + engine embed (tight):**
```
mellum2:12b-a2.5b (8.3) + bge-m3:latest (1.3) + bge-reranker-v2-m3 (0.7) = 10.3 GB  ✓  (no KV slack)
```

**Slot C — quality instruct + embed + local router:**
```
qwythos:9b (7.0) + bge-m3:latest (1.3) + bge-reranker-v2-m3 (0.7) + vibethinker:3b (2.0) = 11.0 GB  ✓
```

**Must hot-swap (cannot co-reside with any mid model + the embed/rerank stack):**
- `gemma4:latest` (9.8 GB) leaves only ~2.2 GB — blocks the reranker+embedder stack.
- `gemma4-coder:12b` (7.6 GB) can co-reside with embed+rerank but not a second mid model.

## 8GB GPU fallback

Drop the mid models entirely. Run the SLM slot co-resident with the full embed+rerank
stack, and escalate all mid/frontier work to the cloud-OW (T1.5) and Claude tiers:
```
vibethinker:3b (2.0) + chinda-qwen3:4b (2.6) + bge-m3:latest (1.3) + bge-reranker-v2-m3 (0.7) ≈ 6.6 GB  ✓
```
`aroow-rust-coder:9b` (5.6 GB) still fits if the embed stack is reduced to `nomic-embed-text`
only (0.3 GB) — but for engine-targeted queries keep `bge-m3` resident even at the cost of
swapping the coder out to cloud, because a non-engine embedder breaks recall.

---

## Selection cheat-sheet

1. **What output type does the task need?** float array → embed (engine query ⟹ `bge-m3`,
   mandatory); score → rerank; image→text → VLM; audio → TTS; prose/code → continue to 2.
2. **For prose/code, what's the cheapest tier that can pass the `verify_command`?** Start at
   the `tier_hint`; if no `verify_command`, it is not cheap-eligible → start at T2.
3. **Does the local model slot fit alongside the engine embed stack?** If not, route the
   coder to cloud-OW (T1.5) and keep `bge-m3` resident for any engine query.
4. **On a failed verify gate, escalate one rung** — never two. Re-run the gate.
