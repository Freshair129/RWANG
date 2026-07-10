#!/usr/bin/env python3
"""hop_metrics.py — measure the graph the H/R axes were always talking about (RCA Phase D).

RFC--H-AXIS-0.6.0 D3/D4 removed hop language from binding text with a promise: hops return once
they are MEASURED on a real graph, and the ceiling becomes a DERIVED parameter, not the number 6
borrowed from a 1967 letter experiment. This tool is that measurement. It is a health report, not
a gate: per D4 an over-radius node never blocks an agent — it means the graph is missing a hub or
the task was scoped too wide. Coupling (super-hubs) is the W axis, and this tool names them.

GRAPHS IT CAN READ (both real, both in-repo, no new storage):
  --atoms <dir>     GKS atom graph: `### Depends on` wikilinks `[[atom-id]]` (the graph GVDOC-1003
                    describes: knowledge nodes, retrieval traverses both directions)
  --backlog <json>  task DAG: tasks[].deps (a dependency chain, NOT a knowledge graph — see below)

WHAT IT COMPUTES (deterministic, stdlib only, BFS):
  nodes/edges/components · acyclicity · DAG depth (layer count)
  derived ceiling = 2 x (depth - 1)   — a walk up and back down a `depth`-layer hierarchy
  diameter · average path length · clustering coefficient   (the small-world pair POC-H6 names)
  degree distribution -> W-scale (W2 0-5 · W3 6-8 lead review · W4 >=9 super-hub)
  per-node eccentricity -> nodes that need more than the derived ceiling to reach the far side

MEASURED 2026-07-10 (the numbers that motivated this tool):
  GKS atoms   37 nodes, 55 edges, depth 5 -> ceiling 8 | diameter 7, APL 3.05, clustering 0.228
              => the fixed constant 6 FAILS (diameter 7); the DERIVED ceiling 8 HOLDS.
              => small-world confirmed on the metric that actually carries the claim: average
                 path length 3.05, clustering ~2.8x a random graph of the same density.
                 "Six degrees" is a statement about TYPICAL paths, not the worst pair, so
                 reducing the reach precondition to `diameter <= 6` (POC-H6 §2) is both stricter
                 than the theory and false here. Average path length is the honest metric.
  backlog DAG 45 nodes, 53 edges, depth 13 | diameter 14, APL 5.30, clustering 0.035
              => NOT small-world (a long dependency chain). Radius semantics do not transfer from
                 the knowledge graph to the task DAG; do not read `R` tiers off this graph.

USAGE:
    python orchestrator/governance/hop_metrics.py                      # every graph it can find
    python orchestrator/governance/hop_metrics.py --atoms D:/rwang/RWANG/gks/atoms
    python orchestrator/governance/hop_metrics.py --backlog backlog.json --json
    python orchestrator/governance/hop_metrics.py --strict             # exit 1 on W4 or over-ceiling
    python orchestrator/governance/hop_metrics.py --self-test          # fixtures only
EXIT:   0 ok (warnings are not failures — D4) · 1 self-test failure, or --strict violation
        2 usage error
"""
import io
import json
import os
import re
import sys
from collections import defaultdict, deque

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

W3_MIN, W4_MIN = 6, 9          # SPEC §8: W2 0-5 · W3 6-8 (lead review) · W4 >=9 (super-hub)


# ---------------------------------------------------------------- graph math

def _bfs(adj, src):
    """Distances from src over the undirected view. Retrieval reaches both ways."""
    dist = {src: 0}
    q = deque([src])
    while q:
        u = q.popleft()
        for v in adj[u]:
            if v not in dist:
                dist[v] = dist[u] + 1
                q.append(v)
    return dist


def _undirected(nodes, edges):
    adj = defaultdict(set)
    for n in nodes:
        adj[n]
    for a, b in edges:
        if a == b:
            continue
        adj[a].add(b)
        adj[b].add(a)
    return adj


def _dag_depth(nodes, edges):
    """Longest path in layers (1 = a single node). Returns (depth, acyclic)."""
    succ = defaultdict(list)
    indeg = defaultdict(int)
    for n in nodes:
        indeg[n] += 0
    for a, b in edges:
        if a == b:
            continue
        succ[a].append(b)
        indeg[b] += 1
    depth = {n: 1 for n in nodes}
    q = deque(n for n in nodes if indeg[n] == 0)
    left = dict(indeg)
    seen = 0
    while q:
        u = q.popleft()
        seen += 1
        for v in succ[u]:
            depth[v] = max(depth[v], depth[u] + 1)
            left[v] -= 1
            if left[v] == 0:
                q.append(v)
    return (max(depth.values()) if depth else 0), seen == len(nodes)


