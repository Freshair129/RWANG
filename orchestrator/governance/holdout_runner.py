#!/usr/bin/env python3
"""holdout_runner.py — G7 holdout-acceptance gate runner (GP6).

Holdout cases are acceptance checks the worker model has NEVER seen: they live
under <runDir>/tests/holdout/ on the ORCHESTRATOR side (a different tree from
the target repo the worker edits), are never injected into any prompt, and are
executed only HERE — by the gate, from the outside. That makes holdout secrecy
STRUCTURAL (governance spec §9.2): hardcoding past the visible acceptance still
fails the case the worker could not have read.

LAYOUT:  <runDir>/tests/holdout/<task_id>.json — findings-format (the exact
check_evidence.py shape): [{"id","evidence_command","must_match"?}, ...].
Commands run with cwd = the TARGET repo (they probe the worker's output).

USAGE:
    python orchestrator/governance/holdout_runner.py <runDir> --target <repo> [--task ID] [--json]
    python orchestrator/governance/holdout_runner.py --self-test
EXIT: 0 all holdout pass (or none exist — reported, never silent) · 1 any fail
      · 2 usage
The caller (run.js gate step) records verify.holdout_exit via progress.py
--holdout-exit; this script writes NOTHING into progress files.
stdlib-only, deterministic.
"""
import json
import os
import re
import subprocess
import sys

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CHECK_EVIDENCE = os.path.join(ROOT, "orchestrator", "check_evidence.py")


def run_holdout(run_dir, target, only_task=None, json_only=False):
    hold_dir = os.path.join(run_dir, "tests", "holdout")
    report = {"ok": True, "holdout_dir": hold_dir, "tasks": {}, "skipped": False}
    if not os.path.isdir(hold_dir):
        report["skipped"] = True
        print(json.dumps(report, ensure_ascii=False))
        sys.stderr.write("holdout_runner: no tests/holdout/ in this run — nothing to "
                         "gate (reported, not silent)\n")
        return 0
    if not os.path.isdir(target):
        sys.stderr.write(f"holdout_runner: target repo not found: {target!r}\n")
        return 2

    files = sorted(f for f in os.listdir(hold_dir) if f.endswith(".json"))
    if only_task is not None:
        files = [f for f in files if os.path.splitext(f)[0] == only_task]
        if not files:
            sys.stderr.write(f"holdout_runner: no holdout file for task {only_task!r}\n")
            return 2

    any_fail = False
    for fn in files:
        task = os.path.splitext(fn)[0]
        # check_evidence runs each case's evidence_command; cwd = target so the
        # commands probe the worker's actual output tree.
        try:
            p = subprocess.run([sys.executable, CHECK_EVIDENCE,
                                os.path.join(hold_dir, fn)],
                               cwd=target, capture_output=True, text=True,
                               encoding="utf-8", errors="replace", timeout=600)
            rc = p.returncode
        except (subprocess.TimeoutExpired, OSError):
            rc = 124
        report["tasks"][task] = rc
        if rc != 0:
            any_fail = True
    report["ok"] = not any_fail
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not json_only:
        for task, rc in report["tasks"].items():
            sys.stderr.write("  [%s] holdout %s (exit %d)\n"
                             % ("PASS" if rc == 0 else "FAIL", task, rc))
    return 1 if any_fail else 0


def _isolation_structural_check():
    """holdout must never leak into WORKER prompts: the EXEC prompt builder in
    run.js (EXEC_STATIC + executePrompt) must not mention holdout at all —
    holdout appears in run.js ONLY in the gate step that calls this script."""
    runjs = os.path.join(ROOT, "orchestrator", "run.js")
    src = open(runjs, "r", encoding="utf-8").read()
    # EXEC_STATIC closes as `].join("\n");` — match the closing bracket at line
    # start, whatever trails it.
    m = re.search(r"const EXEC_STATIC\s*=\s*\[[\s\S]*?^\]", src, re.M)
    exec_block = m.group(0) if m else ""
    m2 = re.search(r"function executePrompt[\s\S]*?\n\}", src)
    exec_fn = m2.group(0) if m2 else ""
    problems = []
    if not exec_block:
        problems.append("EXEC_STATIC block not found in run.js (marker moved?)")
    if "holdout" in exec_block.lower():
        problems.append("EXEC_STATIC mentions holdout — worker prompt leak")
    if "holdout" in exec_fn.lower():
        problems.append("executePrompt mentions holdout — worker prompt leak")
    return problems


