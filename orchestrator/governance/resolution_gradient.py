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
    FULL      complete body                       MVP      ✅
    SUMMARY   frontmatter + first paragraph + headers  Phase 2  ✅ (this file)
    SKELETON  id + title + 1-line description      Phase 2  ✅ (this file)
    MENTION   id-only pointer                      MVP      ✅   (expand() -> FULL mid-task)
  Atoms are admitted highest-score-first, each at the HIGHEST tier that still fits the
  remaining budget (RFC D4: compress high-resolution first, cascading FULL -> SUMMARY ->
  SKELETON -> MENTION, NEVER drop by recency). MENTION is the floor — always admitted even
  if it pushes past budget (the `overflow` flag reports that; nothing renders below MENTION).
  `pin: true` atoms (e.g. PAST MISTAKES, FLIGHT §5.5) are non-trimmable — always FULL.
  Per RFC D3, SUMMARY/SKELETON were meant to ship only once expand() telemetry showed >= 20%
  of MENTION atoms get promoted; no run has produced that telemetry yet (Phase 1 never ran
  in anger). Shipped anyway as the additive, no-re-architecture work D3 describes it as —
  the 20% figure is a revisit-the-ship-decision signal, not a build-blocker.

USAGE:
    python orchestrator/governance/resolution_gradient.py plan request.json
    python orchestrator/governance/resolution_gradient.py plan request.json --atoms DIR --anchor ID
    cat request.json | python orchestrator/governance/resolution_gradient.py plan -
    python orchestrator/governance/resolution_gradient.py render SUMMARY path/to/atom.md
    python orchestrator/governance/resolution_gradient.py render SKELETON path/to/atom.md
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
import re
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
FULL, SUMMARY, SKELETON, MENTION = "FULL", "SUMMARY", "SKELETON", "MENTION"
TIER_ORDER = (FULL, SUMMARY, SKELETON, MENTION)          # demotion order (RFC D4)

# RFC D3 typical-token ranges for SUMMARY/SKELETON, used to DERIVE tokens_summary/
# tokens_skeleton from tokens_full when the caller passes only a FULL size estimate
# (chars/4) instead of a real rendered one. A caller that already rendered the atom
# (render_summary/render_skeleton, below) should pass the real size instead.
SUMMARY_RATIO, SUMMARY_MIN, SUMMARY_MAX = 0.15, 50, 300
SKELETON_RATIO, SKELETON_MIN, SKELETON_MAX = 0.04, 20, 60


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


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
        tokens_full = int(a["tokens_full"])
        tokens_summary = int(a.get(
            "tokens_summary",
            _clamp(round(tokens_full * SUMMARY_RATIO), SUMMARY_MIN, SUMMARY_MAX)))
        tokens_skeleton = int(a.get(
            "tokens_skeleton",
            _clamp(round(tokens_full * SKELETON_RATIO), SKELETON_MIN, SKELETON_MAX)))
        scored.append({
            "id": a["id"],
            "hops": hops,
            "sim": a.get("sim"),
            "score": round(sc, 6),
            "tokens_full": tokens_full,
            "tokens_summary": tokens_summary,
            "tokens_skeleton": tokens_skeleton,
            "tokens_mention": int(a.get("tokens_mention", DEFAULT_MENTION_TOKENS)),
            "pin": bool(a.get("pin", False)),
        })

    # Rank: pins first, then score desc, then id asc (deterministic tiebreak).
    ranked = sorted(scored, key=lambda x: (0 if x["pin"] else 1, -x["score"], x["id"]))

    tokens_key = {FULL: "tokens_full", SUMMARY: "tokens_summary",
                  SKELETON: "tokens_skeleton", MENTION: "tokens_mention"}

    used = 0
    demoted = []            # atoms rendered below FULL (SUMMARY, SKELETON, or MENTION)
    for a in ranked:
        if a["pin"]:
            a["tier"] = FULL
            a["tokens"] = a["tokens_full"]
            used += a["tokens_full"]
            continue
        # Cascade FULL -> SUMMARY -> SKELETON -> MENTION: take the highest tier that
        # still fits: MENTION is the floor and is always admitted (RFC D3/D4).
        for tier in TIER_ORDER:
            cost = a[tokens_key[tier]]
            if tier == MENTION or used + cost <= budget_tokens:
                a["tier"] = tier
                a["tokens"] = cost
                used += cost
                if tier != FULL:
                    demoted.append(a["id"])
                break

    n_full = sum(1 for a in ranked if a["tier"] == FULL)
    n_summary = sum(1 for a in ranked if a["tier"] == SUMMARY)
    n_skeleton = sum(1 for a in ranked if a["tier"] == SKELETON)
    n_mention = sum(1 for a in ranked if a["tier"] == MENTION)
    # Trim order for the UI (FLIGHT §5.5): non-pinned atoms not already at the MENTION
    # floor, in the order they demote next as the budget shrinks — lowest score first
    # (RFC D4: compress high-resolution first; nothing trims below MENTION).
    trim_order = [a["id"] for a in sorted(
        (x for x in ranked if x["tier"] != MENTION and not x["pin"]),
        key=lambda x: (x["score"], x["id"]))]

    return {
        "mode": "sim" if sim_mode else "hop-only",
        "weights": {"sim": w_sim, "hops": w_hops},
        "budget_tokens": budget_tokens,
        "used_tokens": used,
        "overflow": used > budget_tokens,
        "n_full": n_full,
        "n_summary": n_summary,
        "n_skeleton": n_skeleton,
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


# ---------------------------------------------------------------- renderers (Phase 2, RFC D3)
#
# assign() (above) decides HOW MUCH of an atom to show; these decide WHAT that looks
# like. Both are pure text transforms over one atom's markdown body (GKS atom format:
# YAML frontmatter, an H1 title line, `### <Section>` subsections) — no model call, so
# they belong in the deterministic core alongside the tier/budget math (CLAUDE.md: no
# LLM SDK calls in the core).

_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)
_TITLE_RE = re.compile(r"^#\s+(.+)$", re.MULTILINE)
_SECTION_HEAD_RE = re.compile(r"^###\s+(.+)$", re.MULTILINE)
_DESCRIPTION_RE = re.compile(r"^###\s*Description\s*\n(.*?)(?:\n#|\Z)", re.MULTILINE | re.DOTALL)