def _clustering(adj, nodes):
    vals = []
    for n in nodes:
        nb = list(adj[n])
        k = len(nb)
        if k < 2:
            continue
        links = sum(1 for i in range(k) for j in range(i + 1, k) if nb[j] in adj[nb[i]])
        vals.append(2 * links / (k * (k - 1)))
    return sum(vals) / len(vals) if vals else 0.0


def analyze(name, nodes, edges):
    nodes = set(nodes)
    edges = [(a, b) for a, b in edges if a in nodes and b in nodes]
    if not nodes:
        return {"graph": name, "error": "empty graph"}
    adj = _undirected(nodes, edges)
    deg = {n: len(adj[n]) for n in nodes}

    seen, comps = set(), []
    for n in sorted(nodes):
        if n in seen:
            continue
        d = _bfs(adj, n)
        comps.append(set(d))
        seen |= set(d)
    big = max(comps, key=len)

    ecc, total, pairs = {}, 0, 0
    for n in big:
        d = _bfs(adj, n)
        ecc[n] = max(d.values())
        total += sum(d.values())
        pairs += len(d) - 1
    diameter = max(ecc.values())
    apl = total / pairs if pairs else 0.0

    depth, acyclic = _dag_depth(nodes, edges)
    ceiling = 2 * (depth - 1) if depth > 1 else 1

    over = sorted(n for n in big if ecc[n] > ceiling)
    w4 = sorted(n for n in nodes if deg[n] >= W4_MIN)
    w3 = sorted(n for n in nodes if W3_MIN <= deg[n] < W4_MIN)

    return {
        "graph": name,
        "nodes": len(nodes), "edges": len(edges),
        "components": len(comps), "largest_component": len(big), "acyclic": acyclic,
        "dag_depth": depth, "derived_ceiling": ceiling,
        "diameter": diameter, "avg_path_length": round(apl, 3),
        "clustering": round(_clustering(adj, nodes), 3),
        "degree_max": max(deg.values()), "degree_mean": round(sum(deg.values()) / len(nodes), 2),
        "w3_warning": w3, "w4_superhub": w4,
        "over_ceiling": over,
        "small_world_hint": round(apl, 3) <= ceiling and _clustering(adj, nodes) > (sum(deg.values()) / len(nodes)) / len(nodes),
    }


# ---------------------------------------------------------------- sources

def read_atoms(path):
    nodes, edges = set(), []
    for f in sorted(os.listdir(path)):
        if not f.endswith(".md"):
            continue
        aid = f[:-3]
        nodes.add(aid)
        txt = io.open(os.path.join(path, f), encoding="utf-8-sig").read()
        m = re.search(r"###\s*Depends on\s*\n(.*?)(?:\n#|\Z)", txt, re.DOTALL)
        if not m:
            continue
        for target in re.findall(r"\[\[([^\]]+)\]\]", m.group(1)):
            t = target.strip()
            nodes.add(t)
            edges.append((aid, t))
    return nodes, edges


def read_backlog(path):
    data = json.loads(io.open(path, encoding="utf-8-sig").read())
    tasks = data.get("tasks", data if isinstance(data, list) else [])
    nodes = {t["id"] for t in tasks}
    edges = [(d, t["id"]) for t in tasks for d in (t.get("deps") or []) if d in nodes]
    return nodes, edges


# ---------------------------------------------------------------- reporting

def render(r):
    w = sys.stderr.write
    if "error" in r:
        w(f"=== {r['graph']}: {r['error']}\n")
        return
    w(f"\n=== {r['graph']}\n")
    w(f"  nodes={r['nodes']} edges={r['edges']} components={r['components']} "
      f"(largest={r['largest_component']}) acyclic={r['acyclic']}\n")
    w(f"  DAG depth={r['dag_depth']} layers  ->  derived ceiling 2x(depth-1) = {r['derived_ceiling']} hops\n")
    w(f"  diameter={r['diameter']}  avg_path_length={r['avg_path_length']}  clustering={r['clustering']}\n")
    w(f"  degree: max={r['degree_max']} mean={r['degree_mean']}\n")
    if r["w4_superhub"]:
        w(f"  W4 SUPER-HUB (>= {W4_MIN} deg — SPEC §8: decompose or approve before high-risk deploy):\n")
        for n in r["w4_superhub"]:
            w(f"      {n}\n")
    if r["w3_warning"]:
        w(f"  W3 warning ({W3_MIN}-{W4_MIN - 1} deg — lead review): {', '.join(r['w3_warning'])}\n")
    if r["over_ceiling"]:
        w(f"  OVER DERIVED CEILING ({len(r['over_ceiling'])} node(s) need > {r['derived_ceiling']} hops):\n")
        w("      a missing hub/summary node, or a task scoped too wide — NOT evidence of spaghetti\n")
        for n in r["over_ceiling"][:8]:
            w(f"      {n}\n")
    if not r["w4_superhub"] and not r["over_ceiling"]:
        w("  healthy: no super-hub, every node within the derived ceiling\n")


