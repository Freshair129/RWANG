#!/usr/bin/env python3
"""role_readonly_check.py — structural guard for policy `role-readonly-gate` (RCA Phase B3).

SPEC--RWANG-STANDALONE-GOVERNANCE-FRAMEWORK §7.2 (law since 0.5.0b):

    "Gate-owning roles (Architect, Reviewer, Leader) have read-only access to the artifacts
     they gate and never modify them; write access is exclusive to the assigned Worker."

Until 0.7.0 that rule had no enforcement anywhere: `runReview()` called `runProvider()` with no
opts, so the reviewer inherited `defaultPermission` ("safe" = --permission-mode acceptEdits) and
could silently edit the very artifact it was judging — a gate owner with write access to its own
evidence. This guard proves the rule is wired at the spawn site and cannot regress:

  R1  config.json providers.claude.rolePermissions maps `reviewer` to a read-only profile, and
      that profile exists in permissionModes and strips every write tool (Edit/Write/MultiEdit/
      NotebookEdit) plus Bash
  R2  engine.mjs permissionFor() accepts a role and consumes rolePermissions as one of the
      most-restrictive bounds (PERM_RANK comparison present)
  R3  engine.mjs runReview() computes its permission via permissionFor(..., {role: "reviewer"})
  R4  runReview()'s runProvider() call passes an opts argument — the omission that caused the
      silent fall-back to defaultPermission is structurally impossible again

SCOPE (deliberate, not an oversight): only the agent spawned to GATE an artifact is clamped.
The `architect` role is NOT blanket read-only — a design/plan task authors its own document and
does not gate someone else's. §7.2's Hotfix exception is unimplemented (no Leader role exists in
the engine); when it lands it needs its own trigger + authorization + trace event.

Structural check (mechanism present), same class as holdout-isolation. The e2e proof — the
reviewer's real argv carrying the read-only profile — lives in the runnable origin's smoke.

USAGE:  python orchestrator/governance/role_readonly_check.py              # self-test + real check
        python orchestrator/governance/role_readonly_check.py --self-test  # fixtures only
EXIT:   0 ok · 1 violation · 2 usage error
Deterministic, stdlib-only.
"""
import json
import os
import re
import sys

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

GATE_ROLES = ("reviewer",)          # roles that spawn to gate an artifact today
WRITE_TOOLS = ("Edit", "Write", "MultiEdit", "NotebookEdit")
MUST_STRIP = WRITE_TOOLS + ("Bash",)


def _fn_body(text, name):
    m = re.search(rf"(?:export\s+)?(?:async\s+)?function {name}\s*\([^)]*\)\s*\{{", text)
    if not m:
        return None
    tail = text[m.end():]
    nxt = re.search(r"\n(?:export\s+)?(?:async\s+)?function \w+|\nexport (?:const|let|class) ", tail)
    return tail[: nxt.start()] if nxt else tail


def check(config_text, engine_text):
    errors = []
    # R1 — config wiring
    try:
        cfg = json.loads(config_text)
    except json.JSONDecodeError as e:
        return [f"R1 config.json unparseable: {e}"]
    claude = (cfg.get("providers") or {}).get("claude") or {}
    rp = {k: v for k, v in (claude.get("rolePermissions") or {}).items() if not k.startswith("_")}
    modes = {k: v for k, v in (claude.get("permissionModes") or {}).items() if not k.startswith("_")}
    for role in GATE_ROLES:
        prof = rp.get(role)
        if not prof:
            errors.append(f"R1 rolePermissions has no entry for gate-owning role {role!r} "
                          "(SPEC §7.2: gate owners are read-only over what they gate)")
            continue
        args = modes.get(prof)
        if args is None:
            errors.append(f"R1 rolePermissions[{role}]={prof!r} names no permissionModes profile")
            continue
        argv = " ".join(str(a) for a in args)
        if "--disallowedTools" not in argv and "--disallowed-tools" not in argv:
            errors.append(f"R1 profile {prof!r} does not disallow any tool — a gate owner could still write")
            continue
        missing = [t for t in MUST_STRIP if not re.search(rf"(?<![\w-]){re.escape(t)}(?![\w-])", argv)]
        if missing:
            errors.append(f"R1 profile {prof!r} still grants {missing} to the {role} — "
                          "a gate owner must not modify the artifact it judges")
        if "bypassPermissions" in argv:
            errors.append(f"R1 profile {prof!r} bypasses permissions — cannot be a read-only role profile")
    # R2 — engine consumes the role bound
    body = _fn_body(engine_text, "permissionFor")
    sig = re.search(r"function permissionFor\s*\(([^)]*)\)", engine_text)
    if body is None or sig is None:
        errors.append("R2 engine.mjs: permissionFor() not found")
    else:
        if "rolePermissions" not in body:
            errors.append("R2 engine.mjs permissionFor() does not consume rolePermissions (dead role map)")
        if "PERM_RANK" not in body:
            errors.append("R2 engine.mjs permissionFor() lacks the PERM_RANK most-restrictive comparison")
        if "role" not in sig.group(1):
            errors.append("R2 engine.mjs permissionFor() takes no role argument — the §7.2 bound "
                          "cannot reach the spawn decision")
    # R3/R4 — the review spawn site
    rv = _fn_body(engine_text, "runReview")
    if rv is None:
        errors.append("R3 engine.mjs: runReview() not found")
    else:
        if not re.search(r"permissionFor\s*\([^)]*role\s*:\s*[\"']reviewer[\"']", rv):
            errors.append("R3 engine.mjs runReview() does not derive its permission via "
                          "permissionFor(..., {role: \"reviewer\"}) — the gate owner is unclamped")
        call = re.search(r"runProvider\s*\((.*?)\)\s*;", rv, re.DOTALL)
        if not call:
            errors.append("R4 engine.mjs runReview(): no runProvider() call found")
        else:
            args = [a.strip() for a in call.group(1).split(",")]
            if len(args) < 8:
                errors.append(f"R4 engine.mjs runReview(): runProvider() called with {len(args)} args — "
                              "the opts argument is missing, so the reviewer silently falls back to "
                              "defaultPermission (this is the 0.7.0 bug this policy exists to prevent)")
            elif "permissionMode" not in " ".join(args) and not re.search(r"provOpts|reviewOpts", args[-1]):
                errors.append("R4 engine.mjs runReview(): runProvider()'s opts does not carry a permissionMode")
    return errors


