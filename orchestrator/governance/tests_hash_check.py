#!/usr/bin/env python3
"""tests_hash_check.py — guard of the `tests-immutable` policy (GP2).

Freezes a run's acceptance tests at approve time, then proves on every later
check that not one test file was modified, deleted, or smuggled in behind the
gate's back. The lock is a sha256 manifest over EVERY file under
<runDir>/tests/ (recursive); `verify` recomputes the tree and reports EVERY
divergence, not just the first. state_check.py (the G1 External State
Contract guard, same directory) imports this module and runs the same
verification whenever <runDir>/tests.sha256 exists — so a tampered test tree
also fails the restart protocol.

MANIFEST  <runDir>/tests.sha256 — JSON, sorted keys:
    {"files": {"<posix relpath under tests/>": "<sha256 hex>"}}

USAGE:
    python orchestrator/governance/tests_hash_check.py <runDir> lock    # write the manifest
    python orchestrator/governance/tests_hash_check.py <runDir> verify # prove tree == manifest
    python orchestrator/governance/tests_hash_check.py --self-test     # tempdir fixture proof
                                                                       # (pass AND fail paths)
    (<runDir> and the subcommand may be given in either order — same
    normalization progress.py does.)

OUTPUT: JSON -> stdout, human summary -> stderr (same convention as route.py /
        governance_lint.py).
EXIT:   0 locked / verified clean (or --self-test fully proved)
        1 violation: modified / missing / added file(s) (or --self-test failed)
        2 usage error, tests/ missing on lock, or manifest missing/unreadable
          on verify
Deterministic, stdlib-only, no LLM calls (core rule).
"""
import hashlib
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

MANIFEST_NAME = "tests.sha256"
TESTS_DIRNAME = "tests"
_CHUNK = 1 << 16
_SELFTEST_TIMEOUT = 60


# --------------------------------------------------------------------------
# importable core (state_check.py uses build/load/compare — keep signatures stable)
# --------------------------------------------------------------------------
def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(_CHUNK), b""):
            h.update(chunk)
    return h.hexdigest()


def iter_test_files(tests_dir):
    """Sorted posix-style relpaths of every regular file under tests_dir (recursive).

    os.walk order is platform-dependent — sort dirnames in place and the final
    list so the walk (and therefore every report) is deterministic.
    """
    out = []
    for dirpath, dirnames, filenames in os.walk(tests_dir):
        dirnames.sort()
        for name in sorted(filenames):
            full = os.path.join(dirpath, name)
            if os.path.isfile(full):
                out.append(os.path.relpath(full, tests_dir).replace(os.sep, "/"))
    return sorted(out)


def build_manifest(tests_dir):
    """{"files": {relpath: sha256hex}} over every file under tests_dir.

    Raises ValueError if tests_dir is not a directory.
    """
    if not os.path.isdir(tests_dir):
        raise ValueError(f"not a directory: {tests_dir}")
    files = {}
    for rel in iter_test_files(tests_dir):
        files[rel] = _sha256(os.path.join(tests_dir, rel))
    return {"files": files}


