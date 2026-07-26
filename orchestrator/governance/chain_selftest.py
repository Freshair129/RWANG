#!/usr/bin/env python3
"""chain_selftest.py — guard test for the `event-hash-chain` policy (tamper-evident
progress.ndjson).

Proves, with real subprocess calls to orchestrator/progress.py (invoked exactly the
way the runner's agents invoke it, runDir-first), that the hash chain over
progress.ndjson is BOTH accepted when intact and rejected when attacked — a
self-test that cannot pass vacuously:

  1. fresh fixture (init + 3 events)            -> verify-chain exit 0 (intact)
  2. tamper: flip ONE character of a middle
     event's detail, keep its stored hash       -> verify-chain exit 1 (tampered)
  3. fresh fixture, truncate the LAST line
     (chain still self-consistent!)             -> verify-chain exit 1 (tip no longer
                                                   matches progress.json last_event_hash)
  4. legacy fixture (hand-written ndjson with
     no hash fields + snapshot without
     last_event_hash)                           -> verify-chain exit 0 AND the report
                                                   carries the "no chain (legacy run)"
                                                   warning

All fixtures live in a tempdir; nothing outside it is touched. Deterministic:
timestamps are pinned via --ts, so the whole chain (and every hash) is reproducible.
Referenced by governance.yaml as the guard_test of the event-hash-chain policy.

USAGE:
    python orchestrator/governance/chain_selftest.py --self-test
    python orchestrator/governance/chain_selftest.py              # same as --self-test

OUTPUT: JSON report -> stdout, human summary -> stderr (route.py/governance_lint.py
        convention).
EXIT:   0 chain guard verified (all four legs behave)  ·  1 guard broken
        2 usage error
Deterministic, stdlib-only, no LLM calls (core rule).
"""
import json
import os
import subprocess
import sys
import tempfile

# Windows: piped stdout/stderr default to cp1252 -> UnicodeEncodeError on Thai
# paths/notes (same false-block governance_lint.py guards against — M7). Force utf-8.
for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))  # <repo>/orchestrator/governance -> <repo>
PROGRESS = os.path.join(ROOT, "orchestrator", "progress.py")
PY = sys.executable
TS = "2026-01-01T00:00:00+00:00"  # pinned -> every fixture hash is reproducible


def _run(argv, timeout=60):
    """Run one CLI (no shell), return (exit_code, stdout, stderr)."""
    try:
        p = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=timeout)
        return p.returncode, p.stdout or "", p.stderr or ""
    except subprocess.TimeoutExpired:
        return 124, "", "<timeout after %ds>" % timeout


def _make_run(run_dir):
    """Build a fixture run the way real agents do: init with a minimal tasks.json,
    then three events — all via subprocess, all runDir-FIRST (the runner's natural
    argument order, which progress.py normalizes)."""
    os.makedirs(run_dir, exist_ok=True)
    tasks_path = os.path.join(run_dir, "tasks.json")
    with open(tasks_path, "w", encoding="utf-8") as f:
        json.dump([{"id": "T-1", "description": "chain fixture task", "tier": "T1",
                    "executor_model": "local-fixture", "verify_command": "true",
                    "depends_on": []}], f)
    steps = [
        [PY, PROGRESS, run_dir, "init", "--spec", "fixture.yaml", "--target", "fixture",
         "--autonomy", "autonomous", "--epic", "chain selftest", "--tasks", tasks_path,
         "--ts", TS],
        [PY, PROGRESS, run_dir, "event", "--task", "T-1", "--status", "running",
         "--tier", "T1", "--model", "local-fixture", "--cost", "0",
         "--note", "attempt started", "--ts", TS],
        [PY, PROGRESS, run_dir, "event", "--task", "T-1", "--status", "pass",
         "--tier", "T1", "--model", "local-fixture", "--cost", "0",
         "--note", "verify_command exit 0", "--ts", TS],
        [PY, PROGRESS, run_dir, "event", "--task", "T-1", "--status", "note",
         "--tier", "T1", "--model", "local-fixture", "--cost", "0",
         "--note", "bookkeeping note", "--ts", TS],
    ]
    for argv in steps:
        rc, out, err = _run(argv)
        if rc != 0:
            raise RuntimeError("fixture build failed (%s): exit %d: %s"
                               % (" ".join(argv[2:4]), rc, (out + err).strip()[:300]))


def _verify(run_dir):
    """Run verify-chain (subcommand-FIRST order — so the selftest exercises BOTH
    accepted argument orders). Returns (exit_code, parsed_report_or_None, stderr)."""
    rc, out, err = _run([PY, PROGRESS, "verify-chain", run_dir])
    try:
        report = json.loads(out)
    except ValueError:
        report = None
    return rc, report, err


def _read_lines(path):
    with open(path, "r", encoding="utf-8") as f:
        return [l for l in f.read().splitlines() if l.strip()]


def _write_lines(path, lines):
    with open(path, "w", encoding="utf-8") as f:
        for l in lines:
            f.write(l + "\n")


