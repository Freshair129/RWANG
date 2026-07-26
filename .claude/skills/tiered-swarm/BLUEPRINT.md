# BLUEPRINT — reproduce the tiered-swarm system

How to rebuild this spec-driven, local-first, cost-tiered orchestration system on a fresh
host. The contract it must satisfy is `SPEC.md`; this file is the *how*. Pair it with
`references/DESIGN-RATIONALE.md` (the *why*).

---

## 1. What you are reproducing (one paragraph)

A control plane that reads a spec, **routes** each sub-task to the cheapest model tier that
can pass a machine-checkable acceptance command, **executes** it (local Ollama / cloud
open-weights / Claude), **gates** cheap output behind a verify command before it reaches an
authoring agent, and **meters** every tier — including local — into one two-way cost ledger.
The proven spine is `VERIFY → AUTHOR → REVIEW → ASSEMBLE`. Three skills compose:
`spec-driven-development` (head) → `tiered-swarm` (this: outer spine + routing + gate +
ledger) → `tdd-workflow` (per-task inner loop).

---

## 2. Prerequisites

| Layer | Requirement | This reference host |
|---|---|---|
| GPU | ≥ 8 GB VRAM (designed for 12 GB) | RTX 3060 12 GB (12288 MiB) |
| Local inference | Ollama installed + serving on `:11434` | Ollama (Windows) |
| Scripting | `python` 3.x on PATH (python3 NOT required) + PyYAML; `curl`; POSIX `sh` | python 3.13.7, PyYAML 6.0.3, Git Bash |
| Orchestrator | Claude Code (provides the Agent/Task + Workflow mechanisms) | — |
| Composed skills | `spec-driven-development` + `tdd-workflow` installed under `~/.claude/skills/` | present |

> **python3 gotcha:** this host has only `python`, not `python3`. The scripts resolve an
> interpreter as `python3 || python`. If you symlink `python3`, nothing breaks; if you
> don't, it still works. Do not hard-code `python3`.

---

## 3. Model manifest — role → alias → real Ollama tag

The skill's scripts emit **short alias** model names (`aroow-rust-coder-9b`). Ollama stores
**long tags** (`hf.co/sillykiwi/Aroow-Rust-Coder-9B-Q4_K_S-GGUF:Q4_K_S`). Bridge them once
with `ollama cp <real-tag> <alias>` (a cheap manifest copy — shares blobs, no re-download).
Pull what you need, then alias:

| Tier / role | Alias (used by scripts) | Real Ollama tag to pull | ~VRAM |
|---|---|---|---|
| T1 local-mid (Rust) | `aroow-rust-coder-9b` | `hf.co/sillykiwi/Aroow-Rust-Coder-9B-Q4_K_S-GGUF:Q4_K_S` | ~5.6 GB |
| T1 local-mid (MoE) | `mellum2-12b-a2.5b` | `hf.co/yuxinlu1/Mellum2-12B-A2.5B-Claude-4.6-4.8-Opus-Thinking-GGUF:Q4_K_M` | ~8.3 GB |
| T1 local-mid (coder) | `gemma-4-12b-coder` | `hf.co/yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF:Q4_K_M` | ~7.6 GB |
| T0 local-SLM | `vibethinker-3b` | `hf.co/prithivMLmods/VibeThinker-3B-GGUF:Q4_K_M` | ~2.0 GB |
| T0 local-SLM | `chinda-qwen3-4b` | `hf.co/iapp/chinda-qwen3-4b-gguf:Q4_K_M` | ~2.6 GB |
| role: embed (engine-matched) | `bge-m3` | `bge-m3:latest` (or `hf.co/gpustack/bge-m3-GGUF:Q8_0`) | ~1.3 / 0.7 GB |
| role: rerank | `bge-reranker-v2-m3` | `hf.co/gpustack/bge-reranker-v2-m3-GGUF:Q8_0` | ~0.7 GB |
| role: embed-code | `jina-code-embeddings-1.5b` | `hf.co/jinaai/jina-code-embeddings-1.5b-GGUF:BF16` | ~1.6 GB |
| role: embed-mm / VLM | `qwen3-vl-embedding-2b` | `hf.co/Etherll/Qwen3-VL-Embedding-2B-Q8_0-GGUF:Q8_0` | ~2.0 GB |
| role: VLM caption | `polaris-vga-0.8b` | `hf.co/mradermacher/Polaris-VGA-0.8B-Post1.0-GGUF:F16` | ~0.9 GB |
| role: summarizer | `clarityqwen2-summarizer` | `hf.co/ClarityClips/ClarityQwen2Summarizer:F16` | ~4–5 GB |
| role: TTS | `orpheus-3b` / `omnivoice` | `hf.co/unsloth/orpheus-3b-0.1-ft-GGUF:Q4_K_M` | ~2.1 GB |
| T1.5 cloud-OW | `kimi-k2.7-code:cloud` etc. | `deepseek-v4-pro:cloud`, `kimi-k2.7-code:cloud`, `gemini-3-flash-preview:cloud` | 0 local |
| T2 / T3 Claude | `claude-sonnet-4-6` / `claude-opus-4-8` | via Claude Code Agent/Task (not Ollama) | 0 local |

