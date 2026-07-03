#!/usr/bin/env python3
"""tool_guard.py — G3 action-classification choke point (GP4).

ONE place that answers "may this command run?" from blocked_patterns.txt:
  EXTERNAL    -> never in autonomy (Rwang invariant #1) — a human runs it or nobody does
  DESTRUCTIVE -> requires human confirmation — blocked here; a human who intends it
                 runs it themselves (running it manually IS the confirmation)

Two runtime faces:
  --check "<command line>"   classify one command: exit 0 allow / 3 EXTERNAL /
                             4 DESTRUCTIVE (JSON verdict on stdout)
  --hook                     Claude Code PreToolUse hook: reads the hook JSON from
                             stdin ({tool_name, tool_input}); when tool_input has a
                             "command" string it is classified — EXTERNAL/DESTRUCTIVE
                             exit 2 (the documented BLOCK code; stderr is surfaced to
                             the model), anything else exit 0. Malformed input
                             FAILS OPEN (exit 0 + stderr warning): a broken guard
                             must not brick every tool call in the harness — the
                             failure is visible in stderr and governance_lint still
                             proves the classifier itself daily via --self-test.

Wiring: .claude/settings.json PreToolUse (this repo) + run.js human_review halt.
Patterns are line-regex over the command string — argv-level matching is the
known upgrade for false positives (see blocked_patterns.txt header).

USAGE:
    python orchestrator/governance/tool_guard.py --check "git push origin main"
    ... | python orchestrator/governance/tool_guard.py --hook
    python orchestrator/governance/tool_guard.py --self-test
EXIT (--check): 0 allow · 3 EXTERNAL · 4 DESTRUCTIVE · 2 usage
EXIT (--hook):  0 allow/fail-open · 2 BLOCK
stdlib-only, deterministic.
"""
import json
import os
import sys

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import test_guards  # noqa: E402  — load_patterns / match_blocked (same dir)

BLOCK_MSG = {
    "EXTERNAL": ("BLOCKED by Rwang governance (no-external-write, invariant #1): "
                 "this command writes outside the machine/repo. Autonomy may never "
                 "run it — surface it for a human instead."),
    "DESTRUCTIVE": ("BLOCKED by Rwang governance (confirm-destructive, G3): this "
                    "command is hard to reverse. A human must run it themselves if "
                    "it is intended (running it manually IS the confirmation)."),
}


def classify(cmdline, patterns=None):
    patterns = patterns if patterns is not None else test_guards.load_patterns()
    return test_guards.match_blocked(cmdline, patterns)


def cmd_check(cmdline):
    cls = classify(cmdline)
    print(json.dumps({"command": cmdline, "class": cls,
                      "allow": cls is None}, ensure_ascii=False))
    if cls == "EXTERNAL":
        return 3
    if cls == "DESTRUCTIVE":
        return 4
    return 0


def cmd_hook(stdin_text):
    try:
        payload = json.loads(stdin_text)
        command = ((payload.get("tool_input") or {}).get("command")
                   if isinstance(payload, dict) else None)
    except ValueError:
        sys.stderr.write("tool_guard --hook: malformed hook JSON — failing OPEN\n")
        return 0
    if not isinstance(command, str) or not command.strip():
        return 0  # not a shell-command tool call — nothing to classify
    try:
        cls = classify(command)
    except (OSError, ValueError) as e:
        sys.stderr.write(f"tool_guard --hook: pattern load failed ({e}) — failing OPEN\n")
        return 0
    if cls in BLOCK_MSG:
        sys.stderr.write(BLOCK_MSG[cls] + f"\n  command: {command}\n")
        return 2
    return 0


# --------------------------------------------------------------------------- #
def self_test():
    import subprocess
    py = sys.executable
    me = os.path.abspath(__file__)
    fails = []

    def step(name, cond, detail=""):
        sys.stderr.write("[%s] %s%s\n" % ("OK  " if cond else "FAIL", name,
                                          (" — " + detail) if (detail and not cond) else ""))
        if not cond:
            fails.append(name)

    # (1) --check classification (delegates to the same patterns blocked-patterns
    #     test proves in depth — here we prove the EXIT-CODE contract)
    for cmd, want in (("git push origin main", 3),
                      ("git -C G:/x push", 3),
                      ("git reset --hard HEAD~1", 4),
                      ("rm -rf build/", 4),
                      ("git status", 0),
                      ("python -m http.server", 0)):
        p = subprocess.run([py, me, "--check", cmd], capture_output=True, text=True)
        step(f"check: {cmd!r} -> exit {want}", p.returncode == want,
             f"got {p.returncode}: {p.stdout.strip()[:120]}")

    # (2) --hook protocol: EXTERNAL/DESTRUCTIVE block with exit 2 + stderr message
    def hook(payload_text):
        p = subprocess.run([py, me, "--hook"], input=payload_text,
                           capture_output=True, text=True)
        return p.returncode, p.stderr

    rc, err = hook(json.dumps({"tool_name": "Bash",
                               "tool_input": {"command": "git push origin main"}}))
    step("hook: git push -> exit 2 + message", rc == 2 and "no-external-write" in err,
         f"rc={rc} err={err[:120]}")
    rc, err = hook(json.dumps({"tool_name": "Bash",
                               "tool_input": {"command": "git checkout ."}}))
    step("hook: git checkout . -> exit 2 (confirm-destructive)",
         rc == 2 and "confirm-destructive" in err, f"rc={rc} err={err[:120]}")
    rc, _ = hook(json.dumps({"tool_name": "Bash",
                             "tool_input": {"command": "git log --oneline -5"}}))
    step("hook: benign command -> exit 0", rc == 0, f"rc={rc}")
    rc, _ = hook(json.dumps({"tool_name": "Read",
                             "tool_input": {"file_path": "x.txt"}}))
    step("hook: non-command tool -> exit 0", rc == 0, f"rc={rc}")

    # (3) fail-open on malformed input (a broken guard must not brick the harness)
    rc, err = hook("{not json")
    step("hook: malformed stdin -> exit 0 (fail open) + warning",
         rc == 0 and "failing OPEN" in err, f"rc={rc} err={err[:120]}")

    if fails:
        print("SELF-TEST FAILED — %d case(s): %s" % (len(fails), ", ".join(fails)))
        return 1
    print("SELF-TEST OK — check exit-codes, hook block/allow, non-command pass-through, "
          "fail-open all proven.")
    return 0


def main(argv):
    if argv == ["--self-test"]:
        return self_test()
    if argv == ["--hook"]:
        return cmd_hook(sys.stdin.read())
    if len(argv) == 2 and argv[0] == "--check":
        return cmd_check(argv[1])
    sys.stderr.write(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