# --------------------------------------------------------------------------- #
def self_test():
    import tempfile
    py = sys.executable
    me = os.path.abspath(__file__)
    fails = []

    def step(name, cond, detail=""):
        sys.stderr.write("[%s] %s%s\n" % ("OK  " if cond else "FAIL", name,
                                          (" — " + detail) if (detail and not cond) else ""))
        if not cond:
            fails.append(name)

    with tempfile.TemporaryDirectory() as td:
        target = os.path.join(td, "target")
        os.makedirs(target)
        with open(os.path.join(target, "out.txt"), "w", encoding="utf-8") as f:
            f.write("sentinel-good\n")

        rd = os.path.join(td, "run")
        hold = os.path.join(rd, "tests", "holdout")
        os.makedirs(hold)

        def write_holdout(task, cases):
            with open(os.path.join(hold, task + ".json"), "w", encoding="utf-8") as f:
                json.dump(cases, f)

        def cli(*extra):
            p = subprocess.run([py, me, rd, "--target", target, "--json"] + list(extra),
                               capture_output=True, text=True, encoding="utf-8",
                               errors="replace", timeout=300)
            try:
                rep = json.loads(p.stdout)
            except ValueError:
                rep = None
            return p.returncode, rep, (p.stderr or "")

        # (1) passing holdout (probes worker output via cwd=target)
        write_holdout("T-OK", [{"id": "h1",
                                "evidence_command": "python -c \"import sys; sys.exit(0 if 'sentinel-good' in open('out.txt').read() else 1)\""}])
        rc, rep, err = cli()
        step("passing holdout -> exit 0", rc == 0 and rep and rep["tasks"].get("T-OK") == 0,
             err[:200])

        # (2) hardcode-past-visible scenario: worker output breaks the unseen case
        with open(os.path.join(target, "out.txt"), "w", encoding="utf-8") as f:
            f.write("hardcoded-to-pass-visible\n")
        rc, rep, err = cli()
        step("holdout catches the unseen regression -> exit 1",
             rc == 1 and rep and rep["tasks"].get("T-OK") != 0, err[:200])

        # (3) --task filter
        rc, rep, err = cli("--task", "T-OK")
        step("--task filter runs exactly that task", rc == 1 and rep
             and list(rep["tasks"].keys()) == ["T-OK"], err[:200])
        rc, _, err = cli("--task", "NOPE")
        step("--task unknown -> exit 2", rc == 2, err[:200])

        # (4) run with NO holdout dir -> exit 0 + skipped:true (never silent)
        rd2 = os.path.join(td, "run-empty")
        os.makedirs(rd2)
        p = subprocess.run([py, me, rd2, "--target", target, "--json"],
                           capture_output=True, text=True, timeout=60)
        rep2 = json.loads(p.stdout) if p.stdout.strip() else None
        step("no holdout dir -> exit 0 + skipped flag",
             p.returncode == 0 and rep2 and rep2.get("skipped") is True, p.stderr[:200])

    # (5) STRUCTURAL isolation: worker prompts in run.js never mention holdout
    problems = _isolation_structural_check()
    step("isolation: EXEC prompts never mention holdout", not problems,
         "; ".join(problems))

    if fails:
        print("SELF-TEST FAILED — %d case(s): %s" % (len(fails), ", ".join(fails)))
        return 1
    print("SELF-TEST OK — pass path, unseen-regression catch, task filter, "
          "no-holdout reporting, prompt-isolation all proven.")
    return 0


def main(argv):
    if argv == ["--self-test"]:
        return self_test()
    args = [a for a in argv if not a.startswith("--")]
    json_only = "--json" in argv
    target = None
    only_task = None
    i = 0
    rest = []
    while i < len(argv):
        a = argv[i]
        if a == "--target" and i + 1 < len(argv):
            target = argv[i + 1]; i += 2
        elif a == "--task" and i + 1 < len(argv):
            only_task = argv[i + 1]; i += 2
        elif a == "--json":
            i += 1
        elif a.startswith("-"):
            sys.stderr.write(f"holdout_runner: unknown arg {a!r}\n"); return 2
        else:
            rest.append(a); i += 1
    if len(rest) != 1 or not target:
        sys.stderr.write(__doc__)
        return 2
    _ = args
    return run_holdout(rest[0], target, only_task, json_only)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