Aliasing example (do this for each model you route to by short name):
```sh
ollama cp hf.co/sillykiwi/Aroow-Rust-Coder-9B-Q4_K_S-GGUF:Q4_K_S aroow-rust-coder-9b
ollama cp hf.co/prithivMLmods/VibeThinker-3B-GGUF:Q4_K_M            vibethinker-3b
ollama cp hf.co/yuxinlu1/Mellum2-12B-A2.5B-Claude-4.6-4.8-Opus-Thinking-GGUF:Q4_K_M mellum2-12b-a2.5b
# ...embedders/rerankers keep their own short tags or alias similarly.
```

### 12 GB co-residency budget (what can stay loaded together)

| Slot | Models co-resident | ~VRAM |
|---|---|---|
| A — code work | `aroow-rust-coder-9b` + `bge-m3` + `bge-reranker-v2-m3` | ~7.0 GB |
| B — reasoning | `mellum2-12b-a2.5b` + `bge-m3` | ~9.6 GB |
| C — retrieval-heavy | `bge-m3` + `bge-reranker-v2-m3` + `qwen3-vl-embedding-2b` + a T0 SLM | ~6.6 GB |

`mellum2` (8.3 GB) and `clarityqwen2-summarizer` (4–5 GB) cannot co-reside — hot-swap.
Ollama unloads idle models automatically (`OLLAMA_KEEP_ALIVE` to tune).

### Hardware substitution

- **8 GB VRAM:** drop to Slot A-style — one T1 ≤ 6 GB model (`aroow-rust-coder-9b`) + the
  small embed/rerank pair; prefer T0 SLMs for verify; lean harder on T1.5 cloud-OW for the
  mid tier. The skill still works — only the local ceiling lowers.
- **No GPU / CPU-only:** keep embed/rerank local (cheap on CPU), route all generation to
  T1.5 cloud-OW + Claude; local generation is too slow to be worth it.
- **Different models:** the aliases are the contract. Pull any comparable model and
  `ollama cp` it to the alias the scripts expect — e.g. swap `aroow-rust-coder-9b` for any
  Rust-capable ≤ 7 GB coder. Keep `bge-m3` for engine-matched embedding (substituting it
  changes the metric space and breaks recall against the GenesisBlock store).

---

## 4. Rebuild procedure (fresh host)

