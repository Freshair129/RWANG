#!/usr/bin/env python3
"""state_check.py — guard of G1 External State Contract (GP2): restart-protocol step 4.

A run's ONLY durable memory is its external state under <runDir>. Before any
resume, this guard proves that state is complete and intact per the governance
spec (SPEC--AGENT-RUNTIME-GOVERNANCE.md §3.1):

    goal.md            exists, non-empty (the mission + DoD)
    decisions.ndjson   exists; every non-blank line parses as JSON
                       (append-only decision log; an empty file = no decisions yet, allowed)
    tests/             is a directory (the acceptance tests)
    progress.json      parses; carries the shared-schema top-level keys
                       (progress.py's docstring is the SSOT for that shape)
    progress.ndjson    exists (append-only audit trail)
    lessons/           is a directory (may be empty)

    tests.sha256       OPTIONAL — but if present, tests/ must still match it
                       (tests-immutable; verified via tests_hash_check.py, same dir)

restart_prompt.md step 4 runs this. Exit != 0 means DO NOT resume — surface
the JSON report to the human instead of guessing state from memory.

USAGE:
    python orchestrator/governance/state_check.py <runDir> [--json]
    python orchestrator/governance/state_check.py --self-test

OUTPUT: JSON {ok, missing[], invalid[], notes[]} -> stdout; human summary ->
        stderr (--json suppresses the summary). Same convention as route.py /
        governance_lint.py.
EXIT:   0 state complete + intact (or --self-test fully proved)
        1 violation — anything missing or invalid (or --self-test failed)
        2 usage error / runDir not a directory
Deterministic, stdlib-only, no LLM calls (core rule).
"""
import json
import os
import subprocess
import sys
import tempfile

# Windows: piped stdout/stderr default to cp1252 -> UnicodeEncodeError on Thai
# paths/notes (same false-block governance_lint.py hit — M7). Force utf-8.
for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tests_hash_check  # noqa: E402  (same dir, stdlib-only — pattern of governance_lint.py)

_SELFTEST_TIMEOUT = 60

# Top-level keys progress.py `init` always writes (its docstring is the SSOT).
# `awaiting` is intentionally NOT required: it exists only while the run status
# is awaiting_approval.
PROGRESS_REQUIRED_KEYS = (
    "runId", "spec", "target_repo", "autonomy", "status", "started_at",
    "updated_at", "epic_dod", "phases", "tasks", "ledger", "events",
)
_PROGRESS_TYPES = (("status", str), ("phases", list), ("tasks", list),
                   ("ledger", dict), ("events", list))


# --------------------------------------------------------------------------
# the check itself (importable; returns the report dict, never exits)
# --------------------------------------------------------------------------
def check_run_dir(run_dir):
    """Verify <runDir> against the G1 External State Contract.

    Returns {"ok": bool, "runDir": str, "missing": [...], "invalid": [...],
    "notes": [...]} — missing = required entry absent; invalid = present but
    malformed / diverged; notes = informational only (never affect ok).
    """
    missing, invalid, notes = [], [], []
    p = lambda name: os.path.join(run_dir, name)  # noqa: E731

    # goal.md — the mission; an empty goal is no goal
    if not os.path.isfile(p("goal.md")):
        missing.append("goal.md")
    else:
        try:
            body = open(p("goal.md"), "r", encoding="utf-8", errors="replace").read()
            if not body.strip():
                invalid.append("goal.md: empty")
        except OSError as e:
            invalid.append(f"goal.md: unreadable: {e}")

    # decisions.ndjson — every non-blank line must parse as JSON
    if not os.path.isfile(p("decisions.ndjson")):
        missing.append("decisions.ndjson")
    else:
        try:
            with open(p("decisions.ndjson"), "r", encoding="utf-8") as f:
                for i, line in enumerate(f, 1):
                    if not line.strip():
                        continue  # tolerate blank/trailing lines; content lines must parse
                    try:
                        json.loads(line)
                    except ValueError:
                        invalid.append(f"decisions.ndjson: line {i} is not valid JSON")
        except OSError as e:
            invalid.append(f"decisions.ndjson: unreadable: {e}")

    # tests/ — must be a directory
    if not os.path.isdir(p(tests_hash_check.TESTS_DIRNAME)):
        missing.append("tests/")

    # progress.json — shared progress schema snapshot
    if not os.path.isfile(p("progress.json")):
        missing.append("progress.json")
    else:
        snap = None
        try:
            with open(p("progress.json"), "r", encoding="utf-8") as f:
                snap = json.load(f)
        except (OSError, ValueError) as e:
            invalid.append(f"progress.json: not valid JSON: {e}")
        if snap is not None:
            if not isinstance(snap, dict):
                invalid.append(f"progress.json: expected an object, got {type(snap).__name__}")
            else:
                lack = [k for k in PROGRESS_REQUIRED_KEYS if k not in snap]
                if lack:
                    invalid.append("progress.json: missing shared-schema keys: " + ", ".join(lack))
                for key, typ in _PROGRESS_TYPES:
                    if key in snap and not isinstance(snap[key], typ):
                        invalid.append(f"progress.json: {key} must be {typ.__name__}, "
                                       f"got {type(snap[key]).__name__}")

    # progress.ndjson — the append-only audit trail must exist
    if not os.path.isfile(p("progress.ndjson")):
        missing.append("progress.ndjson")

    # lessons/ — must be a directory; empty is fine
    if not os.path.isdir(p("lessons")):
        missing.append("lessons/")
    elif not os.listdir(p("lessons")):
        notes.append("lessons/ is empty (allowed)")

    # tests-immutable integration: if the tests tree was locked, it must still match
    man_path = p(tests_hash_check.MANIFEST_NAME)
    if os.path.isfile(man_path):
        try:
            manifest = tests_hash_check.load_manifest(man_path)
            diff = tests_hash_check.compare(manifest, p(tests_hash_check.TESTS_DIRNAME))
            for kind in ("modified", "missing", "added"):
                if diff[kind]:
                    invalid.append(f"tests.sha256: {kind} after lock: " + ", ".join(diff[kind]))
            if not any(diff.values()):
                notes.append(f"tests.sha256: {len(manifest['files'])} locked test file(s) intact")
        except (OSError, ValueError) as e:
            invalid.append(f"tests.sha256: unreadable manifest: {e}")
    else:
        notes.append("tests.sha256 not present — tests not locked yet (hash verification skipped)")

    return {"ok": not missing and not invalid,
            "runDir": run_dir.replace(os.sep, "/"),
            "missing": missing, "invalid": invalid, "notes": notes}


