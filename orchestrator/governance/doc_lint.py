#!/usr/bin/env python3
"""doc_lint.py — canonical-document governance guard (policy `doc-governance`).

Origin: RCA--GOVERNANCE-FRAMEWORK-DRIFT §6 Phase B — "the contract that gates
everything must itself be gated". The 0.4.0b failure mode was a governance doc
that drifted (3 unreviewed same-day bumps, undefined approval semantics) while a
live doc<->code mismatch (SPEC named H6; planner.mjs H_TIERS stopped at H5) sat
undetected. This guard makes both classes of drift a lint failure.

A CANONICAL doc is any docs/*.md whose YAML frontmatter carries `version`,
`status` AND `attributes.doc_type` (the SPEC--RWANG-STANDALONE-GOVERNANCE-
FRAMEWORK §12 format). Plain-markdown docs are skipped (listed as warnings) —
the contract binds documents that claim its format, not legacy notes.

CHECKS (deterministic):
  D1  frontmatter keys: version, created_at, last_update, status, superseded_by,
      attributes{domain, doc_type, scope, language}
  D2  status in {draft, candidate, active, deprecated, superseded}   (SPEC §12)
  D3  version matches N.N.N with optional trailing `b`
  D4  `b` suffix iff status is draft/candidate (pre-approval)        (SPEC §12)
  D5  a CHANGELOG table exists with columns >= {Version, Date, Status, Summary,
      Agent} (order-free; extra columns allowed)                     (SPEC §12)
  D6  some changelog row's Version equals the frontmatter version
  W1  warn: >=2 changelog rows share (Date, Agent) — the unreviewed same-day
      bump cluster that produced 0.4.0b (warning until a Reviewer column
      convention exists; flipping to error is a deliberate future change)
  X1  doc<->code: every `H<n>` tier named in the governance SPEC exists in
      planner.mjs H_TIERS (the silent-H6 bug class)
  X2  the SPEC §3 axis table uses each axis letter exactly once

USAGE:
    python orchestrator/governance/doc_lint.py              # self-test fixtures, then repo lint
    python orchestrator/governance/doc_lint.py --self-test  # fixtures only
    python orchestrator/governance/doc_lint.py --docs-dir docs --json
OUTPUT: pretty summary -> stderr, JSON -> stdout (same convention as governance_lint.py).
EXIT:   0 ok · 1 violation · 2 usage error · 3 PyYAML missing
Deterministic, stdlib-only + PyYAML (the one allowed non-stdlib dep).
"""
import json
import os
import re
import sys
import tempfile

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

VALID_STATUS = ("draft", "candidate", "active", "deprecated", "superseded")
PRE_APPROVAL = ("draft", "candidate")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+b?$")
REQUIRED_KEYS = ("version", "created_at", "last_update", "status", "superseded_by", "attributes")
REQUIRED_ATTRS = ("domain", "doc_type", "scope", "language")
REQUIRED_CHANGELOG_COLS = {"version", "date", "status", "summary", "agent"}
CHANGELOG_HEAD_RE = re.compile(r"^#{1,6}\s*(?:\d+\.\s*)?CHANGELOG\b", re.IGNORECASE | re.MULTILINE)
SPEC_NAME = "SPEC--RWANG-STANDALONE-GOVERNANCE-FRAMEWORK.md"
PLANNER_REL = "planner.mjs"


def _yaml():
    try:
        import yaml
        return yaml
    except ImportError:
        sys.stderr.write("doc_lint.py: PyYAML is required (same dependency governance_lint.py has).\n")
        sys.exit(3)


def parse_frontmatter(text):
    """Return (frontmatter dict or None, reason). Canonical detection is the caller's job."""
    if not text.startswith("---"):
        return None, "no frontmatter"
    m = re.match(r"^---\s*\n(.*?)\n---\s*(?:\n|$)", text, re.DOTALL)
    if not m:
        return None, "unterminated frontmatter"
    try:
        fm = _yaml().safe_load(m.group(1))
    except Exception as e:
        return None, f"frontmatter unparseable: {e}"
    if not isinstance(fm, dict):
        return None, "frontmatter is not a mapping"
    return fm, ""


