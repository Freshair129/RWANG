#!/usr/bin/env python3
"""governance_lint.py — the meta-guard (G6, GP1) that makes the Governance Matrix
self-enforcing.

Loads the machine-readable Governance Matrix (governance.yaml), then verifies that
every `enforced` policy has (a) a guard file that EXISTS and (b) a guard_test that
PASSES. Any violation -> exit non-zero. run.js calls this at the top of the Route
phase, so a broken governance layer means NO new run starts ("Prompt = intent,
Runtime = law, Audit = proof" — a policy row whose guard cannot prove itself is
not law, and the system refuses to pretend otherwise).

`planned` policies are reported (and their guard_test is run informationally when
present) but never fail the lint — that is what makes incremental rollout honest:
they exist in the matrix yet cannot be claimed as enforced.

USAGE:
    python orchestrator/governance/governance_lint.py                 # lint the default matrix
    python orchestrator/governance/governance_lint.py --matrix p.yaml # lint another matrix file
    python orchestrator/governance/governance_lint.py --run-dir runs/x  # + validate that run's
                                                       # ndjson events against event_schema.json
    python orchestrator/governance/governance_lint.py --stamp runs/x  # + write the JSON report to
                                                       # runs/x/governance_lint.json (durable stamp)
    python orchestrator/governance/governance_lint.py --json          # JSON only (no stderr table)

OUTPUT: pretty summary -> stderr, JSON -> stdout (same convention as route.py).
EXIT:   0 all enforced policies verified · 1 enforced violation
        2 usage/matrix error · 3 PyYAML missing for a .yaml matrix
Deterministic, stdlib-only (+PyYAML for .yaml input, same exception route.py has).
"""
import json
import os
import re
import shlex
import subprocess
import sys

# Windows: piped stdout/stderr default to cp1252 -> UnicodeEncodeError on Thai paths/notes
# turned a GOOD matrix into a false-block (adversarial review M7). Force utf-8.
for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))  # <repo>/orchestrator/governance -> <repo>

sys.path.insert(0, HERE)
import test_guards  # noqa: E402  (validate_event — same dir, stdlib import)

VALID_STATUS = ("enforced", "planned")
GUARD_TEST_TIMEOUT = 300  # > sum of test_guards' internal subprocess timeouts (review minor)

# GP baseline (adversarial review M4): these policies MUST be status=enforced in any matrix
# this lint accepts. Demoting one is a CODE change (edit this tuple in the same commit that
# justifies it), never a quiet yaml edit — otherwise `sed s/enforced/planned/` disables the
# whole meta-guard while lint stays green.
REQUIRED_ENFORCED = ("verify-gate", "maxrework-1")

# One plain command only (adversarial review M1): shlex.split without a shell passes "&&",
# "|", ";" etc. through as ARGUMENTS, so the second half of a compound guard_test would
# silently never run while lint reports PASS. Reject shell metacharacters outright.
_SHELL_META = re.compile(r"[&|;<>`$]")


def load_matrix(path):
    raw = open(path, "r", encoding="utf-8").read()
    if path.endswith(".json"):
        return json.loads(raw)
    try:
        import yaml  # PyYAML — the one allowed non-stdlib dep, same as route.py
    except ImportError:
        sys.stderr.write("governance_lint.py: PyYAML is required for a .yaml matrix "
                         "(or provide a .json matrix via --matrix).\n")
        sys.exit(3)
    return yaml.safe_load(raw)


def run_guard_test(cmd):
    if _SHELL_META.search(cmd):
        return 126, ("<guard_test rejected: shell metacharacters (&|;<>`$) are not allowed — "
                     "guard_test must be ONE plain command; compound commands false-pass (M1)>")
    try:
        p = subprocess.run(shlex.split(cmd), cwd=ROOT, capture_output=True,
                           text=True, timeout=GUARD_TEST_TIMEOUT)
        return p.returncode, ((p.stdout or "") + (p.stderr or "")).strip()
    except subprocess.TimeoutExpired:
        return 124, f"<guard_test timeout after {GUARD_TEST_TIMEOUT}s>"
    except (OSError, ValueError) as e:
        return 127, f"<guard_test exec error: {e}>"


