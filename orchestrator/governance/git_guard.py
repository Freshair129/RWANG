#!/usr/bin/env python3
"""git_guard.py — branch-only guard (G3/GP4, Rwang invariant #4).

Every run lands on a branch, never directly on the target's default branch.
This guard answers ONE question deterministically: "is <repo> currently on its
default branch?" — exit 1 (refuse) when it is, exit 0 when it is on any other
branch. run.js's commit path (unattended phaseCommit) and any wrapper call this
BEFORE a commit; the check is code, not prompt discipline.

Default-branch resolution (deterministic order):
  1. origin/HEAD symbolic ref (what the remote calls default)
  2. a local branch literally named main, then master
  3. unresolvable -> exit 2 (fail CLOSED for a commit gate: unknown default
     means we cannot prove safety, so the caller must not auto-commit)

USAGE:
    python orchestrator/governance/git_guard.py <repoPath>        # 0 = safe (on a branch)
    python orchestrator/governance/git_guard.py <repoPath> --json
    python orchestrator/governance/git_guard.py --self-test
EXIT: 0 on-a-work-branch · 1 ON DEFAULT BRANCH (refuse) · 2 usage/unresolvable
stdlib-only, deterministic.
"""
import json
import os
import subprocess
import sys

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

GIT_TIMEOUT = 60


def _git(repo, *argv):
    try:
        p = subprocess.run(["git", "-C", repo] + list(argv), capture_output=True,
                           text=True, encoding="utf-8", errors="replace",
                           timeout=GIT_TIMEOUT)
        return p.returncode, (p.stdout or "").strip()
    except (subprocess.TimeoutExpired, OSError):
        return 127, ""


def default_branch(repo):
    rc, out = _git(repo, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD")
    if rc == 0 and out.startswith("origin/"):
        return out[len("origin/"):]
    for cand in ("main", "master"):
        rc, _ = _git(repo, "show-ref", "--verify", "--quiet", f"refs/heads/{cand}")
        if rc == 0:
            return cand
    return None


def check(repo, json_only=False):
    rc, cur = _git(repo, "rev-parse", "--abbrev-ref", "HEAD")
    if rc != 0 or not cur:
        sys.stderr.write(f"git_guard: {repo!r} is not a usable git repo\n")
        return 2
    default = default_branch(repo)
    report = {"repo": repo, "branch": cur, "default_branch": default,
              "on_default": (default is not None and cur == default)}
    print(json.dumps(report, ensure_ascii=False))
    if default is None:
        sys.stderr.write("git_guard: cannot resolve the default branch — failing "
                         "CLOSED (a commit gate must not guess)\n")
        return 2
    if cur == default:
        sys.stderr.write(f"git_guard: REFUSE — HEAD is on the default branch "
                         f"{default!r} (invariant #4: work on a run branch)\n")
        return 1
    if not json_only:
        sys.stderr.write(f"git_guard: ok — on work branch {cur!r} (default {default!r})\n")
    return 0


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

    def run_guard(repo):
        p = subprocess.run([py, me, repo, "--json"], capture_output=True, text=True)
        return p.returncode, p.stderr

    with tempfile.TemporaryDirectory() as td:
        repo = os.path.join(td, "repo")
        os.makedirs(repo)

        def git(*argv):
            return subprocess.run(["git", "-C", repo] + list(argv),
                                  capture_output=True, text=True, timeout=60).returncode

        if git("init", "-b", "main") != 0:
            # older git without -b
            git("init")
            git("checkout", "-b", "main")
        git("config", "user.name", "git-guard-selftest")
        git("config", "user.email", "guard@example.invalid")
        git("config", "commit.gpgsign", "false")
        with open(os.path.join(repo, "f.txt"), "w", encoding="utf-8") as f:
            f.write("x\n")
        git("add", "-A")
        git("commit", "-m", "init")

        rc, err = run_guard(repo)
        step("on default branch (main) -> exit 1 REFUSE", rc == 1, err[:150])

        git("checkout", "-b", "rwang/run-001")
        rc, err = run_guard(repo)
        step("on work branch -> exit 0", rc == 0, err[:150])

        rc, err = run_guard(os.path.join(td, "not-a-repo"))
        step("non-repo -> exit 2", rc == 2, err[:150])

    if fails:
        print("SELF-TEST FAILED — %d case(s): %s" % (len(fails), ", ".join(fails)))
        return 1
    print("SELF-TEST OK — refuse-on-default, allow-on-branch, fail-closed-on-unknown proven.")
    return 0


def main(argv):
    if argv == ["--self-test"]:
        return self_test()
    args = [a for a in argv if not a.startswith("--")]
    json_only = "--json" in argv
    unknown = [a for a in argv if a.startswith("--") and a not in ("--json",)]
    if unknown or len(args) != 1:
        sys.stderr.write(__doc__)
        return 2
    return check(args[0], json_only)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
