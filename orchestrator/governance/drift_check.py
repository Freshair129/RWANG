#!/usr/bin/env python3
"""drift_check.py — the verify-claims guard (G2, GP3): re-prove that every task a
run CLAIMS passed still verifies against the live target repo.

An agent's progress report is testimony; the repo is evidence. Between the moment a
task's verify_command passed and the moment the run closes a phase, the working tree
can drift (a later wave's edit, a manual fix, parallel work landing badly). This
guard joins <runDir>/tasks.json (routed truth) with <runDir>/progress.json (live
status), takes every task whose status is `passed`, and re-runs its verify_command
against the CURRENT state of the target repo. A claim that no longer verifies is a
DRIFT finding.

CACHING (the spec's cache-risk control): a full re-verify at every boundary is
O(tasks) shell commands. drift_check keeps <runDir>/drift_cache.json:

    {"base_ref": "<merge-base of HEAD and the default branch — locked at first write>",
     "entries": {"<task_id>": {"state_hash": "...", "verify_exit": 0}}}

state_hash = sha256( git rev-parse HEAD + "\\n" + git status --porcelain + "\\n" +
git diff HEAD ) of the target repo — the exact worktree state. A passed task whose
cached state_hash equals the current hash AND whose cached verify_exit == 0 is
SKIPPED (counted in skipped_cache): unchanged diff -> no verify re-run. A cached
FAILURE is never skipped — only a proven pass short-circuits. The hash is computed
ONCE, before any verify runs: if a verify_command mutates the tree (build
artifacts), the next invocation simply cache-misses and re-proves — the cache can
only err toward re-running, never toward false-skipping. If the locked base_ref no
longer matches the current merge-base (branch rebased/retargeted), every entry is
invalidated and the base_ref is re-locked.

WRITES: this script writes ONLY <runDir>/drift_cache.json. It NEVER touches
progress.json / progress.ndjson — progress.py is the single writer of the shared
progress schema. The CALLER (run.js) reads this script's exit code and records the
`drift_detected` audit event through progress.py itself.

SECURITY: like check_evidence.py, this EXECUTES the verify_command strings found in
the run's tasks.json (through `bash -c` when bash exists, else the system shell;
cwd = the target repo; timeout 600 s each). Only run it over run dirs you trust.

USAGE:
    python orchestrator/governance/drift_check.py <runDir> --target <repoPath>
    python orchestrator/governance/drift_check.py <runDir> --target <repoPath> --json
    python orchestrator/governance/drift_check.py --self-test

OUTPUT: JSON -> stdout, pretty summary -> stderr (route.py / governance_lint.py
convention). The JSON is exactly:
    {"ok": bool,            # true iff drifted[] is empty
     "checked": int,        # verify_commands actually re-run this invocation
     "skipped_cache": int,  # passed tasks skipped via a cache hit (proven at this state)
     "unverifiable": int,   # passed tasks with an empty verify_command — WARNING, not
                            # fatal in v1 (route.py's T2 floor already governs those)
     "drifted": [{"task": str, "reason": str}]}

EXIT:   0 no drift · 1 drift detected · 2 usage/input error (bad args, missing
        tasks.json/progress.json, target not a usable git repo)

Deterministic, stdlib-only: the verdict depends only on the repo state and the
verify_commands' exit codes — no randomness, no timestamps in any decision.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys

# Windows: piped stdout/stderr default to cp1252 -> UnicodeEncodeError on Thai
# paths/notes (the same false-block class governance_lint hit — M7). Force utf-8.
for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

def _find_bash():
    """Resolve the bash used for verify_commands (check_evidence.py convention),
    but prefer GIT BASH explicitly on Windows: `shutil.which("bash")` can resolve
    to System32's bash.exe — the WSL launcher, a different OS where the host's
    python/paths (C:/...) do not exist — and a verify_command that passed on the
    host would then falsely "drift" with exit 127. Deterministic probe order:
    Git-Bash next to git.exe -> well-known Git installs -> PATH bash -> None
    (None = system shell, same fallback check_evidence.py uses)."""
    if os.name == "nt":
        git = shutil.which("git")
        if git:
            root = os.path.dirname(os.path.dirname(git))  # <Git>\cmd\git.exe -> <Git>
            for cand in (os.path.join(root, "bin", "bash.exe"),
                         os.path.join(root, "usr", "bin", "bash.exe")):
                if os.path.isfile(cand):
                    return cand
        for cand in (r"C:\Program Files\Git\bin\bash.exe",
                     r"C:\Program Files (x86)\Git\bin\bash.exe"):
            if os.path.isfile(cand):
                return cand
        b = shutil.which("bash")
        if b and "system32" in b.lower():
            return None  # WSL launcher: the system shell is truer to the host
        return b
    return shutil.which("bash")


_BASH = _find_bash()
VERIFY_TIMEOUT = 600   # per verify_command — same budget check_evidence.py uses
GIT_TIMEOUT = 120      # per git plumbing command
CACHE_NAME = "drift_cache.json"


# --------------------------------------------------------------------------- #
# git plumbing                                                                 #
# --------------------------------------------------------------------------- #
def _git(repo, *argv):
    """Run one git command in `repo`. Returns (rc, stdout). Never raises on rc!=0."""
    try:
        p = subprocess.run(["git", "-C", repo] + list(argv), capture_output=True,
                           text=True, encoding="utf-8", errors="replace",
                           timeout=GIT_TIMEOUT)
        return p.returncode, (p.stdout or "")
    except (subprocess.TimeoutExpired, OSError):
        return 127, ""


def _untracked_content_digest(repo, porcelain):
    """Digest of the BYTES of every untracked file, keyed by sorted path.

    `status --porcelain` lists '?? name' but neither it nor `diff HEAD` sees the
    CONTENT of untracked files — so a GOOD->BAD edit inside an untracked file left
    state_hash unchanged and the cache false-skipped a claim that no longer
    verifies (adversarial review MJ2). Untracked *directories* appear as one
    '?? dir/' entry, so walk them. Unreadable files digest as a marker (still a
    state change when they appear/disappear)."""
    names = []
    for line in porcelain.splitlines():
        if line.startswith("?? "):
            names.append(line[3:].strip().strip('"'))
    parts = []

    def digest_file(path):
        rel = os.path.relpath(path, repo).replace("\\", "/")
        try:
            with open(path, "rb") as f:
                h = hashlib.sha256(f.read()).hexdigest()
        except OSError:
            h = "<unreadable>"
        parts.append(rel + ":" + h)

    for name in sorted(names):
        p = os.path.join(repo, name)
        if os.path.isdir(p):
            for root, dirs, files in os.walk(p):
                dirs.sort()
                for fn in sorted(files):
                    digest_file(os.path.join(root, fn))
        elif os.path.isfile(p):
            digest_file(p)
    return "\n".join(parts)


def compute_state_hash(repo):
    """sha256(rev-parse HEAD + "\\n" + status --porcelain + "\\n" + diff HEAD
    + "\\n" + untracked-file content digest).

    Returns None when the target is not a usable git repo (no .git, no commits) —
    the caller turns that into a usage error (exit 2), never a silent pass.
    """
    parts = []
    porcelain = ""
    for argv in (("rev-parse", "HEAD"),
                 ("status", "--porcelain"),
                 ("diff", "HEAD")):
        rc, out = _git(repo, *argv)
        if rc != 0:
            return None
        if argv[0] == "status":
            porcelain = out
        parts.append(out)
    parts.append(_untracked_content_digest(repo, porcelain))
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()


def compute_base_ref(repo):
    """Merge-base of HEAD and the default branch (origin/HEAD -> main -> master).

    Locked into the cache at first write; a later mismatch (rebase/retarget)
    invalidates every cached entry. Returns "" when no default branch is
    resolvable — still deterministic, just pinning nothing.
    """
    default = None
    rc, out = _git(repo, "symbolic-ref", "--quiet", "--short",
                   "refs/remotes/origin/HEAD")
    if rc == 0 and out.strip():
        default = out.strip()          # e.g. "origin/main"
    else:
        for cand in ("main", "master"):
            rc, _o = _git(repo, "rev-parse", "--verify", "--quiet",
                          "refs/heads/" + cand)
            if rc == 0:
                default = cand
                break
    if not default:
        return ""
    rc, out = _git(repo, "merge-base", "HEAD", default)
    return out.strip() if rc == 0 else ""


# --------------------------------------------------------------------------- #
# cache (the ONLY file this script writes)                                     #
# --------------------------------------------------------------------------- #
def load_cache(path):
    """Read drift_cache.json. Missing/malformed -> fresh (base_ref None = unlocked)."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            c = json.load(f)
        if isinstance(c, dict) and isinstance(c.get("entries"), dict):
            base = c.get("base_ref")
            return {"base_ref": base if isinstance(base, str) else None,
                    "entries": {k: v for k, v in c["entries"].items()
                                if isinstance(v, dict)}}
    except (OSError, ValueError):
        pass
    return {"base_ref": None, "entries": {}}


