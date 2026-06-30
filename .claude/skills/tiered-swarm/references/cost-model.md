# Cost Model — Two-Way (count x per-type price) Across Tiers

> This is the cost ledger the `tiered-swarm` skill uses to (a) decide cheap-vs-escalate
> at the FrugalGPT break-even and (b) make the "local saved tokens" claim *defensible*
> by metering every tier — including local — into one schema.
>
> **Design invariant #4:** cost is two-way (token COUNT x per-type PRICE), measured on
> every tier including local. "Saved tokens" is only claimable if you metered it.

---

## 1. The formula

Cost is not "sum the tokens." A 1,000-token Opus *output* costs 5x a 1,000-token Opus
*input* ($25 vs $5 /M). A cached prefix *read* costs 0.1x fresh input; *writing* that
cache costs 1.25x (5-min TTL) or 2.0x (1-hr TTL). So you must compute cost per token
*type*, per tier:

```
cost = Σ over tiers [  in_uncached · rate_in
                     + in_cached   · rate_cacheRead
                     + cache_write · rate_cacheWrite
                     + out         · rate_out         ]
```

- **Token COUNT** = four counters per call: `in_uncached`, `in_cached`, `cache_write`, `out`.
- **Token PRICE** = a per-type rate vector per model (table below).
- **Never double-count:** `in_cached` *replaces* fresh input for the cached prefix.
  Tokens billed as cache-read are NOT also billed as `in_uncached`.

`scripts/cost_estimate.py` implements exactly this formula with an editable rate table.

---

## 2. Pricing snapshot

> **UNCERTAINTY FLAG — dated 2026-06-04.** These Claude figures come from the
> `claude-api` skill knowledge cache (research ref R1), **not** a live API response.
> Prices may have changed.
> **VERIFY-AT before any billing logic ships:** `https://platform.claude.com/docs/en/pricing.md`
> Also check: `https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching`
> Treat the rows below as a *default to be re-confirmed*, never as gospel.

All figures in **$ / million tokens**.

| Model | in | out | cacheWrite 5-min (1.25x) | cacheWrite 1-hr (2.0x) | cacheRead (0.1x) |
|---|---|---|---|---|---|
| `claude-opus-4-8` | 5.00 | 25.00 | 6.25 | 10.00 | 0.50 |
| `claude-sonnet-4-6` | 3.00 | 15.00 | 3.75 | 6.00 | 0.30 |
| `claude-haiku-4-5` | 1.00 | 5.00 | 1.25 | 2.00 | 0.10 |
| **T0 / T1 local** (Ollama) | ~0 | ~0 | n/a | n/a | n/a |
| **T1.5 cloud-open-weights** | ~0.1–0.5 | ~0.1–0.5 | — | — | — |

Cache rates are derived from input-rate multipliers, not stated as explicit dollars in
the source: cacheWrite-5min = 1.25x in, cacheWrite-1hr = 2.0x in, cacheRead = 0.10x in.

### Local tier rate ~ $0 marginal — but NOT literally free

The local rate is **off the billable axis**, not zero. The real marginal cost of a local
Ollama call is **electricity + the sunk VRAM/GPU** of the RTX 3060 12GB:

- **Electricity:** a ~170W board pulled for, say, 30s of generation is ~0.0014 kWh
  ≈ a small fraction of a US cent. Per-call electricity is effectively rounding error.
- **Sunk VRAM / hardware:** the GPU is already bought; its amortized cost does not vary
  with one more inference call, so it does not enter the *marginal* routing decision.
- **The true cost of local is not tokens — it is ERROR.** A local mid model is ~$0/token
  but not ~$0/error. The expensive part of a wrong local output is the verify pass that
  catches it plus the frontier pass that redoes it (see §4). That is what the break-even
  in §5 prices, and it is why local is allowed only behind a verify gate.

We therefore set the local *price* to 0.0 in the rate table, but still **meter the local
token COUNT** (§3) so the local/Claude split is auditable.

---

## 3. Caching levers for the swarm

The 7 verifiers share a large common prefix: the spec + the codebase context + the
verifier system prompt. Exploit it:

- **Render order:** `tools → system → messages`. Place a `cache_control` breakpoint
  *after* the shared block so it forms a stable prefix.
- **First verifier pays `cache_write` (1.25x); the other six pay `cache_read` (0.1x)**
  on that prefix. Under these multipliers the 0.25x write tax is repaid by the 0.9x
  saving on the very first reuse (break-even ≈ 0.25/0.9 ≈ **0.3 reuse calls**), so any
  genuine repeat of the prefix is already net-positive — provided the prefix actually
  repeats (next bullet).
- **Floors:** Opus/Haiku min cacheable prefix = 4096 tokens; Sonnet = 2048. Keep the
  shared prefix above the floor or caching silently no-ops.
- **Max 4 `cache_control` breakpoints per request.**
- **Caveat — measure, don't assume.** Caching only helps when the prefix *genuinely
  repeats* across the fan-out. With low overlap the 1.25x write tax can exceed the read
  savings and you come out behind. Meter it.

---

## 4. How to MEASURE local token usage (Ollama)

"Local saved tokens" is only a defensible claim if you metered the local side. Ollama
returns per-response counters that map directly onto our four-counter schema:

| Ollama field | Our counter | Rate |
|---|---|---|
| `prompt_eval_count` | `in_uncached` (local has no prompt-cache billing) | 0.0 |
| `eval_count` | `out` | 0.0 |
| (n/a) | `in_cached` | 0.0 |
| (n/a) | `cache_write` | 0.0 |

