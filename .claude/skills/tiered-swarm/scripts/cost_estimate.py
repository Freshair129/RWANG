#!/usr/bin/env python3
"""cost_estimate.py — two-way cost ledger for the tiered-swarm skill.

Implements the cost-model formula (references/cost-model.md):

    cost = sum over tiers [ in_uncached * rate_in
                          + in_cached   * rate_cacheRead
                          + cache_write * rate_cacheWrite
                          + out         * rate_out ]

Cost is two-way: token COUNT (the four counters per call) x per-type PRICE (the
rate vector per model). Local tiers are metered (count is real) but priced at 0.0,
so the local/Claude split is auditable.

Dependency-free (stdlib only). Run `python cost_estimate.py` for the worked example.

USAGE (as a module):
    from cost_estimate import cost_of_call, total_cost
    rows = [
        {"tier": "verify", "model": "claude-sonnet-4-6",
         "in_uncached": 303_000, "in_cached": 0, "cache_write": 0, "out": 53_000},
        ...
    ]
    print(total_cost(rows))
"""

# ---------------------------------------------------------------------------
# PRICING TABLE  --  EDIT / VERIFY BEFORE ANY BILLING LOGIC SHIPS
# ---------------------------------------------------------------------------
# Source: claude-api skill cache dated 2026-06-04 (research ref R1). These are a
# DEFAULT TO BE RE-CONFIRMED, not gospel. UNCERTAINTY FLAG: prices may have changed.
# VERIFY-AT: https://platform.claude.com/docs/en/pricing.md
# Also check: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
#
# All rates are in $ per MILLION tokens. Cache rates derive from input multipliers:
#   cache_write_5min = 1.25x in, cache_write_1hr = 2.0x in, cache_read = 0.10x in.
# The 'cache_write' counter below is billed at the 5-min rate by default; if you use
# 1-hr TTL caching, set the model's "cache_write" entry to its 1-hr value (2.0x in).
#
# Local tiers (T0/T1 via Ollama) = 0.0 — off the billable axis (electricity + sunk
# VRAM only). METER their token COUNT anyway (Ollama prompt_eval_count / eval_count)
# so "local saved tokens" is a defensible, audited claim.
# ---------------------------------------------------------------------------
PRICING = {
    # model tag       : { in, out, cache_write (5-min/1.25x), cache_write_1hr (2.0x), cache_read (0.10x) }
    "claude-opus-4-8":    {"in": 5.00, "out": 25.00, "cache_write": 6.25, "cache_write_1hr": 10.00, "cache_read": 0.50},
    "claude-sonnet-4-6":  {"in": 3.00, "out": 15.00, "cache_write": 3.75, "cache_write_1hr":  6.00, "cache_read": 0.30},
    "claude-haiku-4-5":   {"in": 1.00, "out":  5.00, "cache_write": 1.25, "cache_write_1hr":  2.00, "cache_read": 0.10},

    # --- T1.5 cloud-open-weights: order-of-magnitude estimates (R4). EDIT/VERIFY. ---
    "kimi-k2.7-code:cloud":   {"in": 0.30, "out": 0.30, "cache_write": 0.0, "cache_read": 0.0},
    "deepseek-v4-pro:cloud":  {"in": 0.30, "out": 0.30, "cache_write": 0.0, "cache_read": 0.0},

    # --- T0 / T1 LOCAL (Ollama on RTX 3060): metered, rate 0.0 (marginal ~ $0). ---
    "aroow-rust-coder-9b":  {"in": 0.0, "out": 0.0, "cache_write": 0.0, "cache_read": 0.0},
    "mellum2-12b-a2.5b":    {"in": 0.0, "out": 0.0, "cache_write": 0.0, "cache_read": 0.0},
    "vibethinker-3b":       {"in": 0.0, "out": 0.0, "cache_write": 0.0, "cache_read": 0.0},
    "chinda-qwen3-4b":      {"in": 0.0, "out": 0.0, "cache_write": 0.0, "cache_read": 0.0},

    # Generic fallback for any unlisted LOCAL model: metered, free.
    "__local__":            {"in": 0.0, "out": 0.0, "cache_write": 0.0, "cache_read": 0.0},
}

_PER_MILLION = 1_000_000.0


def rates_for(model):
    """Look up the rate vector for a model tag.

    Unknown tags are NOT silently free — that would let a mistyped Claude row vanish
    from the ledger at $0 and corrupt the audit. So:
      - a tag that LOOKS billed (startswith 'claude') and is missing -> raise loudly.
      - a ':cloud' tag with no entry -> a cloud estimate, with a stderr warning.
      - anything else -> local $0, with a stderr warning (so an unlisted billed model
        cannot hide as 'local').
    """
    if model in PRICING:
        return PRICING[model]
    if str(model).startswith("claude"):
        raise ValueError(
            f"unknown Claude model tag {model!r} — typo? Add it to PRICING or fix the "
            f"tag. Refusing to price a billed model at $0 (would corrupt the ledger).")
    if str(model).endswith(":cloud"):
        sys.stderr.write(
            f"WARN: unknown cloud model {model!r} -> cloud estimate $0.30/M in+out. "
            f"EDIT/VERIFY in PRICING.\n")
        return {"in": 0.30, "out": 0.30, "cache_write": 0.0,
                "cache_write_1hr": 0.0, "cache_read": 0.0}
    sys.stderr.write(
        f"WARN: unknown model {model!r} priced as LOCAL $0 — verify it is actually "
        f"local (not a mistyped billed model).\n")
    return PRICING["__local__"]