def self_test():
    checks = []

    def check(name, ok, detail):
        checks.append({"name": name, "ok": bool(ok), "detail": detail})
        sys.stderr.write("  [%s] %s — %s\n" % ("OK  " if ok else "FAIL", name, detail))

    with tempfile.TemporaryDirectory() as td:
        # ---- leg 1: intact chain must verify (exit 0, non-vacuously: 4 hashed events)
        run_a = os.path.join(td, "run-intact")
        _make_run(run_a)
        rc, report, _ = _verify(run_a)
        hashed = report.get("hashed") if isinstance(report, dict) else None
        check("intact-chain", rc == 0 and isinstance(report, dict)
              and report.get("ok") is True and hashed == 4,
              "verify-chain exit %s, hashed=%s (want exit 0, hashed=4)" % (rc, hashed))

        # ---- leg 2: tamper ONE character of a middle event's note -> exit 1
        ndjson_a = os.path.join(run_a, "progress.ndjson")
        lines = _read_lines(ndjson_a)
        mid = len(lines) // 2  # a middle line (not first, not last)
        ev = json.loads(lines[mid])
        detail = ev.get("detail") or "x"
        flipped = ("X" if detail[0] != "X" else "Y") + detail[1:]  # change exactly 1 char
        ev["detail"] = flipped
        lines[mid] = json.dumps(ev, ensure_ascii=False)  # stored hashes kept as-is
        _write_lines(ndjson_a, lines)
        rc, report, _ = _verify(run_a)
        check("tampered-middle-line", rc == 1,
              "verify-chain exit %s after 1-char note edit on line %d (want 1)"
              % (rc, mid + 1))

        # ---- leg 3: truncation attack on a FRESH fixture -> exit 1
        # (dropping the tail keeps the remaining chain self-consistent; only the
        #  last_event_hash anchor in progress.json exposes it)
        run_b = os.path.join(td, "run-truncated")
        _make_run(run_b)
        ndjson_b = os.path.join(run_b, "progress.ndjson")
        lines_b = _read_lines(ndjson_b)
        _write_lines(ndjson_b, lines_b[:-1])  # drop the last event
        rc, report, _ = _verify(run_b)
        check("truncated-tail", rc == 1,
              "verify-chain exit %s after dropping the last ndjson line (want 1)" % rc)

        # ---- leg 4: pure-legacy run (no hash fields anywhere) -> exit 0 + warning
        run_c = os.path.join(td, "run-legacy")
        os.makedirs(run_c, exist_ok=True)
        with open(os.path.join(run_c, "progress.ndjson"), "w", encoding="utf-8") as f:
            for detail in ("legacy event one", "legacy event two"):
                f.write(json.dumps({"ts": TS, "task": "T-1", "event": "note",
                                    "status": "running", "tier": "", "model": "",
                                    "cost_usd": 0.0, "detail": detail}) + "\n")
        with open(os.path.join(run_c, "progress.json"), "w", encoding="utf-8") as f:
            json.dump({"runId": "run-legacy", "status": "running", "tasks": [],
                       "events": []}, f)  # note: NO last_event_hash key
        rc, report, err = _verify(run_c)
        warns = report.get("warnings", []) if isinstance(report, dict) else []
        has_warn = any("no chain (legacy run)" in w for w in warns)
        check("legacy-run-warns", rc == 0 and has_warn,
              "verify-chain exit %s, warnings=%r (want exit 0 + 'no chain (legacy run)')"
              % (rc, warns))

        # ---- leg 5: CONCURRENT appends must still verify (adversarial review MJ1:
        # the snapshot tip used to mirror a process-local value under a separate
        # lock, so a parallel wave — run.js's normal path — made verify-chain cry
        # BROKEN on an untampered chain)
        run_d = os.path.join(td, "run-concurrent")
        _make_run(run_d)
        procs = []
        for i in range(12):
            procs.append(subprocess.Popen(
                [PY, PROGRESS, run_d, "event", "--task", "T-1", "--status", "note",
                 "--tier", "T1", "--model", "local-fixture", "--cost", "0",
                 "--note", "concurrent event %d" % i, "--ts", TS],
                cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        rcs = [p.wait(timeout=120) for p in procs]
        rc, report, err = _verify(run_d)
        hashed = report.get("hashed") if isinstance(report, dict) else None
        check("concurrent-appends-intact",
              all(r == 0 for r in rcs) and rc == 0
              and isinstance(report, dict) and report.get("ok") is True
              and (hashed or 0) >= 16,
              "12 parallel events: appender exits=%r, verify exit %s, hashed=%s "
              "(want all 0, exit 0, hashed>=16)" % (sorted(set(rcs)), rc, hashed))

    ok = all(c["ok"] for c in checks)
    report = {"ok": ok, "policy": "event-hash-chain",
              "checks": checks,
              "counts": {"total": len(checks),
                         "failed": sum(1 for c in checks if not c["ok"])}}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.stderr.write("chain_selftest: %s (%d/%d checks passed)\n"
                     % ("GUARD VERIFIED" if ok else "GUARD BROKEN",
                        len(checks) - report["counts"]["failed"], len(checks)))
    return 0 if ok else 1


def main(argv):
    if argv and argv[0] in ("-h", "--help"):
        sys.stderr.write(__doc__)
        return 2
    if argv and argv != ["--self-test"]:
        sys.stderr.write("chain_selftest.py: unknown args %r (only --self-test)\n" % (argv,))
        return 2
    try:
        return self_test()
    except RuntimeError as e:
        print(json.dumps({"ok": False, "policy": "event-hash-chain",
                          "checks": [], "error": str(e)}, ensure_ascii=False, indent=2))
        sys.stderr.write("chain_selftest: GUARD BROKEN — %s\n" % e)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
