#!/usr/bin/env python3
"""owners_check.py — G4 deterministic-coordination guard (GP5).

1 task = 1 owner = 1 declared file-set. Before a run starts, prove that no two
tasks that can run in the SAME dependency wave declare overlapping `files`, and
that a task with NO `files` declaration (scope = whole repo) never shares a
wave with anyone. Fail-fast at Route — not at write-collision time.

Wave construction mirrors run.js buildWaves(): repeatedly take every task whose
depends_on are all satisfied (unknown ids count as satisfied, same as run.js).

INPUT: tasks JSON — either a bare array or {"tasks":[...]} (= tasks.json). Each
task: {id, depends_on?, files?}. YAML specs are routed through route.py first;
this guard eats the routed/durable form.

USAGE:
    python orchestrator/governance/owners_check.py <tasks.json> [--json]
    python orchestrator/governance/owners_check.py --self-test
EXIT: 0 no conflicts · 1 conflict(s) · 2 usage/unreadable
stdlib-only, deterministic.
"""
import json
import os
import sys

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")


def build_waves(tasks):
    by_id = {t["id"]: t for t in tasks}
    done = set()
    waves = []
    remaining = list(tasks)
    guard = 0
    while remaining and guard < len(tasks) + 2:
        guard += 1
        ready = [t for t in remaining
                 if all(d in done or d not in by_id for d in (t.get("depends_on") or []))]
        if not ready:            # cycle -> final wave (same livelock escape as run.js)
            waves.append(remaining)
            break
        waves.append(ready)
        done.update(t["id"] for t in ready)
        ready_ids = {t["id"] for t in ready}
        remaining = [t for t in remaining if t["id"] not in ready_ids]
    return waves


def _norm(path):
    return os.path.normpath(str(path)).replace("\\", "/").lstrip("./")


def check_tasks(tasks):
    """Return a list of conflict strings (empty = clean)."""
    conflicts = []
    seen_ids = set()
    for t in tasks:
        tid = t.get("id")
        if not tid:
            conflicts.append("task with no id")
            return conflicts
        if tid in seen_ids:
            conflicts.append(f"duplicate task id: {tid}")
        seen_ids.add(tid)

    for w, wave in enumerate(build_waves(tasks), 1):
        if len(wave) < 2:
            continue
        declared = [(t["id"], {_norm(f) for f in (t.get("files") or [])}) for t in wave]
        for tid, files in declared:
            if not files:
                others = [x for x, _ in declared if x != tid]
                conflicts.append(
                    f"wave {w}: task {tid} declares NO files (scope = whole repo) but "
                    f"shares the wave with {others} — add `files:` or a depends_on")
        for i in range(len(declared)):
            for j in range(i + 1, len(declared)):
                a_id, a_files = declared[i]
                b_id, b_files = declared[j]
                overlap = sorted(a_files & b_files)
                if overlap:
                    conflicts.append(
                        f"wave {w}: tasks {a_id} and {b_id} both declare {overlap} — "
                        f"same-wave write collision; add depends_on or split the file-set")
    return conflicts


def main_check(path, json_only):
    try:
        data = json.load(open(path, "r", encoding="utf-8"))
    except (OSError, ValueError) as e:
        sys.stderr.write(f"owners_check: cannot read {path!r}: {e}\n")
        return 2
    tasks = data.get("tasks") if isinstance(data, dict) else data
    if not isinstance(tasks, list) or not tasks:
        sys.stderr.write("owners_check: input must be a non-empty task array "
                         "(or {\"tasks\": [...]}).\n")
        return 2
    conflicts = check_tasks(tasks)
    print(json.dumps({"ok": not conflicts, "tasks": len(tasks),
                      "conflicts": conflicts}, ensure_ascii=False, indent=2))
    if not json_only:
        for c in conflicts:
            sys.stderr.write("  CONFLICT: " + c + "\n")
        sys.stderr.write("owners_check: %s\n" %
                         ("clean" if not conflicts else f"{len(conflicts)} conflict(s)"))
    return 1 if conflicts else 0


# --------------------------------------------------------------------------- #
def self_test():
    fails = []

    def step(name, got, want):
        ok = got == want
        sys.stderr.write("[%s] %s (got %s, want %s)\n"
                         % ("OK  " if ok else "FAIL", name, got, want))
        if not ok:
            fails.append(name)

    def n_conf(tasks):
        return len(check_tasks(tasks))

    # (1) same wave + overlapping files -> conflict
    step("same-wave overlap -> conflict",
         n_conf([{"id": "A", "depends_on": [], "files": ["src/x.ts", "src/y.ts"]},
                 {"id": "B", "depends_on": [], "files": ["src/y.ts"]}]) > 0, True)
    # (2) same files but SEQUENTIAL (depends_on) -> clean
    step("cross-wave overlap -> clean",
         n_conf([{"id": "A", "depends_on": [], "files": ["src/y.ts"]},
                 {"id": "B", "depends_on": ["A"], "files": ["src/y.ts"]}]), 0)
    # (3) disjoint file-sets in one wave -> clean
    step("same-wave disjoint -> clean",
         n_conf([{"id": "A", "depends_on": [], "files": ["a.ts"]},
                 {"id": "B", "depends_on": [], "files": ["b.ts"]}]), 0)
    # (4) undeclared files sharing a wave -> conflict
    step("no-files task sharing a wave -> conflict",
         n_conf([{"id": "A", "depends_on": []},
                 {"id": "B", "depends_on": [], "files": ["b.ts"]}]) > 0, True)
    # (5) undeclared files ALONE in its wave -> clean
    step("no-files task alone -> clean",
         n_conf([{"id": "A", "depends_on": []},
                 {"id": "B", "depends_on": ["A"], "files": ["b.ts"]}]), 0)
    # (6) path normalization: ./src\x.ts == src/x.ts
    step("path normalization catches disguised overlap",
         n_conf([{"id": "A", "depends_on": [], "files": ["./src\\x.ts"]},
                 {"id": "B", "depends_on": [], "files": ["src/x.ts"]}]) > 0, True)
    # (7) duplicate ids -> conflict
    step("duplicate ids -> conflict",
         n_conf([{"id": "A", "depends_on": []}, {"id": "A", "depends_on": []}]) > 0, True)

    if fails:
        print("SELF-TEST FAILED — %s" % ", ".join(fails))
        return 1
    print("SELF-TEST OK — overlap/sequential/disjoint/undeclared/normalization/duplicate proven.")
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
    return main_check(args[0], json_only)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