def parse_atom(text):
    """Pull the pieces a renderer needs out of one GKS atom .md body (pure parse, no IO)."""
    fm = _FRONTMATTER_RE.match(text)
    frontmatter = fm.group(1).strip() if fm else ""
    body = text[fm.end():] if fm else text
    title_m = _TITLE_RE.search(body)
    title = title_m.group(1).strip() if title_m else ""
    sections = [s.strip() for s in _SECTION_HEAD_RE.findall(body)]
    desc_m = _DESCRIPTION_RE.search(body)
    description = desc_m.group(1).strip() if desc_m else ""
    first_paragraph = description.split("\n\n", 1)[0].strip() if description else ""
    first_line = first_paragraph.splitlines()[0].strip() if first_paragraph else ""
    return {
        "frontmatter": frontmatter, "title": title, "sections": sections,
        "first_paragraph": first_paragraph, "first_line": first_line,
    }


def render_summary(atom_id, text):
    """RFC D3 SUMMARY: frontmatter + first paragraph + section headers (~50-300 tok)."""
    p = parse_atom(text)
    parts = []
    if p["frontmatter"]:
        parts.append("---\n" + p["frontmatter"] + "\n---")
    if p["title"]:
        parts.append(f"# {p['title']}")
    if p["first_paragraph"]:
        parts.append(p["first_paragraph"])
    if p["sections"]:
        parts.append("Sections: " + ", ".join(p["sections"]))
    return "\n\n".join(parts).strip() or atom_id


def render_skeleton(atom_id, text):
    """RFC D3 SKELETON: id + title + 1-line description (~20-60 tok)."""
    p = parse_atom(text)
    bits = [atom_id]
    if p["title"] and p["title"] != atom_id:
        bits.append(p["title"])
    if p["first_line"]:
        bits.append(p["first_line"])
    return " — ".join(bits)


RENDERERS = {SUMMARY: render_summary, SKELETON: render_skeleton}


# ---------------------------------------------------------------- reporting

def render(plan):
    w = sys.stderr.write
    w(f"\n=== resolution gradient  [{plan['mode']}]  "
      f"budget {plan['used_tokens']}/{plan['budget_tokens']} tok"
      f"{'  OVERFLOW' if plan['overflow'] else ''}\n")
    w(f"  weights sim={plan['weights']['sim']} hops={plan['weights']['hops']}  "
      f"FULL={plan['n_full']} SUMMARY={plan['n_summary']} SKELETON={plan['n_skeleton']} "
      f"MENTION={plan['n_mention']}  pinned={len(plan['pinned'])}\n")
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