GOOD_CFG = json.dumps({"providers": {"claude": {
    "permissionModes": {
        "read": ["--permission-mode", "acceptEdits", "--disallowedTools",
                 "Edit", "Write", "MultiEdit", "NotebookEdit", "Bash"],
        "safe": ["--permission-mode", "acceptEdits"],
        "full": ["--permission-mode", "bypassPermissions"]},
    "rolePermissions": {"reviewer": "read", "_comment": "x"}}}})

GOOD_ENG = """
const PERM_RANK = { read: 0 };
function permissionFor(t, { role = null } = {}) {
  const rolePerm = role ? CONFIG.providers?.claude?.rolePermissions?.[role] : null;
  return PERM_RANK[rolePerm] ? 1 : 2;
}
async function runReview(t, workerModel, worker) {
  const reviewTask = { ...t, id: `${t.id}#review` };
  const provOpts = { permissionMode: permissionFor(reviewTask, { role: "reviewer" }) };
  const r = await runProvider(parsed.provider, reviewTask, parsed.model, `${worker}.review`, prompt, CONFIG, PATHS, provOpts);
  return r;
}
"""


def self_test():
    fails = []

    def expect(label, cfg, eng, want):
        errs = check(cfg, eng)
        blob = " ".join(errs)
        if want is None:
            if errs:
                fails.append(f"{label}: expected clean, got {errs}")
        elif want not in blob:
            fails.append(f"{label}: expected error containing {want!r}, got {errs}")

    expect("good", GOOD_CFG, GOOD_ENG, None)
    expect("no role map", GOOD_CFG.replace('"reviewer": "read"', '"coder": "safe"'), GOOD_ENG, "R1")
    expect("role profile writable", GOOD_CFG.replace('"reviewer": "read"', '"reviewer": "safe"'), GOOD_ENG, "R1")
    expect("write tool leaks", GOOD_CFG.replace('"Write", "MultiEdit"', '"MultiEdit"'), GOOD_ENG, "R1")
    expect("bypass profile", GOOD_CFG.replace('"reviewer": "read"', '"reviewer": "full"'), GOOD_ENG, "R1")
    expect("dead role map", GOOD_CFG,
           GOOD_ENG.replace("const rolePerm = role ? CONFIG.providers?.claude?.rolePermissions?.[role] : null;", ""),
           "R2")
    expect("reviewer unclamped", GOOD_CFG,
           GOOD_ENG.replace('permissionFor(reviewTask, { role: "reviewer" })', '"safe"'), "R3")
    # R4 — the exact regression: runProvider called without opts
    expect("opts omitted", GOOD_CFG,
           GOOD_ENG.replace(", PATHS, provOpts)", ", PATHS)"), "R4")
    return fails


def main(argv):
    self_only = "--self-test" in argv
    unknown = [a for a in argv if a not in ("--self-test",)]
    if unknown:
        sys.stderr.write(f"role_readonly_check.py: unknown arg {unknown[0]!r}\n{__doc__}")
        return 2
    st = self_test()
    if st:
        for f in st:
            sys.stderr.write(f"  SELFTEST FAIL: {f}\n")
        return 1
    if self_only:
        sys.stderr.write("role_readonly_check self-test: all fixtures behaved.\n")
        return 0
    try:
        cfg = open(os.path.join(ROOT, "config.json"), "r", encoding="utf-8-sig").read()
        eng = open(os.path.join(ROOT, "engine.mjs"), "r", encoding="utf-8-sig").read()
    except OSError as e:
        sys.stderr.write(f"role_readonly_check.py: cannot read repo files: {e}\n")
        return 1
    errors = check(cfg, eng)
    for e in errors:
        sys.stderr.write(f"  ERROR: {e}\n")
    sys.stderr.write("ROLE READ-ONLY OK — the reviewer gates read-only; write tools are stripped at spawn.\n"
                     if not errors else
                     "ROLE READ-ONLY BROKEN — a gate owner can modify the artifact it judges (SPEC §7.2).\n")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