def save_cache(path, cache):
    """Atomic write (tmp + replace) so a crash never leaves a torn cache."""
    tmp = path + ".tmp.%d" % os.getpid()
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


# --------------------------------------------------------------------------- #
# verify runner (check_evidence.py convention: bash -c, else system shell)     #
# --------------------------------------------------------------------------- #
def run_verify(cmd, cwd):
    """Run one verify_command in the target repo. Returns (rc, combined_output)."""
    argv = [_BASH, "-c", cmd] if _BASH else cmd
    try:
        p = subprocess.run(argv, shell=(_BASH is None), cwd=cwd,
                           capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=VERIFY_TIMEOUT)
        return p.returncode, ((p.stdout or "") + (p.stderr or "")).strip()
    except subprocess.TimeoutExpired:
        return 124, "<timeout after %ds>" % VERIFY_TIMEOUT
    except OSError as e:
        return 127, "<exec error: %s>" % e


# --------------------------------------------------------------------------- #
# run-dir join: tasks.json (routed truth) x progress.json (live status)        #
# --------------------------------------------------------------------------- #
def load_passed_tasks(run_dir):
    """Return [(task_id, verify_command)] for every task progress claims `passed`.

    verify_command comes from tasks.json (the routed truth) keyed by id, falling
    back to the progress.json copy for a passed task tasks.json no longer lists.
    Raises ValueError (-> exit 2) on missing/malformed inputs.
    """
    tasks_path = os.path.join(run_dir, "tasks.json")
    progress_path = os.path.join(run_dir, "progress.json")
    for p in (tasks_path, progress_path):
        if not os.path.isfile(p):
            raise ValueError("required file missing: %s" % p)
    try:
        with open(tasks_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except ValueError as e:
        raise ValueError("tasks.json unreadable: %s" % e)
    routed = raw.get("tasks") if isinstance(raw, dict) else raw
    if not isinstance(routed, list):
        raise ValueError('tasks.json must be a task array or {"tasks": [...]}')
    try:
        with open(progress_path, "r", encoding="utf-8") as f:
            snap = json.load(f)
    except ValueError as e:
        raise ValueError("progress.json unreadable: %s" % e)
    if not isinstance(snap, dict) or not isinstance(snap.get("tasks"), list):
        raise ValueError("progress.json must be an object with a tasks[] list")

    vc_by_id = {}
    for t in routed:
        if isinstance(t, dict):
            vc_by_id[str(t.get("id"))] = (t.get("verify_command") or "").strip()

    out = []
    for t in snap["tasks"]:
        if not isinstance(t, dict) or t.get("status") != "passed":
            continue
        tid = str(t.get("id", "<unnamed>"))
        vc = vc_by_id.get(tid)
        if vc is None:
            vc = (t.get("verify_command") or "").strip()
        out.append((tid, vc))
    return out


# --------------------------------------------------------------------------- #
# the check                                                                    #
# --------------------------------------------------------------------------- #
def run_check(run_dir, target, json_only):
    try:
        passed = load_passed_tasks(run_dir)
    except ValueError as e:
        sys.stderr.write("drift_check.py: %s\n" % e)
        return 2

    state_hash = compute_state_hash(target)
    if state_hash is None:
        sys.stderr.write("drift_check.py: %s is not a usable git repo "
                         "(need rev-parse HEAD + status + diff)\n" % target)
        return 2

    cache_path = os.path.join(run_dir, CACHE_NAME)
    cache = load_cache(cache_path)
    warnings = []
    current_base = compute_base_ref(target)
    if cache["base_ref"] is None:
        cache["base_ref"] = current_base   # lock at first write
    elif cache["base_ref"] != current_base:
        warnings.append("base_ref changed (%s -> %s) — branch rebased/retargeted; "
                        "cache invalidated"
                        % (cache["base_ref"][:12] or "<none>",
                           current_base[:12] or "<none>"))
        cache = {"base_ref": current_base, "entries": {}}

    checked = skipped = unverifiable = 0
    drifted = []
    lines = []
    for tid, vc in passed:
        if not vc:
            unverifiable += 1
            lines.append(("UNVERIFIABLE", tid,
                          "empty verify_command (warning — route.py floors these at T2+)"))
            continue
        ent = cache["entries"].get(tid)
        if (isinstance(ent, dict) and ent.get("state_hash") == state_hash
                and ent.get("verify_exit") == 0):
            skipped += 1
            lines.append(("SKIP-CACHE", tid,
                          "repo state unchanged since last proven pass"))
            continue
        rc, out = run_verify(vc, target)
        checked += 1
        cache["entries"][tid] = {"state_hash": state_hash, "verify_exit": rc}
        if rc != 0:
            tail = out.splitlines()[-1][:160] if out else ""
            reason = "verify_command exit %d: %s" % (rc, vc)
            if tail:
                reason += " | last output: " + tail
            drifted.append({"task": tid, "reason": reason})
            lines.append(("DRIFT", tid, reason))
        else:
            lines.append(("RE-VERIFIED", tid, "exit 0"))

    try:
        save_cache(cache_path, cache)
    except OSError as e:
        warnings.append("cache write failed: %s" % e)

    ok = not drifted
    report = {"ok": ok, "checked": checked, "skipped_cache": skipped,
              "unverifiable": unverifiable, "drifted": drifted}
    print(json.dumps(report, ensure_ascii=False, indent=2))

    if not json_only:
        w = sys.stderr.write
        w("=== drift_check: %s vs %s ===\n" % (run_dir, target))
        w("  passed-claim tasks: %d (re-verified %d, cache-skipped %d, unverifiable %d)\n"
          % (len(passed), checked, skipped, unverifiable))
        for tag, tid, msg in lines:
            w("  [%-12s] %-24s %s\n" % (tag, tid, msg))
        for x in warnings:
            w("  warn: %s\n" % x)
        w("NO DRIFT — every passed claim still verifies at the current repo state.\n"
          if ok else
          "DRIFT DETECTED — %d passed task(s) no longer verify; the caller must "
          "record drift_detected via progress.py.\n" % len(drifted))

    return 0 if ok else 1


# --------------------------------------------------------------------------- #
# --self-test: real temp git repo + runDir fixtures, proving pass AND fail     #
# --------------------------------------------------------------------------- #
def _rmtree_force(path):
    """rmtree that clears the read-only bits git sets on .git/objects (Windows)."""
    def _onerr(fn, p, _exc):
        try:
            os.chmod(p, 0o700)
            fn(p)
        except OSError:
            pass
    shutil.rmtree(path, onerror=_onerr)


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

    td = tempfile.mkdtemp(prefix="drift_selftest_")
    try:
        repo = os.path.join(td, "repo")
        os.makedirs(repo)

        def git(*argv):
            p = subprocess.run(["git", "-C", repo] + list(argv), capture_output=True,
                               text=True, encoding="utf-8", errors="replace",
                               timeout=60)
            return p.returncode, (p.stdout or "") + (p.stderr or "")

        rc, out = git("init")
        if rc != 0:
            sys.stderr.write("[FAIL] git init: %s\n" % out.strip()[:200])
            print("SELF-TEST FAILED — git unavailable")
            return 1
        git("config", "user.name", "drift-selftest")
        git("config", "user.email", "drift-selftest@example.invalid")
        git("config", "commit.gpgsign", "false")
        with open(os.path.join(repo, "file.txt"), "w", encoding="utf-8") as f:
            f.write("hello\n")
        git("add", "-A")
        rc, out = git("commit", "-m", "init")
        step("fixture: git repo with one commit", rc == 0, out.strip()[:200])

        # marker lives OUTSIDE the repo so running verify does not itself change
        # the repo state hash (that would defeat the cache-hit acceptance case).
        # The verify_command references it RELATIVE to the repo (../marker.txt):
        # verify runs with cwd=<target>, and a relative path works under Git Bash,
        # WSL bash (which cannot resolve C:/... paths) and cmd.exe alike.
        marker = os.path.join(td, "marker.txt")

        def write_run(run_name, tasks, statuses):
            rd = os.path.join(td, run_name)
            os.makedirs(rd, exist_ok=True)
            with open(os.path.join(rd, "tasks.json"), "w", encoding="utf-8") as f:
                json.dump({"epic_dod": "self-test", "tasks": tasks}, f)
            with open(os.path.join(rd, "progress.json"), "w", encoding="utf-8") as f:
                json.dump({"runId": run_name, "status": "running",
                           "tasks": [{"id": t["id"],
                                      "status": statuses.get(t["id"], "pending"),
                                      "verify_command": t.get("verify_command", "")}
                                     for t in tasks]}, f)
            return rd

        def cli(rd):
            p = subprocess.run([py, me, rd, "--target", repo, "--json"],
                               capture_output=True, text=True, encoding="utf-8",
                               errors="replace", cwd=td, timeout=300)
            try:
                rep = json.loads(p.stdout)
            except ValueError:
                rep = None
            return p.returncode, rep, (p.stderr or "")

        def marker_lines():
            try:
                with open(marker, "r", encoding="utf-8") as f:
                    return len(f.read().splitlines())
            except OSError:
                return 0

        t_ok = {"id": "T-OK", "verify_command": "echo ok >> ../marker.txt"}
        t_unv = {"id": "T-UNV", "verify_command": ""}
        run1 = write_run("run1", [t_ok, t_unv], {"T-OK": "passed", "T-UNV": "passed"})

        # (1) pass path: verify runs, exits 0; unverifiable is a warning, not fatal
        rc, rep, err = cli(run1)
        step("case1: verify passes -> exit 0", rc == 0, err[:200])
        step("case1: checked == 1", bool(rep) and rep.get("checked") == 1,
             json.dumps(rep))
        step("case1: unverifiable == 1 (warning, not fatal)",
             bool(rep) and rep.get("unverifiable") == 1, json.dumps(rep))
        step("case1: verify actually ran once", marker_lines() == 1)

        # (2) unchanged diff -> cache hit -> verify is NOT re-run
        rc, rep, err = cli(run1)
        step("case2: re-run exit 0", rc == 0, err[:200])
        step("case2: skipped_cache >= 1",
             bool(rep) and rep.get("skipped_cache", 0) >= 1, json.dumps(rep))
        step("case2: checked == 0 (no re-verify)",
             bool(rep) and rep.get("checked") == 0, json.dumps(rep))
        step("case2: marker unchanged (verify NOT re-run)", marker_lines() == 1)

        # (3) repo diff changes -> cache miss -> verify re-runs
        with open(os.path.join(repo, "file.txt"), "a", encoding="utf-8") as f:
            f.write("drifted edit\n")
        rc, rep, err = cli(run1)
        step("case3: exit 0 after diff change", rc == 0, err[:200])
        step("case3: cache miss -> checked == 1",
             bool(rep) and rep.get("checked") == 1, json.dumps(rep))
        step("case3: verify re-ran (marker == 2)", marker_lines() == 2)

        # (4) a `passed` claim whose verify now FAILS -> exit 1 + drifted[]
        t_bad = {"id": "T-BAD", "verify_command": "exit 3"}
        run2 = write_run("run2", [t_bad], {"T-BAD": "passed"})
        rc, rep, err = cli(run2)
        step("case4: drift -> exit 1", rc == 1, err[:200])
        drifted = (rep or {}).get("drifted") or []
        step("case4: drifted[] names T-BAD",
             any(d.get("task") == "T-BAD" for d in drifted), json.dumps(rep))
        # (4b) a cached FAILURE must never be cache-skipped
        rc, rep, err = cli(run2)
        step("case4b: failure is not cache-skipped",
             rc == 1 and bool(rep) and rep.get("checked") == 1
             and rep.get("skipped_cache") == 0, json.dumps(rep))

        # (4c) untracked-file CONTENT regression must be a cache MISS + drift
        # (adversarial review MJ2: porcelain lists '?? name' but not its bytes,
        #  so a GOOD->BAD edit in an untracked file used to false-skip)
        data = os.path.join(repo, "data.txt")  # untracked on purpose (never git-added)
        with open(data, "w", encoding="utf-8") as f:
            f.write("GOOD")
        t_unt = {"id": "T-UNT", "verify_command":
                 "python -c \"import sys; sys.exit(0 if open('data.txt').read().strip()=='GOOD' else 1)\""}
        run3 = write_run("run3", [t_unt], {"T-UNT": "passed"})
        rc, rep, err = cli(run3)
        step("case4c: untracked GOOD -> verify passes (exit 0)", rc == 0, err[:200])
        with open(data, "w", encoding="utf-8") as f:
            f.write("BAD")
        rc, rep, err = cli(run3)
        step("case4c: untracked content change -> cache MISS + drift (exit 1)",
             rc == 1 and bool(rep) and rep.get("checked") == 1
             and rep.get("skipped_cache") == 0, json.dumps(rep))

        # (5) usage error: missing tasks.json/progress.json -> exit 2
        rc, rep, err = cli(os.path.join(td, "does-not-exist"))
        step("case5: missing inputs -> exit 2", rc == 2, err[:200])
    finally:
        _rmtree_force(td)

    if fails:
        print("SELF-TEST FAILED — %d case(s): %s" % (len(fails), ", ".join(fails)))
        return 1
    print("SELF-TEST OK — pass path, cache skip, cache miss on diff change, drift "
          "fail path, failure-never-skipped, untracked-content cache miss, "
          "unverifiable warning, usage error all proven.")
    return 0


# --------------------------------------------------------------------------- #
# CLI                                                                          #
# --------------------------------------------------------------------------- #
def main(argv):
    if argv == ["--self-test"]:
        return self_test()
    if "--self-test" in argv:
        sys.stderr.write("drift_check.py: --self-test takes no other arguments\n")
        return 2

    run_dir = None
    target = None
    json_only = False
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--target" and i + 1 < len(argv):
            target = argv[i + 1]; i += 2
        elif a == "--json":
            json_only = True; i += 1
        elif a in ("-h", "--help"):
            sys.stderr.write(__doc__); return 2
        elif a.startswith("-"):
            sys.stderr.write("drift_check.py: unknown arg %r\n" % a); return 2
        elif run_dir is None:
            run_dir = a; i += 1
        else:
            sys.stderr.write("drift_check.py: unexpected extra arg %r\n" % a); return 2

    if not run_dir or not target:
        sys.stderr.write("usage: drift_check.py <runDir> --target <repoPath> "
                         "[--json] | --self-test\n")
        return 2
    if not os.path.isdir(target):
        sys.stderr.write("drift_check.py: target repo not found: %s\n" % target)
        return 2

    return run_check(run_dir, target, json_only)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