def is_canonical(fm):
    return (isinstance(fm, dict) and "version" in fm and "status" in fm
            and isinstance(fm.get("attributes"), dict) and "doc_type" in fm["attributes"])


def parse_changelog(text):
    """Return (columns:list[str] lowered, rows:list[dict]) of the first table after a CHANGELOG heading, or (None, [])."""
    h = CHANGELOG_HEAD_RE.search(text)
    if not h:
        return None, []
    lines = text[h.end():].splitlines()
    header, rows = None, []
    for ln in lines:
        s = ln.strip()
        if not s.startswith("|"):
            if header is not None:
                break  # table ended
            if s and not s.startswith("|") and s.startswith("#"):
                break  # next section before any table
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if header is None:
            header = [c.lower() for c in cells]
            continue
        if set(c.strip("-: ") for c in cells) <= {""}:
            continue  # separator row
        rows.append(dict(zip(header, cells)))
    return header, rows


def lint_doc(path, text, errors, warnings):
    name = os.path.basename(path)
    fm, why = parse_frontmatter(text)
    if fm is None:
        # a file that LOOKS like it wants frontmatter but is broken is an error;
        # plain markdown is simply not canonical.
        if text.startswith("---"):
            errors.append(f"{name}: {why}")
            return "ERROR"
        return "SKIP"
    if not is_canonical(fm):
        return "SKIP"

    verdict = "PASS"

    def err(msg):
        nonlocal verdict
        errors.append(f"{name}: {msg}")
        verdict = "FAIL"

    # D1
    for k in REQUIRED_KEYS:
        if k not in fm:
            err(f"D1 frontmatter missing key {k!r}")
    attrs = fm.get("attributes") or {}
    for k in REQUIRED_ATTRS:
        if not isinstance(attrs, dict) or k not in attrs:
            err(f"D1 frontmatter missing attributes.{k}")
    # D2
    status = str(fm.get("status", ""))
    if status not in VALID_STATUS:
        err(f"D2 status {status!r} not in {VALID_STATUS}")
    # D3
    version = str(fm.get("version", ""))
    if not VERSION_RE.match(version):
        err(f"D3 version {version!r} does not match N.N.N[b]")
    # D4
    elif status in VALID_STATUS:
        has_b = version.endswith("b")
        if status in PRE_APPROVAL and not has_b:
            err(f"D4 status {status!r} (pre-approval) requires the `b` suffix, version is {version!r}")
        if status not in PRE_APPROVAL and has_b and status != "superseded" and status != "deprecated":
            err(f"D4 status {status!r} must not carry the `b` suffix, version is {version!r}")
    # D5/D6
    cols, rows = parse_changelog(text)
    if cols is None:
        err("D5 no CHANGELOG table found (SPEC §12 requires one)")
    else:
        missing = REQUIRED_CHANGELOG_COLS - set(cols)
        if missing:
            err(f"D5 CHANGELOG missing column(s): {sorted(missing)}")
        elif not rows:
            err("D5 CHANGELOG table has no rows")
        else:
            if not any(r.get("version", "").strip() == version for r in rows):
                err(f"D6 no CHANGELOG row matches frontmatter version {version!r}")
            # W1 — unreviewed same-day bump cluster (the 0.4.0b signature)
            seen = {}
            for r in rows:
                key = (r.get("date", ""), r.get("agent", ""))
                seen[key] = seen.get(key, 0) + 1
            for (d, a), n in seen.items():
                if n >= 2 and d and a:
                    warnings.append(f"{name}: W1 {n} version bumps on {d} by {a} with no distinct "
                                    "reviewer — the 0.4.0b drift signature (warning only)")
    return verdict


