#!/usr/bin/env python3
"""resolution_gradient.py — graded context assembly (RCA Phase D second half; RFC 0.6.x).

This is the DETERMINISTIC CORE of the resolution gradient specified in
RFC--RESOLUTION-GRADIENT-CONTEXT-BRIEF (0.1.0, active). It owns the sim-free half of the
pipeline — Layer 4 (resolution-tier assignment) and Layer 5 (budget) of the Universal
Context Framework — as a pure, stdlib-only, self-tested function. The Layer-3 `sim` term
is a MODEL call (bge-m3) and therefore lives in the JS runner, NOT here (CLAUDE.md:
"NEVER put LLM SDK calls in the core"). This script CONSUMES a `sim` value the runner
computed and passed in; it never embeds anything.

THE SCORE (RFC D2):
    score(a) = 0.7 * sim(a) + 0.3 * 1/(1 + hops(a))
  - sim(a)  : semantic similarity in [0,1] from GenesisDB bge-m3 (passed in by the runner).
  - hops(a) : BFS distance from the task's anchor node to atom `a` on the GKS atom graph.
              Computed HERE by reusing hop_metrics.py's graph math (one source of truth).
  - D7 graceful degradation: when the store/embedder is absent, NO candidate carries a
    `sim`; the run drops to HOP-ONLY scoring (score = 1/(1+hops)) and still assembles.

THE TIERS (RFC D3, faithful to CONCEPT--RESOLUTION-GRADIENT D-2):
    FULL     complete body      MVP  ✅
    MENTION  id-only pointer     MVP  ✅   (agent may expand() a MENTION -> FULL mid-task)
    SUMMARY / SKELETON           Phase 2 (additive renderers; the data model is here already).
  MVP admits atoms highest-score-first at FULL until `budget_tokens` tightens, then demotes
  the rest to MENTION (RFC D4: compress high-resolution first, NEVER drop by recency).
  `pin: true` atoms (e.g. PAST MISTAKES, FLIGHT §5.5) are non-trimmable — always FULL.

USAGE:
    python orchestrator/governance/resolution_gradient.py plan request.json
    python orchestrator/governance/resolution_gradient.py plan request.json --atoms DIR --anchor ID
    cat request.json | python orchestrator/governance/resolution_gradient.py plan -
    python orchestrator/governance/resolution_gradient.py --self-test
EXIT: 0 ok · 1 self-test failure · 2 usage/input error

request.json = {
  "budget_tokens": 2000,                         # Layer-5 hard ceiling (scope.budgetTokens)
  "weights": {"sim": 0.7, "hops": 0.3},          # optional; RFC D2 defaults
  "anchor": "entity--atom-schema",               # optional; only used with --atoms to fill hops
  "atoms": [
    {"id": "a1", "tokens_full": 800, "sim": 0.62, "hops": 1},
    {"id": "a2", "tokens_full": 500, "sim": 0.20, "hops": 3, "tokens_mention": 8},
    {"id": "past-mistake-7", "tokens_full": 120, "pin": true, "hops": 0}
  ]
}
Each atom: `id` + `tokens_full` required. `sim` optional (omit ALL -> hop-only mode).
`hops` optional if you pass --atoms DIR --anchor ID (then it is computed by BFS).
`tokens_mention` optional (default 8). `pin` optional (default false).
"""
import io
import json
import os
import sys

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))

# Reuse hop_metrics' graph math so BFS/atom-parsing has ONE source of truth (RFC D2).
sys.path.insert(0, HERE)
try:
    from hop_metrics import read_atoms, _undirected, _bfs  # noqa: E402
except Exception:                                            # pragma: no cover
    read_atoms = _undirected = _bfs = None

W_SIM, W_HOPS = 0.7, 0.3          # RFC D2 defaults (origin working assumption; §7 OQ-3)
DEFAULT_MENTION_TOKENS = 8        # CONCEPT--RESOLUTION-GRADIENT: MENTION is 5-10 tokens
FULL, MENTION = "FULL", "MENTION"


