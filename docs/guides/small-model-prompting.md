# Small-Model (SLM / local Ollama) Prompting & Routing Guide

> Canonical playbook for dispatching work to local Ollama models on this box (RTX 3060
> 12GB). Consolidated from the proven configs/benchmarks in **G-Maiden**
> (`G:/G-Maiden`) and **GoVibe** (`D:/GoVibe`, `G:/govibe`), which share this engine's
> lineage. CLAUDE.md carries the short must-know rules and points here for the detail.
>
> **Why this exists:** a local 4B model dispatched on a non-micro task with missing
> context will loop on the same failed tool call until `toolsMaxIter` and produce nothing
> (observed: `config--cost-cap-tiers` → `qwen3.5:4b` burned 20 tool iterations, $0, no
> answer). Everything below prevents that.

---

## 1. Model benchmark — which local model for which job

Rust-coding benchmark (R1–R4, `num_ctx 8192`, `num_predict 2500`, `temperature 0.2`;
identical results in G-Maiden `MODEL-BENCHMARK.md` and GoVibe
`engine/orchestration/MODEL-BENCHMARK.md`):

| Model | tag | score | speed | verdict |
|---|---|---|---|---|
| **Aroow-9B** | `ollama:hf.co/sillykiwi/Aroow-Rust-Coder-9B-Q4_K_S-GGUF:Q4_K_S` | **4/4** | warm **2s**, R4 3469 tok no bug | **coder PRIMARY** |
| **Gemma-12B** | `ollama:hf.co/unsloth/gemma-4-12b-it-GGUF:UD-Q4_K_XL` | 4/4 | slow (R3 64s, R4 156s) | **architect / design-review fallback** |
| Gemma-Rust-4B | `ollama:gemma4-rust-coder:latest` | 3.5/4 | fast (R4 64s) but redeclares struct | coder secondary |
| Sushirl-9B | `ollama:sushirl:latest` | 2.5/4 | cold 74s+, R4 sort bug | ❌ not recommended |

**Rule:** **never route implementation/code to `qwen3.5:4b`** — it is the *worker/scout*
tier (light text only). For Rust coding use **Aroow-9B**; for design/quality/review use
**Gemma-12B** (or escalate to Claude).

### Context-tier → model map (`agent-registry.yaml`)

| tier | model | context ceiling |
|---|---|---|
| tiny | `llama3.2:1b` | < 32k |
| default | `qwen3.5:4b` | < 24k |
| **pro** | `gemma4:9b` | < 16k |
| retry | `gemma4:e2b` | < 12k |

Bigger model ⇒ smaller usable context on a 12GB card (KV cache competes with weights).

---

## 2. Prompting rules (the anti-loop discipline)

From G-Maiden `SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP.md` + GoVibe
`GUIDE--SMALL-MODEL-PROMPTING.md`. The block prepended to every local-worker prompt is
**`[SMALL_MODEL_RULES]`: one-action, ≤150 lines, surgical, escalate.**

**DO**
- **Micro-task** — 1 prompt = 1 specific change; split "state + function + wire-in" into
  separate rounds. Code ≤ 50–150 lines per execution.
- **Scaffold first** — give a skeleton with a `// TODO`, ask to fill *only* that; never
  "write from scratch."
