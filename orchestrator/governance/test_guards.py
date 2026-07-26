#!/usr/bin/env python3
"""test_guards.py — deterministic per-policy guard tests for the Governance Matrix (GP1).

Each subcommand proves that ONE policy's runtime guard actually works (or, for
check:structural policies, that the mechanism still exists in code). governance_lint.py
runs these before any run starts: a guard that cannot prove itself = the run does not
start. stdlib-only, deterministic, no LLM calls (core rule).

USAGE:
    python orchestrator/governance/test_guards.py <policy>
    python orchestrator/governance/test_guards.py --list
POLICIES:
    verify-gate               check_evidence.py passes resolving findings, rejects
                              failing/unverifiable ones (full behavioural test)
    maxrework-1               run.js still contains the escalation-ladder mechanism
                              (structural: single climb per verify failure)
    shared-runtime-contract   event_schema.json is well-formed and its own example
                              validates against it
    blocked-patterns          blocked_patterns.txt parses, has both classes, and
                              classifies known-good/known-bad command lines correctly
EXIT: 0 = guard verified · 1 = guard broken/missing · 2 = usage
"""
import json
import os
import re
import subprocess
import sys
import tempfile

# Windows: piped stdout/stderr default to cp1252 -> UnicodeEncodeError on Thai text (M7).
for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))  # <repo>/orchestrator/governance -> <repo>

_TYPES = {"str": str, "int": int, "float": float, "list": list, "dict": dict, "bool": bool}


def _fail(policy, msg):
    print(f"[FAIL] {policy}: {msg}")
    return 1


def _ok(policy, msg):
    print(f"[OK]   {policy}: {msg}")
    return 0


def _run(argv, timeout=120):
    try:
        p = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, f"<timeout after {timeout}s>"


# --------------------------------------------------------------------------
# verify-gate — full behavioural test of check_evidence.py
# --------------------------------------------------------------------------
def t_verify_gate():
    gate = os.path.join(ROOT, "orchestrator", "check_evidence.py")
    if not os.path.isfile(gate):
        return _fail("verify-gate", "orchestrator/check_evidence.py missing")
    py = sys.executable
    with tempfile.TemporaryDirectory() as td:
        def findings(name, items):
            path = os.path.join(td, name)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(items, f)
            return path

        # (1) a resolving finding must open the gate (exit 0)
        rc, out = _run([py, gate, findings("pass.json", [
            {"id": "g-pass", "evidence_command": "python -c 'import sys; sys.exit(0)'"}])])
        if rc != 0:
            return _fail("verify-gate", f"gate rejected a resolving finding (exit {rc}): {out.strip()[:200]}")

        # (2) a failing evidence_command must close the gate (exit != 0)
        rc, _ = _run([py, gate, findings("fail.json", [
            {"id": "g-fail", "evidence_command": "python -c 'import sys; sys.exit(3)'"}])])
        if rc == 0:
            return _fail("verify-gate", "gate passed a finding whose evidence_command exits 3")

        # (3) an unverifiable finding (no evidence_command) must be rejected
        rc, _ = _run([py, gate, findings("noev.json", [
            {"id": "g-noev", "claim": "unverifiable claim"}])])
        if rc == 0:
            return _fail("verify-gate", "gate passed a finding with NO evidence_command")

        # (4) must_match semantics: matching passes, non-matching fails
        rc, _ = _run([py, gate, findings("match.json", [
            {"id": "g-match", "evidence_command": "python -c \"print('sentinel-xyz')\"",
             "must_match": "sentinel-xyz"}])])
        if rc != 0:
            return _fail("verify-gate", "gate rejected a finding whose must_match IS present")
        rc, _ = _run([py, gate, findings("nomatch.json", [
            {"id": "g-nomatch", "evidence_command": "python -c \"print('other')\"",
             "must_match": "sentinel-xyz"}])])
        if rc == 0:
            return _fail("verify-gate", "gate passed a finding whose must_match is absent")

        # (5) MIXED findings: one pass + one fail must CLOSE the gate (all-pass semantics,
        #     not any-pass — regression guard from adversarial review M5)
        rc, _ = _run([py, gate, findings("mixed.json", [
            {"id": "g-mix-ok", "evidence_command": "python -c 'import sys; sys.exit(0)'"},
            {"id": "g-mix-bad", "evidence_command": "python -c 'import sys; sys.exit(3)'"}])])
        if rc == 0:
            return _fail("verify-gate", "gate passed a MIXED batch (any-pass regression: all-pass semantics broken)")

        # (6) EMPTY findings must not open the gate (vacuous pass)
        rc, _ = _run([py, gate, findings("empty.json", [])])
        if rc == 0:
            return _fail("verify-gate", "gate passed an EMPTY findings list (vacuous pass)")

    return _ok("verify-gate", "check_evidence.py correct on pass/fail/unverifiable/must_match/mixed/empty")


