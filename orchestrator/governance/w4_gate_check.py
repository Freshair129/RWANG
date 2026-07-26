#!/usr/bin/env python3
"""w4_gate_check.py — structural guard for policy `w4-superhub-gate` (SPEC §8, RCA follow-on).

SPEC--RWANG-STANDALONE-GOVERNANCE-FRAMEWORK §8 (law since 0.1.0b):

    | W4 | Super-hub danger | 9+ connections; block high-risk deployment until decomposed
                             or approved |

Until now §8 had a measurement (`hop_metrics.py` names the W4 hubs) but NO gate — the same
"rule with no police" shape §7.2 had before B3, and §13 lists "gates cannot be bypassed by
daemon" as a requirement. This guard proves the W4 rule is wired at the dispatch point and
cannot regress:

  G1  engine.mjs defines the W4 threshold as 9, matching the SPEC §8 table (>= 9 connections)
  G2  engine.mjs computes an UNDIRECTED fan-out degree (own deps + tasks depending on it) —
      the same degree hop_metrics.py reports, so the gate blocks exactly the W4 the audit names
  G3  needsConfirm() consults isW4(), so a W4 task routes through the EXISTING confirm gate
      (no second gate invented): "approved" = confirm, "decomposed" = drop the degree under 9
  G4  the SPEC §8 W4 row still says ">= 9 / 9+" and "block ... until decomposed or approved"
      (the doc side of the doc<->code contract, like doc_lint's X1 for H tiers)

Structural check (mechanism present); the e2e proof — a 9-degree task refused at dispatch,
an 8-degree task allowed — runs at the runnable origin's smoke.

USAGE:  python orchestrator/governance/w4_gate_check.py              # self-test + real check
        python orchestrator/governance/w4_gate_check.py --self-test  # fixtures only
EXIT:   0 ok · 1 violation · 2 usage error
Deterministic, stdlib-only.
"""
import os
import re
import sys

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SPEC = os.path.join(ROOT, "docs", "SPEC--RWANG-STANDALONE-GOVERNANCE-FRAMEWORK.md")


def _fn_body(text, name):
    m = re.search(rf"(?:export\s+)?function {name}\s*\([^)]*\)\s*\{{", text)
    if not m:
        return None
    tail = text[m.end():]
    nxt = re.search(r"\n(?:export\s+)?(?:async\s+)?function \w+|\nexport (?:const|let|class) ", tail)
    return tail[: nxt.start()] if nxt else tail


def check(engine_text, spec_text):
    errors = []
    # G1 — threshold constant = 9
    m = re.search(r"const\s+W4_MIN\s*=\s*(\d+)", engine_text)
    if not m:
        errors.append("G1 engine.mjs: W4_MIN constant not found")
    elif m.group(1) != "9":
        errors.append(f"G1 engine.mjs W4_MIN={m.group(1)} but SPEC §8 defines W4 as >= 9")
    # G2 — undirected degree (out + in)
    deg = _fn_body(engine_text, "fanoutDegree")
    if deg is None:
        errors.append("G2 engine.mjs: fanoutDegree() not found")
    else:
        if "deps" not in deg:
            errors.append("G2 fanoutDegree() does not read out-degree (t.deps)")
        if "BACKLOG" not in deg or "includes(t.id)" not in deg:
            errors.append("G2 fanoutDegree() does not count in-degree (tasks depending on t.id) — "
                          "degree must be undirected to match hop_metrics.py")
    if "function isW4" not in engine_text:
        errors.append("G2 engine.mjs: isW4() helper not found")
    # G3 — the existing confirm gate consults isW4
    nc = _fn_body(engine_text, "needsConfirm")
    if nc is None:
        errors.append("G3 engine.mjs: needsConfirm() not found")
    elif "isW4(t)" not in nc:
        errors.append("G3 needsConfirm() does not consult isW4() — a W4 super-hub would dispatch "
                      "without the approval SPEC §8 requires")
    # G4 — SPEC §8 doc side
    if spec_text is not None:
        row = re.search(r"\|\s*`?W4`?\s*\|.*?\|(.*?)\|", spec_text)
        if not row:
            errors.append("G4 SPEC §8: W4 table row not found")
        else:
            cell = row.group(1)
            if not re.search(r"9\+|>=\s*9|≥\s*9", cell):
                errors.append(f"G4 SPEC §8 W4 row no longer states the 9+ threshold: {cell.strip()!r}")
            if "decompos" not in cell.lower() and "approv" not in cell.lower():
                errors.append("G4 SPEC §8 W4 row dropped the 'decompose or approve' escape")
    return errors