```sh
# 1. Install Ollama, start it, confirm it serves.
ollama --version && curl -s http://localhost:11434/api/tags >/dev/null && echo "ollama up"

# 2. Pull + alias the models you need (table §3). At minimum, one T1, one T0, bge-m3.
ollama pull hf.co/sillykiwi/Aroow-Rust-Coder-9B-Q4_K_S-GGUF:Q4_K_S
ollama cp   hf.co/sillykiwi/Aroow-Rust-Coder-9B-Q4_K_S-GGUF:Q4_K_S aroow-rust-coder-9b
ollama pull bge-m3:latest

# 3. Install the composed skills under ~/.claude/skills/ (if not present).
ls "$HOME/.claude/skills/spec-driven-development" "$HOME/.claude/skills/tdd-workflow"

# 4. Drop this skill folder at .claude/skills/tiered-swarm/ (project) or ~/.claude/skills/ (global).

# 5. Confirm python + PyYAML.
python -c "import yaml; print('PyYAML', yaml.__version__)"

# 6. Smoke test (§5) — every SPEC.md verify_command must pass.
```

---

## 5. Smoke test (proves the reproduction)

From `.claude/skills/tiered-swarm/`:

```sh
# scripts run
python scripts/cost_estimate.py | tail -3                 # prints the worked example + reminder
python scripts/route.py - --json <<'J' | head             # router floors no-verify -> T2+
{"tasks":[{"id":"a","description":"author rca","review_gate":true},
          {"id":"b","description":"check","verify_command":"cargo test"}]}
J
echo '[{"id":"ok","evidence_command":"echo hi","must_match":"hi"}]' \
  | python scripts/check_evidence.py -                     # GATE OPEN, exit 0
sh -n scripts/ollama_route.sh && echo "sh OK"              # script parses

# real local inference (proves the local tier + token metering)
scripts/ollama_route.sh aroow-rust-coder-9b "Reply with exactly: PONG"
# -> prints PONG, then prompt_eval_count / eval_count for the cost ledger
```

Then run each `verify_command` in `SPEC.md §3`. **All passing = system reproduced.** The
acceptance is executable, not prose — that is the whole point of the skill.

---

## 6. Architecture (recap; full detail in DESIGN-RATIONALE.md)

```
spec-driven-development            ── SSOT: EARS reqs → design → task list (+ verify_command + tier_hint)
        │
        ▼
scripts/route.py  (router = ROLE: rules-first, 0-VRAM; reads the spec, emits a tier per task)
        │
        ▼
OUTER LOOP:  Verify(cheap, parallel) ─[verify-gate: check_evidence.py]→ Author(T3) → Review(T3) → Assemble(human)
INNER LOOP:  per implementation task → compose tdd-workflow  RED(=verify_command) → GREEN(@routed tier) → REFACTOR
LEDGER:      every call (local + Claude) → scripts/cost_ledger.py  (count × per-type price; local=$0 but metered)
```

Two-axis model: capability tiers (T0→T3 + cloud-OW) **⟂** role specialists (embed/rerank/
VLM/summarizer/TTS); the router is a role, never a tier.

---

## 7. Portability gotchas (learned building this)

1. **`python3` not on PATH** (Windows + Git Bash). Resolve `python3 || python` everywhere.
2. **Short alias vs long Ollama tag.** Scripts use aliases; bridge with `ollama cp` (§3).
3. **Pricing is a 2026-06-04 snapshot with an UNCERTAINTY FLAG.** Re-verify at
   `https://platform.claude.com/docs/en/pricing.md` before any billing logic. The cost
   *formula* is durable; the *rates* are not.
4. **A mistyped billed model must fail loud, not silently cost $0** — `cost_estimate.py`
   raises on an unknown `claude-*` tag. Keep that behavior if you port the ledger.
5. **bge-m3 is engine-matched.** Any embedding query against a GenesisBlock vector store
   must use it; a "cheaper" embedder is a correctness bug (different metric space), not a
   saving.
6. **No LLM SDK in scripts/.** The deterministic layer (route/check/ledger) must stay
   model-free; model calls go through Agent/Task or the Ollama HTTP API.
