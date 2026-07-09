#!/usr/bin/env python3
"""access_scope_check.py — structural guard for policy `access-scope-enforcement` (RCA Phase B2 #1).

The defect class this guards against: the Access Scope contract (SPEC 0.6.0 §5) existing on
paper while the spawn path enforces something else — exactly how tierTools sat as dead code
while dispatch ran binary safe/full. This guard proves the wiring EXISTS and stays coherent:

  A1  config.json providers.claude.tierPermissions covers exactly H0..H4 (ignoring _keys),
      every value names a real providers.claude.permissionModes profile, and the profile
      rank is non-decreasing from H0 to H4 (rank: read < safe < shell < full)
  A2  the mapping equals the lint-locked EXPECTED table below — changing the ceiling map is
      a deliberate act: edit config.json and this tuple in the same commit (same pattern as
      governance_lint.REQUIRED_ENFORCED)
  A3  engine.mjs permissionFor() consumes tierPermissions with ceiling semantics (PERM_RANK
      comparison present) — not just any mention somewhere in the file
  A4  planner.mjs tierTools unlock thresholds stay consistent with the profile map
      (write unlocks at index 2 ↔ H0/H1 are read-tier; shell at 3 ↔ H3; network at 4 ↔ H4)

Structural check: proves the mechanism is present and coherent, not an e2e spawn test —
the e2e smoke belongs to the engine's runnable origin before the policy flips to enforced.

USAGE:  python orchestrator/governance/access_scope_check.py              # self-test + real check
        python orchestrator/governance/access_scope_check.py --self-test  # fixtures only
EXIT:   0 ok · 1 violation · 2 usage error
Deterministic, stdlib-only.
"""
import json
import os
import re
import sys

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

RANK = {"read": 0, "safe": 1, "shell": 2, "full": 3}
TIERS = ["H0", "H1", "H2", "H3", "H4"]
# Lint-locked ceiling map (A2). Edit together with config.json, never one side alone.
EXPECTED = {"H0": "read", "H1": "read", "H2": "safe", "H3": "shell", "H4": "full"}


def check(config_text, engine_text, planner_text):
    errors = []
    # A1/A2 — config coherence
    try:
        cfg = json.loads(config_text)
    except json.JSONDecodeError as e:
        return [f"A1 config.json unparseable: {e}"]
    claude = (cfg.get("providers") or {}).get("claude") or {}
    tp = {k: v for k, v in (claude.get("tierPermissions") or {}).items() if not k.startswith("_")}
    modes = {k for k in (claude.get("permissionModes") or {}) if not k.startswith("_")}
    if sorted(tp) != TIERS:
        errors.append(f"A1 tierPermissions keys must be exactly {TIERS}, got {sorted(tp)}")
    else:
        for t in TIERS:
            if tp[t] not in modes:
                errors.append(f"A1 tierPermissions[{t}]={tp[t]!r} names no permissionModes profile")
            elif tp[t] not in RANK:
                errors.append(f"A1 tierPermissions[{t}]={tp[t]!r} has no rank (allowed: {sorted(RANK)})")
        ranks = [RANK.get(tp.get(t), -1) for t in TIERS]
        if all(r >= 0 for r in ranks) and any(ranks[i] > ranks[i + 1] for i in range(len(ranks) - 1)):
            errors.append(f"A1 profile rank must be non-decreasing H0→H4, got {ranks}")
        if tp and tp != EXPECTED:
            errors.append(f"A2 ceiling map diverges from the lint-locked EXPECTED table: {tp} != {EXPECTED} "
                          "(edit config.json and this guard's EXPECTED in the same commit)")
    # A3 — engine consumes the map with ceiling semantics
    m = re.search(r"function permissionFor\s*\([^)]*\)\s*\{(.*?)\n\}", engine_text, re.DOTALL)
    if not m:
        errors.append("A3 engine.mjs: permissionFor() not found")
    else:
        body = m.group(1)
        if "tierPermissions" not in body:
            errors.append("A3 engine.mjs permissionFor() does not consume tierPermissions (dead-map)")
        if "PERM_RANK" not in body:
            errors.append("A3 engine.mjs permissionFor() lacks PERM_RANK ceiling comparison")
    # A4 — planner tierTools thresholds stay consistent with the profile map
    tt = re.search(r"function tierTools\s*\([^)]*\)\s*\{(.*?)\n\}", planner_text, re.DOTALL)
    if not tt:
        errors.append("A4 planner.mjs: tierTools() not found")
    else:
        body = tt.group(1)
        for cap, idx in (("write", 2), ("shell", 3), ("network", 4)):
            if not re.search(rf"{cap}:\s*idx\s*>=\s*{idx}\b", body):
                errors.append(f"A4 planner.mjs tierTools: expected `{cap}: idx >= {idx}` — capability "
                              "unlock thresholds drifted from the H0..H4 profile map")
    return errors


