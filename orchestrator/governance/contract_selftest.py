#!/usr/bin/env python3
"""contract_selftest.py — guard_test of the shared-runtime-contract policy (GP5).

Proves that progress.py (the sole writer) actually EMITS events that validate
against event_schema.json — not just that the schema file is well-formed (that
weaker check lives in test_guards.py shared-runtime-contract and is run first
here). Builds a real fixture via the progress.py CLI exactly the way runner
agents call it, then validates EVERY ndjson line with the same validator
governance_lint --run-dir uses. Non-vacuous: a hand-corrupted event must fail.

USAGE:
    python orchestrator/governance/contract_selftest.py --self-test
EXIT: 0 = contract proven · 1 = violation · 2 = fixture build failure
stdlib-only, deterministic (pinned --ts).
"""
import json
import os
import subprocess
import sys
import tempfile

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import test_guards  # noqa: E402 — validate_event

PY = sys.executable
PROGRESS = os.path.join(ROOT, "orchestrator", "progress.py")
TS = "2026-07-03T12:00:00+07:00"


def _run(argv, timeout=60):
    p = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=timeout)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def self_test():
    checks = []

    def check(name, ok, detail=""):
        checks.append(ok)
        sys.stderr.write("  [%s] %s%s\n" % ("OK  " if ok else "FAIL", name,
                                            (" — " + detail) if (detail and not ok) else ""))

    # (0) schema file itself is sane (delegate to the existing structural test)
    rc, out = _run([PY, os.path.join(HERE, "test_guards.py"), "shared-runtime-contract"])
    check("schema well-formed (test_guards)", rc == 0, out.strip()[:200])
    schema = json.load(open(os.path.join(HERE, "event_schema.json"), "r", encoding="utf-8"))

    with tempfile.TemporaryDirectory() as td:
        rd = os.path.join(td, "run-contract")
        os.makedirs(rd)
        tasks_path = os.path.join(rd, "tasks.json")
        with open(tasks_path, "w", encoding="utf-8") as f:
            json.dump([{"id": "T-1", "description": "contract fixture", "tier": "T1",
                        "executor_model": "local-fixture", "verify_command": "true",
                        "depends_on": []}], f)

        # Build the fixture the way agents do — incl. the new contract flags.
        steps = [
            [PY, PROGRESS, rd, "init", "--spec", "fx.yaml", "--target", "fx",
             "--autonomy", "supervised", "--epic", "contract", "--tasks", tasks_path, "--ts", TS],
            [PY, PROGRESS, rd, "event", "--task", "T-1", "--status", "running",
             "--tier", "T1", "--model", "m", "--cost", "0", "--note", "start",
             "--attempt", "1", "--ts", TS],
            [PY, PROGRESS, rd, "event", "--task", "T-1", "--status", "pass",
             "--tier", "T1", "--model", "m", "--cost", "0", "--note", "verified",
             "--attempt", "1", "--files", "src/a.ts,src/b.ts",
             "--verify-cmd", "npx vitest run", "--verify-exit", "0",
             "--holdout-exit", "0", "--ts", TS],
            [PY, PROGRESS, rd, "gate", "--phase", "review", "--await", "--ts", TS],
            [PY, PROGRESS, rd, "approve", "--phase", "review", "--by", "boss", "--ts", TS],
            [PY, PROGRESS, rd, "finish", "--status", "done", "--ts", TS],
        ]
        for argv in steps:
            rc, out = _run(argv)
            if rc != 0:
                sys.stderr.write("fixture step failed: %s\nexit %d: %s\n"
                                 % (" ".join(argv[2:4]), rc, out.strip()[:300]))
                return 2

        # (1) EVERY emitted event validates against the contract
        lines = [l for l in open(os.path.join(rd, "progress.ndjson"), encoding="utf-8")
                 .read().splitlines() if l.strip()]
        bad = []
        for i, line in enumerate(lines, 1):
            errs = test_guards.validate_event(json.loads(line), schema)
            if errs:
                bad.append(f"line {i}: {'; '.join(errs[:3])}")
        check(f"all {len(lines)} emitted events validate", not bad, " | ".join(bad[:4]))
        check("fixture emitted a real spread of event types",
              len(lines) >= 6, f"only {len(lines)} lines")

        # (2) the pass event carries the rich contract fields end-to-end
        ev_pass = next((json.loads(l) for l in lines
                        if json.loads(l).get("event_type") == "attempt"
                        or json.loads(l).get("status") == "passed"), None)
        rich = next((json.loads(l) for l in lines if json.loads(l).get("files")), None)
        check("files[] survives the round-trip",
              bool(rich) and rich["files"] == ["src/a.ts", "src/b.ts"],
              json.dumps(rich, ensure_ascii=False)[:200] if rich else "no event with files")
        withv = next((json.loads(l) for l in lines
                      if isinstance(json.loads(l).get("verify"), dict)), None)
        check("verify{visible_exit, holdout_exit} present",
              bool(withv) and withv["verify"].get("visible_exit") == 0
              and withv["verify"].get("holdout_exit") == 0,
              json.dumps(withv, ensure_ascii=False)[:200] if withv else "none")
        appr = next((json.loads(l) for l in lines
                     if json.loads(l).get("approved_by")), None)
        check("approved_by lands on the approve event",
              bool(appr) and appr["approved_by"] == "boss", "")
        _ = ev_pass  # (naming clarity only)

        # (3) chain still intact with the enriched bodies
        rc, _out = _run([PY, PROGRESS, "verify-chain", rd])
        check("hash chain intact over contract-enriched events", rc == 0, _out := "")

        # (4) non-vacuous: a corrupted event MUST fail validation
        broken = json.loads(lines[0])
        broken.pop("run_id", None)
        broken["attempt_id"] = "zero"
        errs = test_guards.validate_event(broken, schema)
        check("corrupted event is rejected (validator not a rubber stamp)",
              len(errs) >= 2, f"errs={errs}")

    ok = all(checks)
    print(json.dumps({"ok": ok, "policy": "shared-runtime-contract",
                      "checks": len(checks),
                      "failed": sum(1 for c in checks if not c)}, ensure_ascii=False))
    return 0 if ok else 1


def main(argv):
    if argv in ([], ["--self-test"]):
        return self_test()
    sys.stderr.write(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