def lint_run_dir(run_dir, errors, warnings, contract_enforced):
    """Validate a run's progress.ndjson lines against the Shared Runtime Contract."""
    schema_path = os.path.join(HERE, "event_schema.json")
    ndjson = os.path.join(run_dir, "progress.ndjson")
    if not os.path.isfile(schema_path):
        errors.append("run-dir check: event_schema.json missing")
        return
    if not os.path.isfile(ndjson):
        warnings.append(f"run-dir check: {ndjson} not found — nothing to validate")
        return
    schema = json.load(open(schema_path, "r", encoding="utf-8"))
    sink = errors if contract_enforced else warnings
    n_checked = n_bad = 0
    with open(ndjson, "r", encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            # while planned: sample the first 500. Once the contract is ENFORCED every
            # event is validated — a capped check would be a silent coverage hole.
            if not contract_enforced and i > 500:
                warnings.append("run-dir check: >500 events — validated the first 500 only")
                break
            line = line.strip()
            if not line:
                continue
            n_checked += 1
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                n_bad += 1
                sink.append(f"event line {i}: not valid JSON")
                continue
            errs = test_guards.validate_event(ev, schema)
            if errs:
                n_bad += 1
                sink.append(f"event line {i}: " + "; ".join(errs[:4]))
    label = "violations are FATAL" if contract_enforced else "contract still `planned` -> warnings only"
    warnings.append(f"run-dir check: {n_checked} event(s) checked, {n_bad} non-conforming ({label})")


def main(argv):
    matrix_path = os.path.join(HERE, "governance.yaml")
    run_dir = None
    stamp_dir = None
    json_only = False
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--matrix" and i + 1 < len(argv):
            matrix_path = argv[i + 1]; i += 2
        elif a == "--run-dir" and i + 1 < len(argv):
            run_dir = argv[i + 1]; i += 2
        elif a == "--stamp" and i + 1 < len(argv):
            stamp_dir = argv[i + 1]; i += 2
        elif a == "--json":
            json_only = True; i += 1
        elif a in ("-h", "--help"):
            sys.stderr.write(__doc__); return 2
        else:
            sys.stderr.write(f"governance_lint.py: unknown arg {a!r}\n"); return 2

    if not os.path.isfile(matrix_path):
        sys.stderr.write(f"governance_lint.py: matrix not found: {matrix_path}\n")
        return 2
    try:
        matrix = load_matrix(matrix_path)
    except Exception as e:  # malformed matrix = governance broken = no run
        sys.stderr.write(f"governance_lint.py: matrix unreadable: {e}\n")
        return 2

    # Shape validation first (review minor): a matrix that is not {policies: [dict, ...]}
    # is a USAGE error (exit 2 per contract), not an AttributeError traceback.
    policies = matrix.get("policies") if isinstance(matrix, dict) else None
    if not isinstance(policies, list) or not policies:
        sys.stderr.write("governance_lint.py: matrix must be a mapping with a non-empty "
                         "`policies` list\n")
        return 2

    errors, warnings, results = [], [], []
    seen = set()
    contract_enforced = False

    for idx, p in enumerate(policies):
        if not isinstance(p, dict):
            errors.append(f"policy #{idx}: not a mapping (got {type(p).__name__})")
            results.append({"policy": f"<#{idx}>", "status": None, "guard": None,
                            "guard_exists": None, "guard_test_exit": None, "verdict": "ERROR"})
            continue
        name = p.get("policy") or "<unnamed>"
        res = {"policy": name, "status": p.get("status"), "guard": p.get("guard"),
               "guard_exists": None, "guard_test_exit": None, "verdict": "?"}
        results.append(res)

        if name in seen:
            errors.append(f"{name}: duplicate policy name"); res["verdict"] = "ERROR"; continue
        seen.add(name)

        status = p.get("status")
        if status not in VALID_STATUS:
            errors.append(f"{name}: status must be one of {VALID_STATUS}, got {status!r}")
            res["verdict"] = "ERROR"; continue
        for field in ("guard", "audit_event"):
            if not p.get(field):
                errors.append(f"{name}: missing required field {field!r}")
                res["verdict"] = "ERROR"
        if res["verdict"] == "ERROR":
            continue

        # guard must live INSIDE the repo (review minor): an absolute path would let the
        # matrix point at any file on the machine and still "exist".
        if os.path.isabs(p["guard"]) or p["guard"].startswith(("/", "\\")):
            errors.append(f"{name}: guard must be a repo-relative path, got {p['guard']!r}")
            res["verdict"] = "ERROR"
            continue

        guard_path = os.path.join(ROOT, p["guard"])
        res["guard_exists"] = os.path.isfile(guard_path)

        if status == "enforced":
            if name == "shared-runtime-contract":
                contract_enforced = True
            if not res["guard_exists"]:
                errors.append(f"{name}: ENFORCED but guard file missing: {p['guard']}")
                res["verdict"] = "FAIL"; continue
            if not p.get("guard_test"):
                errors.append(f"{name}: ENFORCED but has no guard_test (unprovable law)")
                res["verdict"] = "FAIL"; continue
            rc, out = run_guard_test(p["guard_test"])
            res["guard_test_exit"] = rc
            if rc != 0:
                tail = out.splitlines()[-1] if out else ""
                errors.append(f"{name}: guard_test exit {rc}: {tail[:200]}")
                res["verdict"] = "FAIL"
            else:
                res["verdict"] = "PASS"
        else:  # planned
            if not res["guard_exists"]:
                warnings.append(f"{name}: planned (gp={p.get('gp', '?')}) — guard not built yet: {p['guard']}")
                res["verdict"] = "PLANNED"
            elif p.get("guard_test"):
                rc, _ = run_guard_test(p["guard_test"])
                res["guard_test_exit"] = rc
                res["verdict"] = "PLANNED(test=%d)" % rc
                if rc != 0:
                    warnings.append(f"{name}: planned guard exists but its test fails (exit {rc}) — "
                                    "fix before flipping to enforced")
            else:
                res["verdict"] = "PLANNED"

    # GP baseline pin (M4): the matrix cannot quietly demote the core policies.
    by_name = {r["policy"]: r for r in results}
    for req in REQUIRED_ENFORCED:
        r = by_name.get(req)
        if r is None:
            errors.append(f"baseline policy missing from matrix: {req!r} "
                          f"(pinned in REQUIRED_ENFORCED — removing it is a code change)")
        elif r["status"] != "enforced":
            errors.append(f"baseline policy demoted: {req!r} must be status=enforced "
                          f"(pinned in REQUIRED_ENFORCED; got {r['status']!r})")

    if run_dir:
        lint_run_dir(run_dir, errors, warnings, contract_enforced)

    ok = not errors
    n_enf = sum(1 for r in results if r["verdict"] == "PASS")
    report = {"ok": ok, "matrix": matrix_path,
              "counts": {"policies": len(policies), "enforced_pass": n_enf,
                         "errors": len(errors), "warnings": len(warnings)},
              "results": results, "errors": errors, "warnings": warnings}

    # Durable stamp (M2): a file later phases / progress tooling can check, instead of
    # trusting an agent's testimony about the exit code alone.
    if stamp_dir:
        try:
            os.makedirs(stamp_dir, exist_ok=True)
            with open(os.path.join(stamp_dir, "governance_lint.json"), "w",
                      encoding="utf-8") as f:
                json.dump(report, f, ensure_ascii=False, indent=2)
        except OSError as e:
            warnings.append(f"stamp write failed: {e}")
            report["counts"]["warnings"] = len(warnings)

    print(json.dumps(report, ensure_ascii=False, indent=2))

    if not json_only:
        w = sys.stderr.write
        w(f"=== governance_lint: {matrix_path} ===\n")
        for r in results:
            w(f"  [{r['verdict']:<16}] {r['policy']:<26} guard={r['guard']}\n")
        for e in errors:
            w(f"  ERROR: {e}\n")
        for x in warnings:
            w(f"  warn:  {x}\n")
        w("GOVERNANCE OK — every enforced policy proved its guard.\n" if ok else
          "GOVERNANCE BROKEN — no new run may start until the errors above are fixed.\n")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