# --------------------------------------------------------------------------
# --self-test — tempdir fixture; proves the pass path and three fail classes
# --------------------------------------------------------------------------
def _write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def _fixture(run_dir):
    """A minimal but COMPLETE §3.1 state tree (progress.json carries every
    shared-schema key progress.py init writes)."""
    ts = "2026-01-01T00:00:00+00:00"  # pinned — determinism rule, no wall clock
    _write(os.path.join(run_dir, "goal.md"),
           "Ship the demo task. DoD: verify_command exits 0 on every task.\n")
    _write(os.path.join(run_dir, "decisions.ndjson"),
           json.dumps({"ts": ts, "decision": "use fixture layout A"}) + "\n"
           + json.dumps({"ts": ts, "decision": "pin schema v1"}) + "\n")
    _write(os.path.join(run_dir, "tests", "unit", "test_a.py"),
           "def test_a():\n    assert True\n")
    snap = {
        "runId": "selftest", "spec": "specs/selftest.yaml",
        "target_repo": "G:/tmp/target", "autonomy": "supervised",
        "status": "running", "started_at": ts, "updated_at": ts,
        "epic_dod": "demo", "phases": [{"name": "Route", "status": "pending"}],
        "tasks": [], "ledger": {"local_tokens": 0, "billed_tokens": 0, "billed_usd": 0.0},
        "events": [],
    }
    _write(os.path.join(run_dir, "progress.json"),
           json.dumps(snap, ensure_ascii=False, indent=2) + "\n")
    _write(os.path.join(run_dir, "progress.ndjson"),
           json.dumps({"ts": ts, "task": "T-1", "event": "queued", "status": "pending",
                       "tier": "T2", "model": "claude-sonnet-4-6", "cost_usd": 0,
                       "detail": "fixture"}) + "\n")
    os.makedirs(os.path.join(run_dir, "lessons"), exist_ok=True)