def lint_cross(docs_dir, planner_path, errors, warnings):
    """X1 doc<->code H-tier containment · X2 axis-letter uniqueness."""
    spec_path = os.path.join(docs_dir, SPEC_NAME)
    if not os.path.isfile(spec_path):
        warnings.append(f"X1/X2 skipped: {SPEC_NAME} not found in {docs_dir}")
        return
    spec = open(spec_path, "r", encoding="utf-8-sig").read()
    doc_tiers = set(re.findall(r"`(H[0-9])`", spec))
    if not os.path.isfile(planner_path):
        warnings.append(f"X1 skipped: {PLANNER_REL} not found")
    else:
        code = open(planner_path, "r", encoding="utf-8-sig").read()
        m = re.search(r"H_TIERS\s*=\s*\[([^\]]*)\]", code)
        if not m:
            errors.append(f"X1 {PLANNER_REL}: H_TIERS array not found")
        else:
            code_tiers = set(re.findall(r"H[0-9]", m.group(1)))
            missing = sorted(doc_tiers - code_tiers)
            if missing:
                errors.append(f"X1 SPEC names tier(s) {missing} that {PLANNER_REL} H_TIERS lacks "
                              "(the silent-H6 bug class: unknown tier falls back to the H0 toolset)")
    # X2 — the §3 axis table: one row per axis letter, letters unique
    axis_block = re.search(r"^##\s*3\.\s*Axis Model.*?(?=^##\s)", spec, re.DOTALL | re.MULTILINE)
    if axis_block:
        letters = re.findall(r"^\|\s*`([A-Z])`\s*\|", axis_block.group(0), re.MULTILINE)
        dupes = sorted({x for x in letters if letters.count(x) > 1})
        if dupes:
            errors.append(f"X2 axis letter(s) used more than once in the SPEC §3 table: {dupes}")
    else:
        warnings.append("X2 skipped: SPEC §3 Axis Model section not found")


def lint_repo(docs_dir, planner_path):
    errors, warnings, results = [], [], []
    if not os.path.isdir(docs_dir):
        return {"ok": False, "errors": [f"docs dir not found: {docs_dir}"], "warnings": [], "results": []}
    for fn in sorted(os.listdir(docs_dir)):
        if not fn.endswith(".md"):
            continue
        path = os.path.join(docs_dir, fn)
        try:
            text = open(path, "r", encoding="utf-8-sig").read()
        except OSError as e:
            errors.append(f"{fn}: unreadable: {e}")
            results.append({"doc": fn, "verdict": "ERROR"})
            continue
        verdict = lint_doc(path, text, errors, warnings)
        results.append({"doc": fn, "verdict": verdict})
        if verdict == "SKIP":
            warnings.append(f"{fn}: not in canonical format — skipped")
    lint_cross(docs_dir, planner_path, errors, warnings)
    return {"ok": not errors, "errors": errors, "warnings": warnings, "results": results}


# ---------------------------------------------------------------- self-test

GOOD_DOC = """---
version: "0.2.0b"
created_at: "2026-07-01T00:00:00+07:00,TEST,pending"
last_update: "2026-07-02T00:00:00+07:00,TEST"
status: "candidate"
superseded_by: null
attributes:
  domain: "test"
  doc_type: "spec"
  scope: "fixture"
  language: "en"
---

# GOOD

## CHANGELOG

| Version | Date | Status | Summary | Agent |
|---|---|---|---|---|
| 0.2.0b | 2026-07-02 | candidate | second | REVIEWER |
| 0.1.0b | 2026-07-01 | candidate | first | TEST |
"""


