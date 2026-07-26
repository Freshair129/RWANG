#!/usr/bin/env python3
"""check_evidence.py — the Verify-gate enforcer for the tiered-swarm skill.

A cheap-tier producer (e.g. a local-model verifier) emits FINDINGS. Per the routing
policy, no finding may cross a phase boundary into an authoring agent until its cited
evidence command actually RESOLVES. This script is that gate: it runs each finding's
evidence command and asserts it resolves; it exits non-zero if ANY finding fails, so it
can sit in a pipeline as a hard gate before the author phase.

This is the deterministic stage-1 check from references/routing-policy.md (section 4).

FINDING shape (JSON). Accepts a single object, a JSON array, or JSONL (one per line):
    {
      "id": "C1-sidecar-resident",
      "claim": "the f32 sidecar is resident",          # optional, for reporting
      "evidence_command": "rg -n 'f32_sidecar' src/lib.rs",   # REQUIRED: must exit 0
      "must_match": "RwLock<Vec<f32>>"                  # optional: substring required in stdout
    }
A finding PASSES iff its evidence_command exits 0 AND (must_match is absent OR present in
stdout). A finding with no evidence_command FAILS (an unverifiable finding is rejected at
the gate, not passed downstream).

USAGE:
    python check_evidence.py findings.json            # run gate; exit 0 iff all pass
    python check_evidence.py findings.jsonl           # JSONL also accepted
    cat findings.json | python check_evidence.py -    # from stdin
    python check_evidence.py findings.json --dry-run  # print commands, run nothing

SECURITY: this runs the commands embedded in the findings. That is the point (the gate
must execute the cited check), but only run findings you trust. --dry-run prints without
executing. Commands run through `bash -c` when bash is available (so POSIX checks like
`test -f`, `grep`, `rg` work on this Git-Bash host), else through the system shell.
"""

import json
import shutil
import subprocess
import sys

_BASH = shutil.which("bash")


def load_findings(path):
    raw = sys.stdin.read() if path == "-" else open(path, "r", encoding="utf-8").read()
    raw = raw.strip()
    if not raw:
        return []
    # Try a single JSON value (object or array) first; fall back to JSONL.
    try:
        val = json.loads(raw)
        return val if isinstance(val, list) else [val]
    except json.JSONDecodeError:
        out = []
        for line in raw.splitlines():
            line = line.strip()
            if line:
                out.append(json.loads(line))
        return out


def run(cmd):
    """Run cmd, return (returncode, combined_output)."""
    argv = [_BASH, "-c", cmd] if _BASH else cmd
    try:
        p = subprocess.run(argv, shell=(_BASH is None), capture_output=True,
                           text=True, timeout=600)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, "<timeout>"
    except OSError as e:
        return 127, f"<exec error: {e}>"


def check(finding, dry_run):
    fid = finding.get("id", "<no-id>")
    cmd = finding.get("evidence_command")
    if not cmd:
        return False, fid, "NO evidence_command (unverifiable -> rejected at gate)"
    if dry_run:
        return True, fid, f"DRY-RUN: {cmd}"
    rc, out = run(cmd)
    if rc != 0:
        return False, fid, f"evidence_command exit {rc}: {cmd}"
    must = finding.get("must_match")
    if must is not None and must not in out:
        return False, fid, f"output missing required match {must!r}: {cmd}"
    return True, fid, f"resolved: {cmd}"


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    dry_run = "--dry-run" in argv
    if not args:
        sys.stderr.write(__doc__)
        sys.exit(2)
    findings = load_findings(args[0])
    if not findings:
        sys.stderr.write("check_evidence.py: no findings to check.\n")
        sys.exit(2)

    all_pass = True
    print(f"=== Verify-gate: {len(findings)} finding(s) ===")
    for f in findings:
        ok, fid, msg = check(f, dry_run)
        print(f"  [{'PASS' if ok else 'FAIL'}] {fid:<30} {msg}")
        all_pass = all_pass and ok

    if dry_run:
        print("\n(dry-run: nothing executed)")
        sys.exit(0)
    if all_pass:
        print("\nGATE OPEN — all findings resolved; safe to cross into the author phase.")
        sys.exit(0)
    print("\nGATE CLOSED — at least one finding did not resolve. Do NOT pass downstream.")
    sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