# ---------------------------------------------------------------- scoring (Layer 3, sim-free half)

def _decay(hops):
    """Hop-decay term 1/(1+hops). Unreachable (hops is None) contributes 0."""
    if hops is None:
        return 0.0
    return 1.0 / (1.0 + hops)


def score_atom(sim, hops, w_sim=W_SIM, w_hops=W_HOPS, sim_mode=True):
    """RFC D2 score. In hop-only mode (D7, no sim anywhere) the score IS the decay term."""
    decay = _decay(hops)
    if not sim_mode:
        return decay
    return w_sim * (sim if sim is not None else 0.0) + w_hops * decay


# ---------------------------------------------------------------- tier + budget (Layers 4-5)

def assign(atoms, budget_tokens, weights=None):
    """Pure Layer-4/5 assignment. `atoms` is a list of dicts (see module docstring).

    Returns the assembly plan (see keys below). Deterministic: ties break by id, so the
    same input always yields the same plan (required — the runner and the monitor both read it).
    """
    w_sim = (weights or {}).get("sim", W_SIM)
    w_hops = (weights or {}).get("hops", W_HOPS)
    sim_mode = any(a.get("sim") is not None for a in atoms)

    scored = []
    for a in atoms:
        hops = a.get("hops")
        sc = score_atom(a.get("sim"), hops, w_sim, w_hops, sim_mode)
        scored.append({
            "id": a["id"],
            "hops": hops,
            "sim": a.get("sim"),
            "score": round(sc, 6),
            "tokens_full": int(a["tokens_full"]),
            "tokens_mention": int(a.get("tokens_mention", DEFAULT_MENTION_TOKENS)),
            "pin": bool(a.get("pin", False)),
        })

    # Rank: pins first, then score desc, then id asc (deterministic tiebreak).
    ranked = sorted(scored, key=lambda x: (0 if x["pin"] else 1, -x["score"], x["id"]))

    used = 0
    demoted = []            # atoms that would rank into FULL but were demoted to MENTION
    for a in ranked:
        if a["pin"]:
            a["tier"] = FULL
            a["tokens"] = a["tokens_full"]
            used += a["tokens_full"]
            continue
        if used + a["tokens_full"] <= budget_tokens:
            a["tier"] = FULL
            a["tokens"] = a["tokens_full"]
            used += a["tokens_full"]
        else:
            a["tier"] = MENTION
            a["tokens"] = a["tokens_mention"]
            used += a["tokens_mention"]
            demoted.append(a["id"])

    n_full = sum(1 for a in ranked if a["tier"] == FULL)
    n_mention = len(ranked) - n_full
    # Trim order for the UI (FLIGHT §5.5): the FULL atoms in the order they would be demoted
    # next as the budget shrinks — lowest score first, pins excluded (non-trimmable).
    trim_order = [a["id"] for a in sorted(
        (x for x in ranked if x["tier"] == FULL and not x["pin"]),
        key=lambda x: (x["score"], x["id"]))]

    return {
        "mode": "sim" if sim_mode else "hop-only",
        "weights": {"sim": w_sim, "hops": w_hops},
        "budget_tokens": budget_tokens,
        "used_tokens": used,
        "overflow": used > budget_tokens,
        "n_full": n_full,
        "n_mention": n_mention,
        "pinned": [a["id"] for a in ranked if a["pin"]],
        "demoted": demoted,
        "trim_order": trim_order,
        "atoms": sorted(ranked, key=lambda x: (-x["score"], x["id"])),
    }


# ---------------------------------------------------------------- hops from the atom graph (IO)