def self_test():
    """Fixture-driven proof that every check fires. Returns [] or failure strings."""
    fails = []

    def expect(label, text, want_substr, extra_files=None):
        with tempfile.TemporaryDirectory() as td:
            docs = os.path.join(td, "docs")
            os.makedirs(docs)
            open(os.path.join(docs, "FIX--DOC.md"), "w", encoding="utf-8").write(text)
            for rel, body in (extra_files or {}).items():
                p = os.path.join(td, rel)
                os.makedirs(os.path.dirname(p), exist_ok=True)
                open(p, "w", encoding="utf-8").write(body)
            rep = lint_repo(docs, os.path.join(td, PLANNER_REL))
            blob = " ".join(rep["errors"])
            if want_substr is None:
                if rep["errors"]:
                    fails.append(f"{label}: expected clean, got {rep['errors']}")
            elif want_substr not in blob:
                fails.append(f"{label}: expected error containing {want_substr!r}, got {rep['errors']}")

    expect("good doc", GOOD_DOC, None)
    expect("bad status", GOOD_DOC.replace('status: "candidate"', 'status: "stable"'), "D2")
    expect("bad version", GOOD_DOC.replace('version: "0.2.0b"', 'version: "v2"'), "D3")
    expect("b mismatch", GOOD_DOC.replace('status: "candidate"', 'status: "active"'), "D4")
    expect("missing attr", GOOD_DOC.replace('  scope: "fixture"\n', ""), "D1")
    expect("no changelog", GOOD_DOC.split("## CHANGELOG")[0], "D5")
    expect("missing column", GOOD_DOC.replace("| Summary |", "| Notes |"), "D5")
    expect("version not in changelog", GOOD_DOC.replace("| 0.2.0b | 2026-07-02", "| 0.9.0b | 2026-07-02"), "D6")
    expect("broken frontmatter", "---\nversion: [unclosed\n---\n", "unparseable")

    # X1: spec that names H6 while planner stops at H5 must fail; matching pair must pass
    spec_h6 = GOOD_DOC + "\n## 3. Axis Model\n\n| `H` | Context-Hop | x | y |\n\n| `H6` | ceiling |\n"
    with tempfile.TemporaryDirectory() as td:
        docs = os.path.join(td, "docs")
        os.makedirs(docs)
        open(os.path.join(docs, SPEC_NAME), "w", encoding="utf-8").write(spec_h6)
        open(os.path.join(td, PLANNER_REL), "w", encoding="utf-8").write(
            'const H_TIERS = ["H0", "H5"];\n')
        rep = lint_repo(docs, os.path.join(td, PLANNER_REL))
        if not any("X1" in e for e in rep["errors"]):
            fails.append(f"X1 negative: expected H6 containment error, got {rep['errors']}")
        open(os.path.join(td, PLANNER_REL), "w", encoding="utf-8").write(
            'const H_TIERS = ["H0", "H5", "H6"];\n')
        rep = lint_repo(docs, os.path.join(td, PLANNER_REL))
        if any("X1" in e for e in rep["errors"]):
            fails.append(f"X1 positive: expected pass, got {rep['errors']}")

    # X2: duplicated axis letter must fail
    spec_dup = GOOD_DOC + ("\n## 3. Axis Model\n\n| `H` | a | b | c |\n| `H` | d | e | f |\n\n## 4. Next\n")
    with tempfile.TemporaryDirectory() as td:
        docs = os.path.join(td, "docs")
        os.makedirs(docs)
        open(os.path.join(docs, SPEC_NAME), "w", encoding="utf-8").write(spec_dup)
        rep = lint_repo(docs, os.path.join(td, PLANNER_REL))
        if not any("X2" in e for e in rep["errors"]):
            fails.append(f"X2: expected duplicate-letter error, got {rep['errors']}")

    return fails


def main(argv):
    docs_dir = os.path.join(ROOT, "docs")
    planner_path = os.path.join(ROOT, PLANNER_REL)
    json_only = False
    self_test_only = False
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--docs-dir" and i + 1 < len(argv):
            docs_dir = argv[i + 1]; i += 2
        elif a == "--self-test":
            self_test_only = True; i += 1
        elif a == "--json":
            json_only = True; i += 1
        elif a in ("-h", "--help"):
            sys.stderr.write(__doc__); return 2
        else:
            sys.stderr.write(f"doc_lint.py: unknown arg {a!r}\n"); return 2

    st = self_test()
    if st:
        for f in st:
            sys.stderr.write(f"  SELFTEST FAIL: {f}\n")
        print(json.dumps({"ok": False, "self_test": st}, ensure_ascii=False))
        return 1
    if self_test_only:
        print(json.dumps({"ok": True, "self_test": "pass"}, ensure_ascii=False))
        if not json_only:
            sys.stderr.write("doc_lint self-test: all fixtures behaved.\n")
        return 0

    report = lint_repo(docs_dir, planner_path)
    report["self_test"] = "pass"
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not json_only:
        w = sys.stderr.write
        w(f"=== doc_lint: {docs_dir} ===\n")
        for r in report["results"]:
            w(f"  [{r['verdict']:<5}] {r['doc']}\n")
        for e in report["errors"]:
            w(f"  ERROR: {e}\n")
        for x in report["warnings"]:
            w(f"  warn:  {x}\n")
        w("DOC GOVERNANCE OK — every canonical doc conforms; doc<->code tier contract holds.\n"
          if report["ok"] else
          "DOC GOVERNANCE BROKEN — fix the canonical docs (or the tier contract) above.\n")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