def self_test():
    good_cfg = json.dumps({"providers": {"claude": {
        "permissionModes": {"read": [], "safe": [], "shell": [], "full": []},
        "tierPermissions": dict(EXPECTED, _comment="x")}}})
    good_eng = ("const PERM_RANK = { read: 0 };\n"
                "function permissionFor(t) {\n  const x = CONFIG.providers?.claude?.tierPermissions;\n"
                "  return PERM_RANK[x] ? 1 : 2;\n}\n")
    good_pln = ("function tierTools(tier) {\n  const idx = 0;\n"
                "  return { read: true, glob: idx >= 1, grep: idx >= 1, multiFile: idx >= 2,\n"
                "    write: idx >= 2, shell: idx >= 3, network: idx >= 4 };\n}\n")
    fails = []

    def expect(label, cfg, eng, pln, want):
        errs = check(cfg, eng, pln)
        blob = " ".join(errs)
        if want is None:
            if errs:
                fails.append(f"{label}: expected clean, got {errs}")
        elif want not in blob:
            fails.append(f"{label}: expected error containing {want!r}, got {errs}")

    expect("good", good_cfg, good_eng, good_pln, None)
    bad_missing = json.dumps({"providers": {"claude": {
        "permissionModes": {"read": [], "safe": [], "shell": [], "full": []},
        "tierPermissions": {"H0": "read", "H1": "read", "H2": "safe", "H3": "shell"}}}})
    expect("missing H4", bad_missing, good_eng, good_pln, "A1")
    bad_map = good_cfg.replace('"H3": "shell"', '"H3": "full"').replace('"H4": "full"', '"H4": "shell"')
    expect("non-monotonic / diverged", bad_map, good_eng, good_pln, "A1")
    bad_alias = good_cfg.replace('"H2": "safe"', '"H2": "sandbox"')
    expect("unknown profile", bad_alias, good_eng, good_pln, "A1")
    expect("dead map", good_cfg, "function permissionFor(t) {\n  return 'full';\n}", good_pln, "A3")
    expect("no ceiling", good_cfg,
           "function permissionFor(t) {\n  return CONFIG.providers?.claude?.tierPermissions?.H0;\n}",
           good_pln, "A3")
    expect("drifted thresholds", good_cfg, good_eng,
           good_pln.replace("shell: idx >= 3", "shell: idx >= 1"), "A4")
    return fails


def main(argv):
    self_only = "--self-test" in argv
    unknown = [a for a in argv if a not in ("--self-test",)]
    if unknown:
        sys.stderr.write(f"access_scope_check.py: unknown arg {unknown[0]!r}\n{__doc__}")
        return 2
    st = self_test()
    if st:
        for f in st:
            sys.stderr.write(f"  SELFTEST FAIL: {f}\n")
        return 1
    if self_only:
        sys.stderr.write("access_scope_check self-test: all fixtures behaved.\n")
        return 0
    try:
        cfg = open(os.path.join(ROOT, "config.json"), "r", encoding="utf-8-sig").read()
        eng = open(os.path.join(ROOT, "engine.mjs"), "r", encoding="utf-8-sig").read()
        pln = open(os.path.join(ROOT, "planner.mjs"), "r", encoding="utf-8-sig").read()
    except OSError as e:
        sys.stderr.write(f"access_scope_check.py: cannot read repo files: {e}\n")
        return 1
    errors = check(cfg, eng, pln)
    for e in errors:
        sys.stderr.write(f"  ERROR: {e}\n")
    sys.stderr.write("ACCESS SCOPE WIRING OK — ceiling map coherent, engine consumes it, thresholds aligned.\n"
                     if not errors else
                     "ACCESS SCOPE WIRING BROKEN — the contract and the spawn path have drifted apart.\n")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