def cost_of_call(model, in_uncached=0, in_cached=0, cache_write=0, out=0,
                 cache_write_ttl="5min"):
    """Cost in USD for a single call given the four token counters.

    cache_write_ttl selects the 5-min (1.25x in, default) or 1-hr (2.0x in) cache-write
    rate, so one ledger can mix TTLs without editing the global table.
    """
    r = rates_for(model)
    cw_rate = (r.get("cache_write_1hr", r.get("cache_write", 0.0))
               if cache_write_ttl == "1hr" else r.get("cache_write", 0.0))
    return (
        in_uncached * r.get("in", 0.0)
        + in_cached * r.get("cache_read", 0.0)
        + cache_write * cw_rate
        + out * r.get("out", 0.0)
    ) / _PER_MILLION


def cost_breakdown(rows):
    """Return (per_row_costs, total). Each row: dict with model + four counters.

    Optional 'tier' key on a row is passed through for reporting.
    """
    per_row = []
    total = 0.0
    for row in rows:
        c = cost_of_call(
            row["model"],
            in_uncached=row.get("in_uncached", 0),
            in_cached=row.get("in_cached", 0),
            cache_write=row.get("cache_write", 0),
            out=row.get("out", 0),
            cache_write_ttl=row.get("cache_write_ttl", "5min"),
        )
        total += c
        per_row.append({**row, "cost_usd": c})
    return per_row, total


def total_cost(rows):
    """Just the grand total in USD."""
    return cost_breakdown(rows)[1]


def _fmt(rows, total, title):
    """Pretty-print a breakdown table."""
    print(f"\n=== {title} ===")
    print(f"{'tier':<10} {'model':<20} {'in_unc':>9} {'in_cch':>8} "
          f"{'cwrite':>8} {'out':>8} {'$cost':>9}")
    print("-" * 76)
    for r in rows:
        print(f"{r.get('tier',''):<10} {r['model']:<20} "
              f"{r.get('in_uncached',0):>9,} {r.get('in_cached',0):>8,} "
              f"{r.get('cache_write',0):>8,} {r.get('out',0):>8,} "
              f"{r['cost_usd']:>9.4f}")
    print("-" * 76)
    print(f"{'TOTAL':<58} {'$' + format(total, '.4f'):>17}")


# ---------------------------------------------------------------------------
# __main__ demo: the worked example from references/cost-model.md
# 594,143 tokens, 10 agents (7 Sonnet verifiers + 3 Opus author/review), ~85% in.
# ---------------------------------------------------------------------------
def _demo():
    # (A) Claude-only, no cache — the baseline that was effectively run.
    rows_A = [
        {"tier": "verify", "model": "claude-sonnet-4-6",
         "in_uncached": 303_000, "in_cached": 0, "cache_write": 0, "out": 53_000},
        {"tier": "author", "model": "claude-opus-4-8",
         "in_uncached": 202_000, "in_cached": 0, "cache_write": 0, "out": 36_000},
    ]
    pa, ta = cost_breakdown(rows_A)
    _fmt(pa, ta, "(A) Claude-only, no cache  [baseline]")

    # (B) Claude-only WITH shared-prefix caching on the 7 verifiers.
    #     ~150k of verifier input is the shared prefix: 1 write + 6 reads (900k read).
    rows_B = [
        {"tier": "vfy-prefix", "model": "claude-sonnet-4-6",
         "in_uncached": 0, "in_cached": 900_000, "cache_write": 150_000, "out": 0},
        {"tier": "vfy-rest", "model": "claude-sonnet-4-6",
         "in_uncached": 153_000, "in_cached": 0, "cache_write": 0, "out": 53_000},
        {"tier": "author", "model": "claude-opus-4-8",
         "in_uncached": 202_000, "in_cached": 0, "cache_write": 0, "out": 36_000},
    ]
    pb, tb = cost_breakdown(rows_B)
    _fmt(pb, tb, "(B) Claude-only, shared-prefix cache on verifiers")

    # (C) Local-first hybrid — 7 verifiers moved to T1 local (metered, $0); authors stay Opus.
    rows_C = [
        {"tier": "verify", "model": "aroow-rust-coder-9b",
         "in_uncached": 303_000, "in_cached": 0, "cache_write": 0, "out": 53_000},
        {"tier": "author", "model": "claude-opus-4-8",
         "in_uncached": 202_000, "in_cached": 0, "cache_write": 0, "out": 36_000},
    ]
    pc, tc = cost_breakdown(rows_C)
    _fmt(pc, tc, "(C) Local-first hybrid  [verify -> T1 local, metered $0]")

    print("\n--- summary ---")
    print(f"(A) Claude-only, no cache : ${ta:.2f}")
    print(f"(B) Claude-only, cached   : ${tb:.2f}  "
          f"(helps only if prefix truly repeats; write tax can exceed read gain)")
    print(f"(C) Local-first hybrid    : ${tc:.2f}  "
          f"({(1 - tc/ta)*100:.0f}% cheaper than A)")
    print("\nCAVEAT: (C) wins ONLY behind a verify gate. A hallucinated local finding fed")
    print("to a T3 Opus author can erase the saved verify cost AND add a ~$1.9 author redo")
    print("-> net WORSE than (A). Require each finding to carry a re-runnable evidence")
    print("command; confirm it resolves before any finding crosses into the author phase.")
    print("\nREMINDER: Claude rates are the 2026-06-04 snapshot (UNCERTAINTY FLAG).")
    print("Re-verify at https://platform.claude.com/docs/en/pricing.md before billing.")


if __name__ == "__main__":
    _demo()