def main(argv):
    atoms = backlog = None
    json_only = strict = self_only = False
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--atoms" and i + 1 < len(argv):
            atoms = argv[i + 1]; i += 2
        elif a == "--backlog" and i + 1 < len(argv):
            backlog = argv[i + 1]; i += 2
        elif a == "--json":
            json_only = True; i += 1
        elif a == "--strict":
            strict = True; i += 1
        elif a == "--self-test":
            self_only = True; i += 1
        elif a in ("-h", "--help"):
            sys.stderr.write(__doc__); return 2
        else:
            sys.stderr.write(f"hop_metrics.py: unknown arg {a!r}\n"); return 2

    fails = self_test()
    if fails:
        for f in fails:
            sys.stderr.write(f"  SELFTEST FAIL: {f}\n")
        return 1
    if self_only:
        sys.stderr.write("hop_metrics self-test: graph math verified on known fixtures.\n")
        return 0

    if atoms is None and backlog is None:
        backlog = os.path.join(ROOT, "backlog.json")
        for cand in (r"D:/rwang/RWANG/gks/atoms", os.path.join(ROOT, "gks", "atoms")):
            if os.path.isdir(cand):
                atoms = cand
                break

    reports = []
    if atoms and os.path.isdir(atoms):
        n, e = read_atoms(atoms)
        reports.append(analyze(f"atom graph ({atoms})", n, e))
    if backlog and os.path.isfile(backlog):
        n, e = read_backlog(backlog)
        reports.append(analyze(f"task DAG ({os.path.basename(backlog)})", n, e))
    if not reports:
        sys.stderr.write("hop_metrics.py: no graph source found (pass --atoms or --backlog)\n")
        return 2

    print(json.dumps({"self_test": "pass", "graphs": reports}, ensure_ascii=False, indent=2))
    if not json_only:
        for r in reports:
            render(r)
        sys.stderr.write("\nhop metrics are a HEALTH REPORT (RFC D4): an over-ceiling node never "
                         "blocks an agent — it is a graph or scoping smell.\n")
    if strict:
        bad = [r for r in reports if r.get("w4_superhub") or r.get("over_ceiling")]
        return 1 if bad else 0
    return 0


# ---------------------------------------------------------------- self-test

def self_test():
    """Verify the graph math against hand-computable fixtures."""
    fails = []

    def check(label, got, want):
        if got != want:
            fails.append(f"{label}: got {got}, want {want}")

    # path P5: a-b-c-d-e  → diameter 4, depth 5, ceiling 8, clustering 0, degrees 1..2
    p5 = analyze("p5", list("abcde"), [("a", "b"), ("b", "c"), ("c", "d"), ("d", "e")])
    check("P5 diameter", p5["diameter"], 4)
    check("P5 depth", p5["dag_depth"], 5)
    check("P5 ceiling", p5["derived_ceiling"], 8)
    check("P5 clustering", p5["clustering"], 0.0)
    check("P5 apl", p5["avg_path_length"], 2.0)   # mean of all ordered pairs = 2.0
    check("P5 components", p5["components"], 1)

    # triangle: clustering 1, diameter 1
    tri = analyze("tri", list("abc"), [("a", "b"), ("b", "c"), ("a", "c")])
    check("triangle clustering", tri["clustering"], 1.0)
    check("triangle diameter", tri["diameter"], 1)

    # star with 9 leaves: hub degree 9 → W4; diameter 2
    star_n = ["hub"] + [f"l{i}" for i in range(9)]
    star = analyze("star", star_n, [("hub", f"l{i}") for i in range(9)])
    check("star W4", star["w4_superhub"], ["hub"])
    check("star diameter", star["diameter"], 2)
    check("star degree_max", star["degree_max"], 9)

    # star with 7 leaves → W3 warning, no W4
    s7 = analyze("s7", ["h"] + [f"x{i}" for i in range(7)], [("h", f"x{i}") for i in range(7)])
    check("s7 W3", s7["w3_warning"], ["h"])
    check("s7 W4", s7["w4_superhub"], [])

    # two components + a cycle → acyclic False, components 2
    cyc = analyze("cyc", list("abcz"), [("a", "b"), ("b", "c"), ("c", "a")])
    check("cycle acyclic", cyc["acyclic"], False)
    check("cycle components", cyc["components"], 2)

    # over-ceiling detection: P4 has depth 4 → ceiling 6; a P9 chain (depth 9, ceiling 16) is fine,
    # but force a small ceiling case: P3 (depth 3, ceiling 4), diameter 2 → nothing over
    p3 = analyze("p3", list("abc"), [("a", "b"), ("b", "c")])
    check("P3 over_ceiling", p3["over_ceiling"], [])
    return fails


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