def self_test():
    py = sys.executable
    me = os.path.abspath(__file__)
    hash_cli = os.path.join(HERE, "tests_hash_check.py")
    steps = []
    ok_all = True

    def run_cli(*cli_args):
        proc = subprocess.run([py, me, *cli_args], capture_output=True, text=True,
                              timeout=_SELFTEST_TIMEOUT)
        return proc.returncode, proc.stdout

    def parse(text):
        try:
            return json.loads(text)
        except ValueError:
            return {}

    def check(name, cond, detail=""):
        nonlocal ok_all
        cond = bool(cond)
        steps.append({"step": name, "ok": cond, "detail": detail if not cond else ""})
        sys.stderr.write(f"  [{'OK' if cond else 'FAIL'}] {name}"
                         + (f" — {detail}" if detail and not cond else "") + "\n")
        if not cond:
            ok_all = False

    with tempfile.TemporaryDirectory() as td:
        run_dir = os.path.join(td, "run")
        _fixture(run_dir)

        # complete fixture -> pass
        rc, out = run_cli(run_dir, "--json")
        rep = parse(out)
        check("complete fixture exits 0 with ok=true",
              rc == 0 and rep.get("ok") is True, f"exit {rc}, report {out[:300]!r}")

        # (fail 1) goal.md deleted -> 1, listed in missing[]
        goal = os.path.join(run_dir, "goal.md")
        saved_goal = open(goal, "r", encoding="utf-8").read()
        os.remove(goal)
        rc, out = run_cli(run_dir, "--json")
        rep = parse(out)
        check("goal.md deleted -> exit 1, listed missing",
              rc == 1 and "goal.md" in rep.get("missing", []),
              f"exit {rc}, report {out[:300]!r}")
        _write(goal, saved_goal)

        # (fail 2) corrupt decisions line -> 1, flagged invalid with line number
        dec = os.path.join(run_dir, "decisions.ndjson")
        saved_dec = open(dec, "r", encoding="utf-8").read()
        with open(dec, "a", encoding="utf-8", newline="\n") as f:
            f.write("this is not json {\n")
        rc, out = run_cli(run_dir, "--json")
        rep = parse(out)
        check("broken decisions.ndjson line -> exit 1, flagged invalid",
              rc == 1 and any(x.startswith("decisions.ndjson: line 3")
                              for x in rep.get("invalid", [])),
              f"exit {rc}, report {out[:300]!r}")
        _write(dec, saved_dec)

        # (fail 3) tests modified AFTER lock -> 1 via tests_hash_check integration
        proc = subprocess.run([py, hash_cli, run_dir, "lock"], capture_output=True,
                              text=True, timeout=_SELFTEST_TIMEOUT)
        check("fixture tests lock exits 0", proc.returncode == 0,
              f"exit {proc.returncode}: {proc.stderr.strip()[:200]}")
        rc, out = run_cli(run_dir, "--json")
        rep = parse(out)
        check("locked + intact -> still exit 0", rc == 0 and rep.get("ok") is True,
              f"exit {rc}, report {out[:300]!r}")
        _write(os.path.join(run_dir, "tests", "unit", "test_a.py"),
               "def test_a():\n    assert False  # tampered after lock\n")
        rc, out = run_cli(run_dir, "--json")
        rep = parse(out)
        check("test modified after lock -> exit 1, flagged via tests.sha256",
              rc == 1 and any(x.startswith("tests.sha256: modified")
                              for x in rep.get("invalid", [])),
              f"exit {rc}, report {out[:300]!r}")

        # usage errors
        rc, _ = run_cli(os.path.join(td, "no-such-run"))
        check("missing runDir exits 2", rc == 2, f"exit {rc}")
        rc, _ = run_cli()
        check("no args exits 2", rc == 2, f"exit {rc}")

    print(json.dumps({"ok": ok_all, "self_test": "state_check", "steps": steps},
                     ensure_ascii=False, indent=2))
    sys.stderr.write("SELF-TEST PASS — G1 state contract proved on pass, missing, "
                     "corrupt-log, and tampered-tests paths.\n" if ok_all else
                     "SELF-TEST FAIL — see steps above.\n")
    return 0 if ok_all else 1


# --------------------------------------------------------------------------
def main(argv):
    if argv and argv[0] in ("-h", "--help"):
        sys.stderr.write(__doc__)
        return 2
    if argv and argv[0] == "--self-test":
        if len(argv) > 1:
            sys.stderr.write("state_check.py: --self-test takes no other args\n")
            return 2
        return self_test()

    json_only = False
    positional = []
    for a in argv:
        if a == "--json":
            json_only = True
        elif a.startswith("-"):
            sys.stderr.write(f"state_check.py: unknown arg {a!r}\n")
            return 2
        else:
            positional.append(a)
    if len(positional) != 1:
        sys.stderr.write("usage: state_check.py <runDir> [--json] | --self-test\n")
        return 2
    run_dir = positional[0]
    if not os.path.isdir(run_dir):
        sys.stderr.write(f"state_check.py: runDir not found or not a directory: {run_dir}\n")
        return 2

    report = check_run_dir(run_dir)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not json_only:
        w = sys.stderr.write
        w(f"=== state_check: {report['runDir']} ===\n")
        for m in report["missing"]:
            w(f"  MISSING: {m}\n")
        for v in report["invalid"]:
            w(f"  INVALID: {v}\n")
        for n in report["notes"]:
            w(f"  note:    {n}\n")
        w("STATE OK — external state complete and intact; safe to resume.\n"
          if report["ok"] else
          "STATE BROKEN — do NOT resume from memory; surface this report to the human.\n")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