def fill_hops(atoms, atoms_dir, anchor):
    """Fill each atom's `hops` = BFS distance from `anchor` on the GKS atom graph.

    Only atoms MISSING `hops` are filled. Unreachable atoms get hops=None (decay -> 0).
    Reuses hop_metrics.read_atoms / _bfs. No-op (returns as-is) if the graph can't be read.
    """
    if read_atoms is None or not (atoms_dir and os.path.isdir(atoms_dir)) or not anchor:
        return atoms
    nodes, edges = read_atoms(atoms_dir)
    adj = _undirected(nodes, edges)
    dist = _bfs(adj, anchor) if anchor in adj else {}
    for a in atoms:
        if a.get("hops") is None and "hops" not in a:
            a["hops"] = dist.get(a["id"])       # None if unreachable / absent from graph
    return atoms


# ---------------------------------------------------------------- reporting

def render(plan):
    w = sys.stderr.write
    w(f"\n=== resolution gradient  [{plan['mode']}]  "
      f"budget {plan['used_tokens']}/{plan['budget_tokens']} tok"
      f"{'  OVERFLOW' if plan['overflow'] else ''}\n")
    w(f"  weights sim={plan['weights']['sim']} hops={plan['weights']['hops']}  "
      f"FULL={plan['n_full']} MENTION={plan['n_mention']}  pinned={len(plan['pinned'])}\n")
    for a in plan["atoms"]:
        sim = "  -  " if a["sim"] is None else f"{a['sim']:.3f}"
        hop = " - " if a["hops"] is None else f"{a['hops']:>2}"
        w(f"    {a['tier']:<7} score {a['score']:.4f}  sim {sim}  hops {hop}  "
          f"{a['tokens']:>5} tok  {'PIN ' if a['pin'] else '    '}{a['id']}\n")
    if plan["trim_order"]:
        w(f"  trim order (next demoted first): {', '.join(plan['trim_order'])}\n")
    w("  MENTION atoms are expand()-able mid-task (RFC D5); pins are never trimmed (D4).\n")


# ---------------------------------------------------------------- CLI

def _load(path):
    if path == "-":
        return json.loads(sys.stdin.read())
    return json.loads(io.open(path, encoding="utf-8-sig").read())


def cmd_plan(argv):
    if not argv:
        sys.stderr.write("resolution_gradient.py: `plan` needs a request.json path (or -)\n")
        return 2
    req_path = argv[0]
    atoms_dir = anchor = None
    json_only = False
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--atoms" and i + 1 < len(argv):
            atoms_dir = argv[i + 1]; i += 2
        elif a == "--anchor" and i + 1 < len(argv):
            anchor = argv[i + 1]; i += 2
        elif a == "--json":
            json_only = True; i += 1
        else:
            sys.stderr.write(f"resolution_gradient.py: unknown arg {a!r}\n"); return 2
    try:
        req = _load(req_path)
    except Exception as e:                                  # noqa: BLE001
        sys.stderr.write(f"resolution_gradient.py: cannot read request {req_path!r}: {e}\n")
        return 2
    atoms = req.get("atoms") or []
    if not atoms:
        sys.stderr.write("resolution_gradient.py: request has no atoms[]\n"); return 2
    for a in atoms:
        if "id" not in a or "tokens_full" not in a:
            sys.stderr.write("resolution_gradient.py: every atom needs id + tokens_full\n")
            return 2
    anchor = anchor or req.get("anchor")
    fill_hops(atoms, atoms_dir, anchor)
    plan = assign(atoms, int(req.get("budget_tokens", 2000)), req.get("weights"))
    print(json.dumps(plan, ensure_ascii=False, indent=2))
    if not json_only:
        render(plan)
    return 0


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        sys.stderr.write(__doc__)
        return 0 if argv and argv[0] in ("-h", "--help") else 2
    if argv[0] == "--self-test":
        fails = self_test()
        if fails:
            for f in fails:
                sys.stderr.write(f"  SELFTEST FAIL: {f}\n")
            return 1
        sys.stderr.write("resolution_gradient self-test: tier + budget math verified.\n")
        return 0
    if argv[0] == "plan":
        return cmd_plan(argv[1:])
    sys.stderr.write(f"resolution_gradient.py: unknown command {argv[0]!r} "
                     f"(plan | --self-test | --help)\n")
    return 2