`scripts/ollama_route.sh` POSTs to `http://localhost:11434/api/generate` with
`stream:false` and prints **both** the response text and `prompt_eval_count` /
`eval_count`, so the caller can log local usage into the same ledger as the Claude calls.
Rate is 0.0, but the COUNT is real and recorded — that is what makes the split auditable.

Minimal capture (the script does this for you):

```sh
# scripts/ollama_route.sh aroow-rust-coder-9b "verify edge retraction ..." 
# prints: <response text>
# ---
# prompt_eval_count=1843
# eval_count=412
```

Log every call — local and Claude — as one row: `{tier, model, in_uncached, in_cached,
cache_write, out}` and feed it to `scripts/cost_estimate.py`.

---

## 5. Worked example — the 594k-token run, three ways

**Telemetry of the prior workflow** (the run this skill generalizes): 10 agents
(7 Sonnet verifiers + 2 Opus authors + 1 Opus reviewer), **594,143 total tokens,
88 tool calls, ~10 min wall-clock.** No per-type split was captured, so we assume a
code-grounded, read-heavy profile: **~85% input / ~15% output** ≈ 505k in, 89k out.
Split by role using agent counts (verifiers ~60% of tokens given their fan-out;
authors+reviewer ~40%):

- **Verify** (7x Sonnet): ~356k total → ~303k in, ~53k out
- **Author + Review** (3x Opus): ~238k total → ~202k in, ~36k out

### (A) Claude-only, no cache — the baseline that was effectively run

```
Verify  (Sonnet) : 303k·$3/M  + 53k·$15/M  = $0.909 + $0.795 = $1.704
Author  (Opus)   : 202k·$5/M  + 36k·$25/M  = $1.010 + $0.900 = $1.910
TOTAL ≈ $3.61
```

### (B) Claude-only, WITH shared-prefix caching on the 7 verifiers

Assume ~150k of verifier input is the shared spec/context prefix (1 write + 6 reads):

```
Verifier prefix : write 150k·$3.75/M = $0.563 ; read 6·150k·$0.30/M = $0.270
Verifier rest   : non-prefix in ≈ 153k·$3/M = $0.459 ; out 53k·$15/M = $0.795
Verify subtotal ≈ $0.563 + $0.270 + $0.459 + $0.795 = $2.09
Author (Opus, unchanged)                                = $1.910
TOTAL ≈ $4.00 worst-cased  /  ~$2.9 if prefix overlap is high
```

Caching helps *only* when the prefix genuinely repeats across the 7. With low overlap
the 1.25x write tax can exceed the read savings — measure, don't assume.

### (C) Local-first hybrid — move the 7 verifiers to T1 local; authors+reviewer stay Opus

```
Verify  (Aroow-Rust-Coder-9B / Mellum2, local) : ~$0   (metered via Ollama eval counts)
Author + Review (Opus, unchanged)              : $1.910
TOTAL ≈ $1.91   →  ~47% cheaper than (A)  ($3.61 → $1.91)
```

### The savings AND the rework risk — in one frame

The hybrid wins **only because verification is the cheap-eligible, machine-checkable
role**: each verifier returns a structured **finding + evidence** (a grep/line-cite),
which is exactly the deterministic check the break-even requires.

But the failure mode is concrete and expensive. A **T1 verifier that hallucinates a
finding** feeds a wrong premise into a **T3 Opus author**, which spends full frontier
price ($5/$25 per M) authoring an RCA on a false foundation — then the adversarial
reviewer ($25/M out) catches it and the *entire author phase reruns*. One bad local
verifier can erase the $1.70 of "saved" verify cost **and** add a ~$1.9 author redo:
net **worse** than Claude-only.

```
E[cost_cheap] = c_cheap + p_fail · (c_verify + c_frontier_fix)   <   c_frontier_direct
```

With local `c_cheap ≈ 0` and a cheap deterministic verifier `c_verify ≈ 0`:

```
route cheap  ⟺  p_fail · c_frontier_fix  <  c_frontier_direct
             ⟺  p_fail  <  c_frontier_direct / c_frontier_fix
```

- **Self-contained, independently verifiable cheap output** (fix ≈ a fresh frontier
  attempt, no propagation): `c_frontier_fix ≈ c_frontier_direct`, threshold ~1 →
  local-first almost always wins.
- **Cheap output feeds downstream agents before verification** (our verifier→author
  chain): `c_frontier_fix ≫ c_frontier_direct`, threshold is tiny → you must escalate
  OR insert a verify gate between the cheap producer and its consumer.

**This is why the 47% is real only behind a verify gate.** Mitigation the skill enforces:
route the verifier tier cheap, but require each finding to carry a **re-runnable evidence
command**; a T0 SLM or a cheap deterministic check (`scripts/check_evidence.py`, if
present) confirms the citation resolves before any finding crosses into the author phase.
FrugalGPT reports 40–70% cost reduction at <2% quality loss *specifically when a verifier
gate sits in the cascade* (R4); remove the gate and the savings invert into rework.

---

## 6. Ledger checklist

- [ ] Every call (local + Claude) logged with the four counters.
- [ ] Local calls metered via Ollama `prompt_eval_count` / `eval_count` (rate 0.0).
- [ ] `in_cached` never also counted as `in_uncached`.
- [ ] Claude rates re-verified at the VERIFY-AT URL before any billing logic ships.
- [ ] Shared-prefix cache savings measured, not assumed (write tax can exceed read gain).
- [ ] Cheap-tier savings claimed only behind a verify gate.