def load_manifest(path):
    """Parse + shape-check a manifest. Raises OSError/ValueError on any problem
    (json.JSONDecodeError is a ValueError subclass)."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict) or not isinstance(data.get("files"), dict):
        raise ValueError('manifest must be a JSON object of shape {"files": {...}}')
    for k, v in data["files"].items():
        if not isinstance(k, str) or not isinstance(v, str):
            raise ValueError("manifest files must map str relpath -> str sha256hex")
    return data


def compare(manifest, tests_dir):
    """Diff manifest vs the live tree -> {"modified": [...], "missing": [...],
    "added": [...]} — all sorted, ALL divergences reported (never first-only)."""
    want = manifest["files"]
    have = set(iter_test_files(tests_dir)) if os.path.isdir(tests_dir) else set()
    modified, missing = [], []
    for rel in sorted(want):
        if rel not in have:
            missing.append(rel)
            continue
        try:
            if _sha256(os.path.join(tests_dir, rel)) != want[rel]:
                modified.append(rel)
        except OSError:
            # unreadable = cannot prove intact = violation, not a skip
            modified.append(rel)
    added = sorted(have - set(want))
    return {"modified": modified, "missing": missing, "added": added}


# --------------------------------------------------------------------------
# subcommands
# --------------------------------------------------------------------------
def cmd_lock(run_dir):
    tests_dir = os.path.join(run_dir, TESTS_DIRNAME)
    manifest_path = os.path.join(run_dir, MANIFEST_NAME)
    try:
        manifest = build_manifest(tests_dir)
    except ValueError as e:
        sys.stderr.write(f"tests_hash_check.py: lock failed: {e}\n")
        return 2
    with open(manifest_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    report = {"ok": True, "cmd": "lock",
              "manifest": manifest_path.replace(os.sep, "/"),
              "n_files": len(manifest["files"])}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.stderr.write(f"tests-immutable: locked {report['n_files']} file(s) -> "
                     f"{report['manifest']}\n")
    return 0


def cmd_verify(run_dir):
    tests_dir = os.path.join(run_dir, TESTS_DIRNAME)
    manifest_path = os.path.join(run_dir, MANIFEST_NAME)
    if not os.path.isfile(manifest_path):
        sys.stderr.write(f"tests_hash_check.py: manifest not found: {manifest_path} "
                         "(run `lock` first)\n")
        return 2
    try:
        manifest = load_manifest(manifest_path)
    except (OSError, ValueError) as e:
        sys.stderr.write(f"tests_hash_check.py: manifest unreadable: {e}\n")
        return 2
    diff = compare(manifest, tests_dir)
    ok = not (diff["modified"] or diff["missing"] or diff["added"])
    report = {"ok": ok, "cmd": "verify", "n_locked": len(manifest["files"])}
    report.update(diff)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    w = sys.stderr.write
    if ok:
        w(f"tests-immutable: OK — {report['n_locked']} locked file(s) intact\n")
    else:
        w("tests-immutable: VIOLATION — tests/ diverges from the approved manifest:\n")
        for kind in ("modified", "missing", "added"):
            for rel in diff[kind]:
                w(f"  {kind.upper():<9} {rel}\n")
    return 0 if ok else 1


# --------------------------------------------------------------------------
# --self-test — tempdir fixture; proves BOTH the pass path and every fail class
# --------------------------------------------------------------------------
def _parse_json(text):
    try:
        return json.loads(text)
    except ValueError:
        return {}


def self_test():
    py = sys.executable
    me = os.path.abspath(__file__)
    steps = []
    ok_all = True

    def run_cli(*cli_args):
        p = subprocess.run([py, me, *cli_args], capture_output=True, text=True,
                           timeout=_SELFTEST_TIMEOUT)
        return p.returncode, p.stdout

    def check(name, cond, detail=""):
        nonlocal ok_all
        cond = bool(cond)
        steps.append({"step": name, "ok": cond, "detail": detail if not cond else ""})
        sys.stderr.write(f"  [{'OK' if cond else 'FAIL'}] {name}"
                         + (f" — {detail}" if detail and not cond else "") + "\n")
        if not cond:
            ok_all = False

    def write(path, text):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)

    with tempfile.TemporaryDirectory() as td:
        run_dir = os.path.join(td, "run")
        tests_dir = os.path.join(run_dir, TESTS_DIRNAME)
        a = os.path.join(tests_dir, "a.txt")
        b = os.path.join(tests_dir, "sub", "b.txt")
        write(a, "alpha\n")
        write(b, "bravo\n")

        # verify before any lock -> usage error (2), NOT a silent pass
        rc, _ = run_cli(run_dir, "verify")
        check("verify before lock exits 2 (no manifest)", rc == 2, f"exit {rc}")

        # lock -> 0, manifest exists with both files as sorted posix relpaths
        rc, _ = run_cli(run_dir, "lock")
        check("lock exits 0", rc == 0, f"exit {rc}")
        man_path = os.path.join(run_dir, MANIFEST_NAME)
        try:
            man = load_manifest(man_path)
            check("manifest lists both files as posix relpaths",
                  sorted(man["files"]) == ["a.txt", "sub/b.txt"],
                  json.dumps(sorted(man["files"])))
            raw = open(man_path, "r", encoding="utf-8").read()
            check("manifest keys serialized sorted",
                  0 <= raw.find('"a.txt"') < raw.find('"sub/b.txt"'))
        except (OSError, ValueError) as e:
            check("manifest readable after lock", False, str(e))

        # clean tree -> verify passes
        rc, _ = run_cli(run_dir, "verify")
        check("verify clean exits 0", rc == 0, f"exit {rc}")

        # (fail path 1) modify a locked file -> 1, reported as modified
        write(a, "alpha TAMPERED\n")
        rc, out = run_cli(run_dir, "verify")
        rep = _parse_json(out)
        check("modified file -> exit 1 and reported",
              rc == 1 and "a.txt" in rep.get("modified", []),
              f"exit {rc}, report {out[:200]!r}")

        # (fail path 2) delete a locked file -> 1, reported as missing
        os.remove(b)
        rc, out = run_cli(run_dir, "verify")
        rep = _parse_json(out)
        check("deleted file -> exit 1 and reported",
              rc == 1 and "sub/b.txt" in rep.get("missing", []),
              f"exit {rc}, report {out[:200]!r}")

        # (fail path 3) smuggle a new file in -> 1; ALL three violation classes
        # must appear in ONE report (every divergence reported, not first-only)
        write(os.path.join(tests_dir, "smuggled.txt"), "new acceptance test\n")
        rc, out = run_cli(run_dir, "verify")
        rep = _parse_json(out)
        check("added file -> exit 1 and ALL three classes reported together",
              rc == 1
              and "smuggled.txt" in rep.get("added", [])
              and "a.txt" in rep.get("modified", [])
              and "sub/b.txt" in rep.get("missing", []),
              f"exit {rc}, report {out[:300]!r}")

        # usage errors
        rc, _ = run_cli(run_dir, "bogus-cmd")
        check("unknown subcommand exits 2", rc == 2, f"exit {rc}")
        rc, _ = run_cli(os.path.join(td, "no-such-run"), "lock")
        check("lock on missing runDir exits 2", rc == 2, f"exit {rc}")

    print(json.dumps({"ok": ok_all, "self_test": "tests_hash_check", "steps": steps},
                     ensure_ascii=False, indent=2))
    sys.stderr.write("SELF-TEST PASS — lock/verify proved on pass, modified, "
                     "missing, and added paths.\n" if ok_all else
                     "SELF-TEST FAIL — see steps above.\n")
    return 0 if ok_all else 1


# --------------------------------------------------------------------------
def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        sys.stderr.write(__doc__)
        return 2
    if argv[0] == "--self-test":
        if len(argv) > 1:
            sys.stderr.write("tests_hash_check.py: --self-test takes no other args\n")
            return 2
        return self_test()
    if len(argv) != 2:
        sys.stderr.write("usage: tests_hash_check.py <runDir> <lock|verify> | --self-test\n")
        return 2
    run_dir, cmd = argv
    if run_dir in ("lock", "verify"):  # either order, same swap progress.py does
        run_dir, cmd = cmd, run_dir
    if cmd not in ("lock", "verify"):
        sys.stderr.write(f"tests_hash_check.py: unknown subcommand {cmd!r} "
                         "(want lock|verify)\n")
        return 2
    if not os.path.isdir(run_dir):
        sys.stderr.write(f"tests_hash_check.py: runDir not found: {run_dir}\n")
        return 2
    return cmd_lock(run_dir) if cmd == "lock" else cmd_verify(run_dir)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