# ---------------------------------------------------------------- self-test

def self_test():
    """Verify Layer-4/5 math against hand-computable fixtures (no file IO)."""
    fails = []

    def check(label, got, want):
        if got != want:
            fails.append(f"{label}: got {got!r}, want {want!r}")

    # sim-mode, generous budget -> everything FULL, ranked by score.
    a1 = {"id": "a1", "tokens_full": 100, "sim": 0.9, "hops": 1}   # 0.7*0.9 + 0.3*0.5   = 0.78
    a2 = {"id": "a2", "tokens_full": 100, "sim": 0.2, "hops": 0}   # 0.7*0.2 + 0.3*1.0   = 0.44
    a3 = {"id": "a3", "tokens_full": 100, "sim": 0.5, "hops": 3}   # 0.7*0.5 + 0.3*0.25  = 0.425
    big = assign([a3, a1, a2], 10000)
    check("big mode", big["mode"], "sim")
    check("big all FULL", big["n_full"], 3)
    check("big order", [x["id"] for x in big["atoms"]], ["a1", "a2", "a3"])
    check("big score a1", big["atoms"][0]["score"], 0.78)
    check("big used", big["used_tokens"], 300)
    check("big no overflow", big["overflow"], False)

    # tight budget -> only the top score fits at FULL; rest demote to MENTION.
    tight = assign([a3, a1, a2], 150)
    tiers = {x["id"]: x["tier"] for x in tight["atoms"]}
    check("tight a1 FULL", tiers["a1"], FULL)
    check("tight a2 MENTION", tiers["a2"], MENTION)
    check("tight a3 MENTION", tiers["a3"], MENTION)
    check("tight demoted", sorted(tight["demoted"]), ["a2", "a3"])
    check("tight used", tight["used_tokens"], 100 + 8 + 8)
    check("tight n_full", tight["n_full"], 1)

    # pin is always FULL even when it would not fit by rank, and is never in trim_order.
    pinned = assign([a1, {"id": "pinme", "tokens_full": 100, "sim": 0.0, "hops": None, "pin": True}],
                    100)
    pt = {x["id"]: x["tier"] for x in pinned["atoms"]}
    check("pin FULL", pt["pinme"], FULL)
    check("pin pushed a1 to MENTION", pt["a1"], MENTION)   # budget spent by the pin
    check("pin not trimmable", "pinme" in pinned["trim_order"], False)
    check("pinned list", pinned["pinned"], ["pinme"])

    # hop-only mode (D7): no sim anywhere -> score == decay, ranked by hops asc.
    h1 = {"id": "h1", "tokens_full": 50, "hops": 0}   # decay 1.0
    h2 = {"id": "h2", "tokens_full": 50, "hops": 2}   # decay 0.333
    h3 = {"id": "h3", "tokens_full": 50, "hops": None}  # unreachable -> 0.0
    hop = assign([h2, h3, h1], 10000)
    check("hop mode", hop["mode"], "hop-only")
    check("hop order", [x["id"] for x in hop["atoms"]], ["h1", "h2", "h3"])
    check("hop score h1", hop["atoms"][0]["score"], 1.0)
    check("hop score h3", hop["atoms"][2]["score"], 0.0)

    # deterministic tiebreak: equal scores -> id ascending.
    e1 = {"id": "zzz", "tokens_full": 10, "sim": 0.5, "hops": 1}
    e2 = {"id": "aaa", "tokens_full": 10, "sim": 0.5, "hops": 1}
    eq = assign([e1, e2], 10000)
    check("tie by id", [x["id"] for x in eq["atoms"]], ["aaa", "zzz"])

    # trim order = FULL atoms lowest-score-first (next to demote).
    to = assign([a1, a2, a3], 10000)
    check("trim order asc", to["trim_order"], ["a3", "a2", "a1"])

    return fails


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