GOOD_ENG = """
const W4_MIN = 9;
export function fanoutDegree(t) {
  const out = (t.deps || []).length;
  const inc = BACKLOG.reduce((n, x) => n + ((x.deps || []).includes(t.id) ? 1 : 0), 0);
  return out + inc;
}
export function isW4(t) { return fanoutDegree(t) >= W4_MIN; }
export function needsConfirm(t) {
  if (t.requiresConfirm) return true;
  if (isW4(t)) return true;
  return false;
}
"""
GOOD_SPEC = ("## 8. W Axis\n"
             "| `W4` | Super-hub danger | 9+ connections; block high-risk deployment until "
             "decomposed or approved |\n")


def self_test():
    fails = []

    def expect(label, eng, spec, want):
        errs = check(eng, spec)
        blob = " ".join(errs)
        if want is None:
            if errs:
                fails.append(f"{label}: expected clean, got {errs}")
        elif want not in blob:
            fails.append(f"{label}: expected error containing {want!r}, got {errs}")

    expect("good", GOOD_ENG, GOOD_SPEC, None)
    expect("threshold wrong", GOOD_ENG.replace("W4_MIN = 9", "W4_MIN = 5"), GOOD_SPEC, "G1")
    expect("no in-degree", GOOD_ENG.replace("const inc = BACKLOG.reduce((n, x) => n + ((x.deps || []).includes(t.id) ? 1 : 0), 0);", "const inc = 0;"), GOOD_SPEC, "G2")
    expect("gate bypassed", GOOD_ENG.replace("if (isW4(t)) return true;", ""), GOOD_SPEC, "G3")
    expect("spec threshold dropped", GOOD_ENG, GOOD_SPEC.replace("9+ connections", "many connections"), "G4")
    expect("spec escape dropped", GOOD_ENG, GOOD_SPEC.replace("until decomposed or approved", "always"), "G4")
    return fails


def main(argv):
    self_only = "--self-test" in argv
    unknown = [a for a in argv if a not in ("--self-test",)]
    if unknown:
        sys.stderr.write(f"w4_gate_check.py: unknown arg {unknown[0]!r}\n{__doc__}")
        return 2
    st = self_test()
    if st:
        for f in st:
            sys.stderr.write(f"  SELFTEST FAIL: {f}\n")
        return 1
    if self_only:
        sys.stderr.write("w4_gate_check self-test: all fixtures behaved.\n")
        return 0
    try:
        eng = open(os.path.join(ROOT, "engine.mjs"), "r", encoding="utf-8-sig").read()
    except OSError as e:
        sys.stderr.write(f"w4_gate_check.py: cannot read engine.mjs: {e}\n")
        return 1
    spec = open(SPEC, "r", encoding="utf-8-sig").read() if os.path.isfile(SPEC) else None
    errors = check(eng, spec)
    for e in errors:
        sys.stderr.write(f"  ERROR: {e}\n")
    sys.stderr.write("W4 GATE OK — a >=9-degree super-hub cannot dispatch without confirm (SPEC §8).\n"
                     if not errors else
                     "W4 GATE BROKEN — a super-hub can deploy without decomposition or approval.\n")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