- **Focused input** — send only the relevant lines, not the whole file ("current line:
  `const [s,setS]=useState('idle')`; return the updated line only").
- **Strict output** — append "Output ONLY the code block. No explanations. No line
  numbers." (stops the model drifting/explaining into a loop).
- **Escalate early** — on BLOCKED, missing context, or token overflow, return
  `BLOCKED:<reason>` and stop. Do not retry endlessly.

**DON'T**
- Don't give broad asks ("mock the RTCDataChannel") → the model exhaustively mocks every
  property forever. Give the shortcut: "mock only `createOffer`; use
  `as unknown as RTCDataChannel`; **DO NOT mock every property**."
- Don't send a 500-line file → attention collapse, overwrites existing code.
- Don't let a small model self-review (see Verify Gate, §5).
- Don't exceed `scope.budgetTokens` — prompt token sum must fit the per-phase budget.

---

## 3. Anti-error-loop (G1/G2/G3) — knowledge-grounded dispatch

The closed loop (G-Maiden `SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP.md`; GoVibe
`anti-error-loop.test.mjs`). Maps to GenesisDB primitives so a repeat mistake is injected
back into the next prompt instead of being re-made:

| layer | when | mechanism |
|---|---|---|
| **G1 Ground** | overflow / blank-page | `retrieveContext(targetId, tier, budget, fuzzy)` → a ContextPackage that **fits the token budget** |
| **G2 Remember** | a failure happens | `addNode{labels:["failure"], embedding, props:{issue, fix, model}}` + `addEdge{rel:"failed_with", causedBy:<reviewVerdict>}` |
| **G3 Retrieve** | repeat / hallucinate | `hybridSearch(queryVector, k, alpha)` over failure+passed nodes → inject top-k as a `[ANTI-ERROR BLOCK]` (e.g. "❌ `pnpm exec clippy` not found → ✅ use `cargo clippy`") + optional ✅ exemplar |

**Prompt layout** (token sum **must ≤ `scope.budgetTokens`**, verified by
`ContextPackage.tokenEstimate`; on overflow drop EXEMPLAR → lower context tier H0→H1 →
trim PAST MISTAKES):

```
[SMALL_MODEL_RULES]        one-action, ≤150 lines, surgical, escalate
[SCAFFOLD]                 task.scope.scaffold
[GROUNDED CONTEXT]         G1 retrieveContext(budget = scope.budgetTokens)
[❌ PAST MISTAKES]          G3 top-k failure nodes
[✅ EXEMPLAR (optional)]    G3 a passed task of the same type (few-shot)
[TASK + ACCEPTANCE]        the task def
```

- Embedding: **`bge-m3` 1024-dim**, local via Ollama `/api/embeddings` (free). Search
  defaults `k=3`, `alpha=0.5`, **similarity threshold 0.6** (floor before injecting, to
  avoid noise).
- Bounds: `toolsMaxIter: 20` (tool loop), `maxReworkRounds: 1` then **escalate to human**.
- **Degrade path:** if `store.knowledge = "file"` (no GenesisDB) → static `[SMALL_MODEL_RULES]`
  + Verify Gate only (no dynamic retrieval). This is the P1 zero-dependency mode.

---

## 4. Ollama config (profiles + hardware gotchas)

`config.json → providers.ollama` (identical in both repos):

```jsonc
"toolsMaxIter": 20, "keepAlive": "30m", "think": false, "tools": true,
"profiles": {
  "fast":     { "temperature": 0.3, "num_predict": 2048, "num_ctx": 8192 },
  "balanced": { "temperature": 0.4, "num_predict": 4096, "num_ctx": 8192 },
  "ui-heavy": { "temperature": 0.5, "num_predict": 8192, "num_ctx": 12288 },
  "tools":    { "temperature": 0.3, "num_predict": 8192, "num_ctx": 16384 }
}
```

**Hardware gotchas (RTX 3060 12GB, from the `_perfComment` + benchmark):**
- **Do NOT set `num_ctx` globally** — a cold load at 8192 ctx stalls prefill (~2 tok/s vs
  20+ warm). Pass `num_ctx` per-task only for file-edit/tool-loop work.
- **Do NOT set `OLLAMA_KV_CACHE_TYPE=q8_0`** — it tanks prefill to ~7 tok/s on this box.
- `num_ctx 8192` is the sweet spot for bounded H0 micro-tasks (~2.5GB KV/model).
- VRAM modes (`vram-mode.mjs`): **build** ≈ 9GB for Ollama (2 models loadable), **match**
  ≈ 3GB (one tiny 1–3B SLM only, when a game/stream is running). `node vram-mode.mjs build|match|status`.

---

## 5. Routing & gates — when NOT to go local

**Quota-aware decomposition (H-scale, GoVibe `FEAT-Quota-Aware-Local-LLM-Decomposition`):**
H0 = subtask/PR (local only, 8–16k ctx, one action); H1 = component (local + escalation);
H2–H6 = cloud/frontier only.

- ✅ **Route LOCAL:** extraction / classification / one-line edits / checklist verify /
  repetitive formatting / bounded single-file changes / H0 packets.
- ❌ **NEVER route local:** architecture interpretation, PRD/cross-repo decisions, scope
  approval, work needing full SDD/C4/PRD, broad multi-subsystem search → return
  `escalate_to_lead` instead of widening context.

**Verify Gate (G-Maiden `SPEC--VERIFY-GATE.md`):**
- Reviewer **must be a higher tier than the worker** (ollama→`sonnet`, sonnet→`opus`); a
  model cannot self-review.
- Pass iff `verdict == "pass"` AND no `severity == "critical"` issue. `maxReworkRounds: 1`.
- **L0** deterministic shell gate (lint/test/compile, **free**, runs before any paid
  review; non-zero → rework at $0) → **L1** local-SLM pre-filter for low-stakes
  (`docs/scaffold/config`) that can only **pass or escalate, never reject alone** → **L2**
  paid Claude review. High-stakes (code/test) always go to L2.
- **SLM-as-judge:** a local model may be equipped as an LLM-as-judge for `code_review`
  *for that purpose only*; a local-judge PASS on a governance gate (deploy/merge) advances
  to **human-confirm**, never auto-`done`.

**Transport note:** local models receive the prompt over the Ollama **HTTP body** (safe);
the Claude path sends via shell arg and can be mangled by cmd.exe — another reason local +
a content-checking Verify Gate is robust (G-Maiden `REPORT--prompt-fix-before-after.md`).

---

## 6. Source files (read-only references)

| Topic | G-Maiden | GoVibe |
|---|---|---|
| Benchmark | `MODEL-BENCHMARK.md` | `engine/orchestration/MODEL-BENCHMARK.md` |
| Prompting guide | (in the specs below) | `.agents/frontend/asset/GUIDE--SMALL-MODEL-PROMPTING.md` |
| Anti-error-loop | `docs/SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP.md` | `engine/orchestration/anti-error-loop.test.mjs` |
| Verify gate | `docs/SPEC--VERIFY-GATE.md` | `engine/orchestration/config.json` (review.l0/l1) |
| Tier/registry | `config.json` (roles) | `.agents/agent-registry.yaml` |
| Quota decomposition | `docs/DESIGN--G-ORCHESTRA-V2.md` | `docs/features/agent-team/FEAT-Quota-Aware-Local-LLM-Decomposition.md` |
| VRAM | — | `engine/orchestration/vram-mode.mjs` |
| Per-agent memory | — | `docs/features/agent-team/FEAT-Per-Agent-Memory-Unit.md` |