def cmd_render(argv):
    if len(argv) < 2:
        sys.stderr.write("resolution_gradient.py: `render` needs <SUMMARY|SKELETON> <atom.md path>\n")
        return 2
    tier, path = argv[0].upper(), argv[1]
    renderer = RENDERERS.get(tier)
    if renderer is None:
        sys.stderr.write(f"resolution_gradient.py: render tier must be SUMMARY or SKELETON, got {tier!r}\n")
        return 2
    try:
        text = io.open(path, encoding="utf-8-sig").read()
    except Exception as e:                                   # noqa: BLE001
        sys.stderr.write(f"resolution_gradient.py: cannot read atom {path!r}: {e}\n")
        return 2
    atom_id = os.path.basename(path)
    if atom_id.endswith(".md"):
        atom_id = atom_id[:-3]
    print(renderer(atom_id, text))
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
        sys.stderr.write("resolution_gradient self-test: tier + budget math + renderers verified.\n")
        return 0
    if argv[0] == "plan":
        return cmd_plan(argv[1:])
    if argv[0] == "render":
        return cmd_render(argv[1:])
    sys.stderr.write(f"resolution_gradient.py: unknown command {argv[0]!r} "
                     f"(plan | render | --self-test | --help)\n")
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

    # mid budget -> cascades through all four tiers: top score FULL, next SUMMARY,
    # next SKELETON, none forced all the way to MENTION yet (RFC D3/D4).
    cascade = assign([a3, a1, a2], 170)
    tiers = {x["id"]: x["tier"] for x in cascade["atoms"]}
    check("cascade a1 FULL", tiers["a1"], FULL)
    check("cascade a2 SUMMARY", tiers["a2"], SUMMARY)
    check("cascade a3 SKELETON", tiers["a3"], SKELETON)
    check("cascade counts", (cascade["n_full"], cascade["n_summary"],
                             cascade["n_skeleton"], cascade["n_mention"]), (1, 1, 1, 0))
    check("cascade used", cascade["used_tokens"], 100 + 50 + 20)
    check("cascade no overflow", cascade["overflow"], False)

    # tight budget -> only the top score fits at FULL; MENTION is the floor for the rest
    # (never drops below it, even if that means overflowing the budget: RFC D3/D4).
    tight = assign([a3, a1, a2], 100)
    tiers = {x["id"]: x["tier"] for x in tight["atoms"]}
    check("tight a1 FULL", tiers["a1"], FULL)
    check("tight a2 MENTION", tiers["a2"], MENTION)
    check("tight a3 MENTION", tiers["a3"], MENTION)
    check("tight demoted", sorted(tight["demoted"]), ["a2", "a3"])
    check("tight used", tight["used_tokens"], 100 + 8 + 8)
    check("tight n_full", tight["n_full"], 1)
    check("tight overflow", tight["overflow"], True)

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

    # renderers (Phase 2, RFC D3) — pure text transforms, no file IO needed to self-test.
    fixture = (
        "---\n"
        "id: algo--example\n"
        "role: coder\n"
        "---\n\n"
        "# ALGO: Example Thing [L3-Logic] algo--example\n\n"
        "**Phase:** P0 · **Tier:** H2\n\n"
        "### Description\n"
        "A single swappable adapter that does the thing.\n"
        "Second sentence of the same paragraph.\n\n"
        "### Acceptance (DoD)\n"
        "Some acceptance text.\n\n"
        "### Depends on\n"
        "[[entity--atom-schema]]\n"
    )
    summ = render_summary("algo--example", fixture)
    check("summary keeps frontmatter", "id: algo--example" in summ, True)
    check("summary keeps title", "ALGO: Example Thing" in summ, True)
    check("summary keeps first paragraph",
          "A single swappable adapter that does the thing." in summ, True)
    check("summary lists section headers",
          "Sections: Description, Acceptance (DoD), Depends on" in summ, True)
    check("summary omits depends-on body", "entity--atom-schema" in summ, False)

    skel = render_skeleton("algo--example", fixture)
    check("skeleton is compact", skel,
          "algo--example — ALGO: Example Thing [L3-Logic] algo--example — "
          "A single swappable adapter that does the thing.")

    empty = render_summary("bare-id", "no frontmatter, no headings, just prose.")
    check("summary falls back to id when nothing parses", empty, "bare-id")

    return fails


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
