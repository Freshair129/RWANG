#!/usr/bin/env python3
"""engine_interlock_check.py — structural guard for policy `engine-lint-interlock` (RCA Phase B2 #2).

SPEC 0.6.0 §13: governance gates cannot be bypassed by UI, CLI, or daemon. run.js honors the
meta-guard (governance_lint at Route entry / Execute resume); this guard proves the standalone
engine daemon honors it too, so `node server.mjs` is not the bypass:

  E1  engine.mjs exports governanceInterlock() and it invokes the governance lint
      (spawnSync + governance_lint reference) with a cached verdict
  E2  engine.mjs runPool() consults governanceBlock() before dispatching
  E3  engine.mjs dispatchOne() consults governanceBlock() before dispatching
  E4  server.mjs runs governanceInterlock at boot

Structural check (mechanism present), same class as holdout-isolation; the e2e proof
(broken matrix → engine refuses dispatch) belongs to the runnable origin's smoke before
the policy flips from planned to enforced.

USAGE:  python orchestrator/governance/engine_interlock_check.py              # self-test + real check
        python orchestrator/governance/engine_interlock_check.py --self-test  # fixtures only
EXIT:   0 ok · 1 violation · 2 usage error
Deterministic, stdlib-only.
"""
import os
import re
import sys

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))


def _fn_body(text, name):
    m = re.search(rf"(?:export\s+)?function {name}\s*\([^)]*\)\s*\{{", text)
    if not m:
        return None
    # slice to the next top-level `function`/`export` at column 0 — crude but deterministic
    tail = text[m.end():]
    nxt = re.search(r"\n(?:export\s+)?(?:async\s+)?function \w+|\nexport (?:const|let|class) ", tail)
    return tail[: nxt.start()] if nxt else tail


def check(engine_text, server_text):
    errors = []
    gi = _fn_body(engine_text, "governanceInterlock")
    if gi is None:
        errors.append("E1 engine.mjs: governanceInterlock() not found")
    else:
        if "spawnSync" not in gi:
            errors.append("E1 governanceInterlock() does not actually run the lint (no spawnSync)")
        if "governance_lint" not in gi:
            errors.append("E1 governanceInterlock() does not reference governance_lint")
    if "export function governanceInterlock" not in engine_text:
        errors.append("E1 governanceInterlock is not exported (server boot cannot call it)")
    for fn, code in (("runPool", "E2"), ("dispatchOne", "E3")):
        body = _fn_body(engine_text, fn)
        if body is None:
            errors.append(f"{code} engine.mjs: {fn}() not found")
        elif "governanceBlock(" not in body:
            errors.append(f"{code} engine.mjs {fn}() does not consult governanceBlock() — "
                          "the daemon dispatch path bypasses the meta-guard (SPEC §13)")
    if "governanceInterlock(" not in server_text:
        errors.append("E4 server.mjs does not run governanceInterlock at boot")
    return errors


GOOD_ENGINE = """
const GOV = {};
export function governanceInterlock({ force = false } = {}) {
  const r = spawnSync("python", ["governance_lint.py"]);
  return r;
}
function governanceBlock() { return null; }
export function runPool() {
  const gv0 = governanceBlock();
  if (gv0) return gv0;
}
export function dispatchOne(id) {
  const gvBlk = governanceBlock();
  if (gvBlk) return gvBlk;
}
"""
GOOD_SERVER = "E.governanceInterlock({ force: true });\n"


def self_test():
    fails = []

    def expect(label, eng, srv, want):
        errs = check(eng, srv)
        blob = " ".join(errs)
        if want is None:
            if errs:
                fails.append(f"{label}: expected clean, got {errs}")
        elif want not in blob:
            fails.append(f"{label}: expected error containing {want!r}, got {errs}")

    expect("good", GOOD_ENGINE, GOOD_SERVER, None)
    expect("no lint run", GOOD_ENGINE.replace('spawnSync("python", ["governance_lint.py"])', "1"),
           GOOD_SERVER, "E1")
    expect("runPool bypass", GOOD_ENGINE.replace("const gv0 = governanceBlock();\n  if (gv0) return gv0;", ""),
           GOOD_SERVER, "E2")
    expect("dispatchOne bypass", GOOD_ENGINE.replace("const gvBlk = governanceBlock();\n  if (gvBlk) return gvBlk;", ""),
           GOOD_SERVER, "E3")
    expect("boot bypass", GOOD_ENGINE, "// nothing here", "E4")
    return fails


def main(argv):
    self_only = "--self-test" in argv
    unknown = [a for a in argv if a not in ("--self-test",)]
    if unknown:
        sys.stderr.write(f"engine_interlock_check.py: unknown arg {unknown[0]!r}\n{__doc__}")
        return 2
    st = self_test()
    if st:
        for f in st:
            sys.stderr.write(f"  SELFTEST FAIL: {f}\n")
        return 1
    if self_only:
        sys.stderr.write("engine_interlock_check self-test: all fixtures behaved.\n")
        return 0
    try:
        eng = open(os.path.join(ROOT, "engine.mjs"), "r", encoding="utf-8-sig").read()
        srv = open(os.path.join(ROOT, "server.mjs"), "r", encoding="utf-8-sig").read()
    except OSError as e:
        sys.stderr.write(f"engine_interlock_check.py: cannot read repo files: {e}\n")
        return 1
    errors = check(eng, srv)
    for e in errors:
        sys.stderr.write(f"  ERROR: {e}\n")
    sys.stderr.write("ENGINE INTERLOCK OK — boot + runPool + dispatchOne all consult the meta-guard.\n"
                     if not errors else
                     "ENGINE INTERLOCK BROKEN — a daemon dispatch path bypasses the meta-guard.\n")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
