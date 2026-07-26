#!/usr/bin/env python3
"""w3_review_check.py — structural guard for policy `w3-lead-review` (SPEC §8).

SPEC--RWANG-STANDALONE-GOVERNANCE-FRAMEWORK §8:

    | W3 | Warning | 6-8 connections; lead review required |

The gap this closes: `requireReviewFor(t)` has three skip paths — global `review.enabled` off,
per-task `requireReview: false`, and `skipForDraft` (a task routed to a text-only/local model).
A W3 task (6-8 sibling/peer connections) could therefore dodge review by being cheap-routed or by
opting out — violating §8's "review required". The fix forces review ON above every skip for any
task whose fan-out degree is >= 6 (W3 and, once confirmed and dispatched, W4). No new gate: it
reuses the existing review machinery (`executeWithReview` -> `runReview`).

  V1  engine.mjs defines W3_MIN = 6, matching the SPEC §8 table (6-8 connections)
  V2  requireReviewFor() forces review true for degree >= W3_MIN AND places that force ABOVE the
      skip paths (enabled / requireReview:false / skipForDraft) — otherwise a skip would win first
  V3  the force uses fanoutDegree (the same undirected measure hop_metrics + the W4 gate use), so
      the W3 the guard forces == the W3 the audit reports
  V4  SPEC §8 W3 row still says "6-8" and "review required" (the doc side of the contract)

"lead" is read as "the review gate runs (unskippable), owned by the reviewer role (§7.2, read-only
per role-readonly-gate)". Escalating W3 to an architect-tier reviewer is a separate decision, not
implemented here — stated, not silently chosen.

USAGE:  python orchestrator/governance/w3_review_check.py              # self-test + real check
        python orchestrator/governance/w3_review_check.py --self-test  # fixtures only
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
    # V1 — threshold
    m = re.search(r"const\s+W3_MIN\s*=\s*(\d+)", engine_text)
    if not m:
        errors.append("V1 engine.mjs: W3_MIN constant not found")
    elif m.group(1) != "6":
        errors.append(f"V1 engine.mjs W3_MIN={m.group(1)} but SPEC §8 defines W3 as 6-8 connections")
    # V2/V3 — requireReviewFor forces review above the skips, using fanoutDegree
    body = _fn_body(engine_text, "requireReviewFor")
    if body is None:
        errors.append("V2 engine.mjs: requireReviewFor() not found")
    else:
        force = re.search(r"if\s*\(\s*fanoutDegree\(t\)\s*>=\s*W3_MIN\s*\)\s*return true", body)
        if not force:
            errors.append("V2/V3 requireReviewFor() has no `if (fanoutDegree(t) >= W3_MIN) return true` — "
                          "a W3 task could skip review via draft-routing or opt-out (SPEC §8 violated)")
        else:
            # V2 placement: the force must come BEFORE any `return false` skip, or a skip wins first
            skip = re.search(r"return false", body)
            if skip and skip.start() < force.start():
                errors.append("V2 the W3 review-force is placed AFTER a skip `return false` — the skip "
                              "would win first; move the force to the top of requireReviewFor()")
    # V4 — SPEC §8 doc side
    if spec_text is not None:
        row = re.search(r"\|\s*`?W3`?\s*\|.*?\|(.*?)\|", spec_text)
        if not row:
            errors.append("V4 SPEC §8: W3 table row not found")
        else:
            cell = row.group(1)
            if "6-8" not in cell and "6–8" not in cell:
                errors.append(f"V4 SPEC §8 W3 row no longer states the 6-8 range: {cell.strip()!r}")
            if "review" not in cell.lower():
                errors.append("V4 SPEC §8 W3 row dropped the 'review required' rule")
    return errors


GOOD_ENG = """
const W4_MIN = 9;
const W3_MIN = 6;
export function fanoutDegree(t) { return (t.deps || []).length; }
export function requireReviewFor(t) {
  if (fanoutDegree(t) >= W3_MIN) return true;
  if (!CONFIG.review?.enabled) return false;
  if (typeof t.requireReview === "boolean") return t.requireReview;
  return true;
}
"""
GOOD_SPEC = ("## 8. W Axis\n"
             "| `W3` | Warning | 6-8 connections; lead review required |\n"
             "| `W4` | Super-hub danger | 9+ connections; block until decomposed or approved |\n")


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
    expect("threshold wrong", GOOD_ENG.replace("W3_MIN = 6", "W3_MIN = 3"), GOOD_SPEC, "V1")
    expect("no force", GOOD_ENG.replace("  if (fanoutDegree(t) >= W3_MIN) return true;\n", ""), GOOD_SPEC, "V2")
    # placement: force AFTER a skip → the skip wins
    bad_place = GOOD_ENG.replace(
        "  if (fanoutDegree(t) >= W3_MIN) return true;\n  if (!CONFIG.review?.enabled) return false;",
        "  if (!CONFIG.review?.enabled) return false;\n  if (fanoutDegree(t) >= W3_MIN) return true;")
    expect("force after skip", bad_place, GOOD_SPEC, "V2")
    expect("spec range dropped", GOOD_ENG, GOOD_SPEC.replace("6-8 connections", "some connections"), "V4")
    expect("spec review dropped", GOOD_ENG, GOOD_SPEC.replace("lead review required", "nothing"), "V4")
    return fails


def main(argv):
    self_only = "--self-test" in argv
    unknown = [a for a in argv if a not in ("--self-test",)]
    if unknown:
        sys.stderr.write(f"w3_review_check.py: unknown arg {unknown[0]!r}\n{__doc__}")
        return 2
    st = self_test()
    if st:
        for f in st:
            sys.stderr.write(f"  SELFTEST FAIL: {f}\n")
        return 1
    if self_only:
        sys.stderr.write("w3_review_check self-test: all fixtures behaved.\n")
        return 0
    try:
        eng = open(os.path.join(ROOT, "engine.mjs"), "r", encoding="utf-8-sig").read()
    except OSError as e:
        sys.stderr.write(f"w3_review_check.py: cannot read engine.mjs: {e}\n")
        return 1
    spec = open(SPEC, "r", encoding="utf-8-sig").read() if os.path.isfile(SPEC) else None
    errors = check(eng, spec)
    for e in errors:
        sys.stderr.write(f"  ERROR: {e}\n")
    sys.stderr.write("W3 REVIEW OK — a >=6-degree task cannot skip review (SPEC §8 lead review).\n"
                     if not errors else
                     "W3 REVIEW BROKEN — a medium-coupling task can dodge review.\n")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