# --------------------------------------------------------------------------
# maxrework-1 — structural: the escalation-ladder mechanism still exists
# --------------------------------------------------------------------------
def t_maxrework_1():
    runjs = os.path.join(ROOT, "orchestrator", "run.js")
    if not os.path.isfile(runjs):
        return _fail("maxrework-1", "orchestrator/run.js missing")
    src = open(runjs, "r", encoding="utf-8").read()
    # Regex markers tolerant of quote-style/whitespace reformats (review minor: an exact-string
    # match turns a cosmetic reformat into a full run blockage).
    markers = [
        (re.compile(r"runTaskWithEscalation"), "escalation entrypoint"),
        (re.compile(r"LADDER\s*=\s*\[\s*['\"]T0['\"]\s*,\s*['\"]T1['\"]"), "tier ladder"),
        (re.compile(r"LADDER\[\s*i\s*\+\s*1\s*\]"), "single-rung climb (one climb per verify failure)"),
    ]
    missing = [desc for rx, desc in markers if not rx.search(src)]
    if missing:
        return _fail("maxrework-1", "mechanism markers missing from run.js: " + "; ".join(missing))
    return _ok("maxrework-1", "escalation-ladder mechanism present in run.js (structural check)")


# --------------------------------------------------------------------------
# shared-runtime-contract — schema well-formed + example self-validates
# --------------------------------------------------------------------------
def validate_event(ev, schema):
    """Minimal deterministic validator (stdlib; no jsonschema dep). Returns error list."""
    errs = []
    if not isinstance(ev, dict):
        return ["event is not an object"]
    for k in schema.get("required", []):
        if k not in ev:
            errs.append(f"missing required field: {k}")

    def check_type(key, val, tspec, where=""):
        for t in tspec.split("|"):
            if t == "null":
                if val is None:
                    return None
            elif t in _TYPES:
                # bool is an int subclass in Python — never let a bool satisfy int/float
                if isinstance(val, bool) and t in ("int", "float"):
                    continue
                if isinstance(val, _TYPES[t]):
                    return None
        return f"{where}{key}: expected {tspec}, got {type(val).__name__}"

    for k, tspec in schema.get("types", {}).items():
        if k in ev:
            e = check_type(k, ev[k], tspec)
            if e:
                errs.append(e)
    if isinstance(ev.get("verify"), dict):
        for k, tspec in schema.get("verify_types", {}).items():
            if k in ev["verify"]:
                e = check_type(k, ev["verify"][k], tspec, where="verify.")
                if e:
                    errs.append(e)
    return errs


def t_shared_runtime_contract():
    path = os.path.join(HERE, "event_schema.json")
    if not os.path.isfile(path):
        return _fail("shared-runtime-contract", "event_schema.json missing")
    try:
        schema = json.load(open(path, "r", encoding="utf-8"))
    except json.JSONDecodeError as e:
        return _fail("shared-runtime-contract", f"event_schema.json is not valid JSON: {e}")
    for key in ("required", "types", "example"):
        if key not in schema:
            return _fail("shared-runtime-contract", f"schema missing top-level key: {key}")
    unknown = [t for spec in schema["types"].values() for t in spec.split("|")
               if t != "null" and t not in _TYPES]
    if unknown:
        return _fail("shared-runtime-contract", f"unknown type names in schema: {unknown}")
    errs = validate_event(schema["example"], schema)
    if errs:
        return _fail("shared-runtime-contract", "schema's own example does not validate: " + "; ".join(errs))
    # a broken event MUST be caught (validator is not a rubber stamp)
    bad = dict(schema["example"])
    bad.pop("run_id", None)
    bad["attempt_id"] = "one"
    errs = validate_event(bad, schema)
    if len(errs) < 2:
        return _fail("shared-runtime-contract", "validator failed to flag a corrupted event")
    return _ok("shared-runtime-contract", "event_schema.json well-formed; example validates; corruption detected")


# --------------------------------------------------------------------------
# blocked-patterns — pattern file parses + classifies sample commands correctly
# --------------------------------------------------------------------------
def load_patterns(path=None):
    """Parse blocked_patterns.txt -> list of (class, compiled_regex). Raises ValueError on bad lines."""
    path = path or os.path.join(HERE, "blocked_patterns.txt")
    out = []
    for i, line in enumerate(open(path, "r", encoding="utf-8"), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            raise ValueError(f"line {i}: no CLASS: prefix")
        cls, _, pat = line.partition(":")
        if cls not in ("EXTERNAL", "DESTRUCTIVE"):
            raise ValueError(f"line {i}: unknown class {cls!r}")
        out.append((cls, re.compile(pat)))
    return out


def match_blocked(cmdline, patterns):
    """Return the class of the first matching pattern, else None."""
    for cls, rx in patterns:
        if rx.search(cmdline):
            return cls
    return None


def t_blocked_patterns():
    path = os.path.join(HERE, "blocked_patterns.txt")
    if not os.path.isfile(path):
        return _fail("blocked-patterns", "blocked_patterns.txt missing")
    try:
        patterns = load_patterns(path)
    except (ValueError, re.error) as e:
        return _fail("blocked-patterns", f"pattern file does not parse: {e}")
    classes = {c for c, _ in patterns}
    if not {"EXTERNAL", "DESTRUCTIVE"} <= classes:
        return _fail("blocked-patterns", f"need both classes, found only: {sorted(classes)}")

    cases = [
        ("git push origin feat/x",              "EXTERNAL"),
        ("git -C G:/repo push origin main",     "EXTERNAL"),   # M6: flags between git and subcommand
        ("gh pr create --fill",                 "EXTERNAL"),
        ("npm publish",                         "EXTERNAL"),
        ("git reset --hard HEAD~1",             "DESTRUCTIVE"),
        ("git -C G:/x reset --hard",            "DESTRUCTIVE"),
        ("rm -rf build/",                       "DESTRUCTIVE"),
        ("rm -Rf build/",                       "DESTRUCTIVE"),  # M6: uppercase flag
        ("rm --recursive tmp",                  "DESTRUCTIVE"),  # M6: long flag
        ("git clean --force",                   "DESTRUCTIVE"),  # M6: long flag
        ("git restore .",                       "DESTRUCTIVE"),  # M6: discard worktree
        ("git checkout .",                      "DESTRUCTIVE"),
        ("git branch -D feat/x",                "DESTRUCTIVE"),
        ("cp evil.json runs/x/tests/holdout/t.json", "DESTRUCTIVE"),
        ("cp evil.json tests/holdout/t.json",   "DESTRUCTIVE"),  # M6: repo-relative path
        ("mv tests/holdout tests/holdout.bak",  "DESTRUCTIVE"),  # M6: move the whole holdout dir
        ("git rm tests/holdout/case.json",      "DESTRUCTIVE"),
        # must NOT match:
        ("git status",                          None),
        ("git commit -m 'pushes the limit'",    None),
        ("echo git pushover",                   None),
        ("git checkout feat/x",                 None),   # branch switch is fine
        ("git branch -d merged",                None),   # lowercase -d (safe delete) is fine
        ("rm notes.txt",                        None),   # non-recursive rm is fine
        ("python -m http.server 8000",          None),
        ("ls tests/holdout",                    None),   # read is fine; write is not
        ("python orchestrator/check_evidence.py tests/holdout/case.json", None),  # gate runner reads
    ]
    bad = []
    for cmd, want in cases:
        got = match_blocked(cmd, patterns)
        if got != want:
            bad.append(f"{cmd!r}: want {want}, got {got}")
    if bad:
        return _fail("blocked-patterns", "misclassified: " + " | ".join(bad))
    return _ok("blocked-patterns", f"{len(patterns)} patterns parse; {len(cases)} sample commands classify correctly")


# --------------------------------------------------------------------------
TESTS = {
    "verify-gate": t_verify_gate,
    "maxrework-1": t_maxrework_1,
    "shared-runtime-contract": t_shared_runtime_contract,
    "blocked-patterns": t_blocked_patterns,
}


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        sys.stderr.write(__doc__)
        return 2
    if argv[0] == "--list":
        for name in TESTS:
            print(name)
        return 0
    # Exactly ONE policy per invocation (M1): silently ignoring extra argv let a compound
    # guard_test ("... && other-cmd") false-pass — reject anything beyond the policy name.
    if len(argv) > 1:
        sys.stderr.write(f"test_guards.py: expected exactly one policy, got extra args: {argv[1:]!r}\n")
        return 2
    fn = TESTS.get(argv[0])
    if fn is None:
        sys.stderr.write(f"test_guards.py: unknown policy test {argv[0]!r} (see --list)\n")
        return 2
    return fn()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
