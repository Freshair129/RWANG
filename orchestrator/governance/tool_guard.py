#!/usr/bin/env python3
"""tool_guard.py — G3 action-classification choke point (GP4).

ONE place that answers "may this command run?" from blocked_patterns.txt:
  EXTERNAL    -> never in autonomy (Rwang invariant #1) — a human runs it or nobody does
  DESTRUCTIVE -> requires human confirmation — blocked here; a human who intends it
                 runs it themselves (running it manually IS the confirmation)

Three runtime faces:
  --check "<command line>"   classify one command: exit 0 allow / 3 EXTERNAL /
                             4 DESTRUCTIVE (JSON verdict on stdout)
  --hook                     Claude Code PreToolUse hook: reads the hook JSON from
                             stdin ({tool_name, tool_input}); when tool_input has a
                             "command" string it is classified — EXTERNAL/DESTRUCTIVE
                             exit 2 (the documented BLOCK code; stderr is surfaced to
                             the model) UNLESS a live one-shot APPROVAL TOKEN matches
                             (see below), anything else exit 0. Malformed input
                             FAILS OPEN (exit 0 + stderr warning): a broken guard
                             must not brick every tool call in the harness — the
                             failure is visible in stderr and governance_lint still
                             proves the classifier itself daily via --self-test.
  --mint "<command line>"    HUMAN-ONLY: write an approval token for that EXACT
                             command (--by <name>, --ttl <minutes, default 15>,
                             --uses <N, default 1, max 20>). Refuses inside an
                             agent shell (CLAUDECODE env present) — minting from
                             a plain terminal IS the human approval.

APPROVAL TOKENS (the invariant is "no external write WITHOUT HUMAN APPROVAL" —
tokens are the approval channel; the hook stays the enforcement channel):
  - live under orchestrator/governance/approvals/*.json:
      {"command": "<exact command>", "class": "EXTERNAL|DESTRUCTIVE",
       "expires_at": "<ISO-8601>", "approved_by": "<name>", "uses": N}
  - match = EXACT command string (whitespace-normalized) + class + not expired
  - metered: "uses" (default 1, mint cap 20) decrements per consumption; the
    claim is an atomic os.replace to a .claim temp — under a race the loser
    sees no token and BLOCKS (fail-closed: a token can under-allow, never
    double-spend). At 0 the token moves to approvals/used/; every consumption
    is appended to approvals/consumed.ndjson with the remaining count (audit).
    A crash mid-claim leaves a stale *.claim file = token suspended until a
    human inspects it (again fail-closed).
  THREAT MODEL (documented, not hidden): a same-user process — including a
  deliberately misbehaving agent — CAN forge a token file; the CLAUDECODE
  refusal on --mint plus the consumed ledger raise the bar and leave evidence,
  they do not stop a determined local adversary. The protocol rule is absolute:
  AGENTS MUST NEVER CREATE OR EDIT TOKEN FILES — writing one is itself an
  unapproved external-write attempt.

Wiring: .claude/settings.json PreToolUse (this repo) + run.js human_review halt.
Patterns are line-regex over the command string — argv-level matching is the
known upgrade for false positives (see blocked_patterns.txt header).

USAGE:
    python orchestrator/governance/tool_guard.py --check "git push origin main"
    ... | python orchestrator/governance/tool_guard.py --hook
    python orchestrator/governance/tool_guard.py --mint "git push origin feat/x" --by boss --ttl 15
    python orchestrator/governance/tool_guard.py --self-test
EXIT (--check): 0 allow · 3 EXTERNAL · 4 DESTRUCTIVE · 2 usage
EXIT (--hook):  0 allow/token-allow/fail-open · 2 BLOCK
EXIT (--mint):  0 minted · 3 refused (agent shell) · 2 usage
stdlib-only; deterministic except token expiry (time-windowed by design).
"""
import datetime
import hashlib
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
                 "this command writes outside the machine/repo."),
    "DESTRUCTIVE": ("BLOCKED by Rwang governance (confirm-destructive, G3): this "
                    "command is hard to reverse."),
}
MINT_HINT = ("To approve it, a HUMAN mints a one-shot token in a PLAIN terminal "
             "(not an agent shell):\n"
             "  python \"G:/Rwang/orchestrator/governance/tool_guard.py\" "
             "--mint \"<exact command>\" --by <name> --ttl 15\n"
             "then re-run the command once within the TTL.")

# Token dir — env override exists ONLY so self-tests stay hermetic.
APPROVALS_DIR = (os.environ.get("RWANG_APPROVALS_DIR")
                 or os.path.join(HERE, "approvals"))


def classify(cmdline, patterns=None):
    patterns = patterns if patterns is not None else test_guards.load_patterns()
    return test_guards.match_blocked(cmdline, patterns)


def _norm_cmd(c):
    return " ".join(str(c).split())


def find_and_consume_token(cmdline, cls):
    """Return the matching live token (and consume it atomically), else None.

    Match = exact whitespace-normalized command + class + not expired. One-shot
    claim is os.replace into approvals/used/ — under a race exactly one caller
    wins; every consumption lands in approvals/consumed.ndjson for audit."""
    if not os.path.isdir(APPROVALS_DIR):
        return None
    now = datetime.datetime.now(datetime.timezone.utc)
    target = _norm_cmd(cmdline)
    for fn in sorted(os.listdir(APPROVALS_DIR)):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(APPROVALS_DIR, fn)
        try:
            tok = json.load(open(path, "r", encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(tok, dict) or _norm_cmd(tok.get("command", "")) != target:
            continue
        if tok.get("class") not in (None, cls):
            continue
        try:
            exp = datetime.datetime.fromisoformat(str(tok.get("expires_at", "")))
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=datetime.timezone.utc)
        except ValueError:
            continue
        if now > exp:
            continue  # expired tokens stay in place as evidence
        try:
            uses = int(tok.get("uses", 1))
        except (TypeError, ValueError):
            uses = 1
        if uses < 1:
            continue  # a spent/garbled counter never allows
        # Exclusive claim: atomic rename to a .claim temp. Under a race the
        # loser sees the file gone and BLOCKS — a token can under-allow,
        # never double-spend. A crash mid-claim strands a *.claim file =
        # token suspended until a human looks (fail-closed).
        claim = path + ".claim"
        try:
            os.replace(path, claim)
        except OSError:
            continue  # another process holds the claim
        remaining = uses - 1
        if remaining > 0:
            tok["uses"] = remaining
            with open(claim, "w", encoding="utf-8") as f:
                json.dump(tok, f, ensure_ascii=False, indent=2)
            os.replace(claim, path)  # token goes back live with N-1 uses
        else:
            used_dir = os.path.join(APPROVALS_DIR, "used")
            os.makedirs(used_dir, exist_ok=True)
            os.replace(claim, os.path.join(used_dir, fn))
        with open(os.path.join(APPROVALS_DIR, "consumed.ndjson"), "a",
                  encoding="utf-8") as f:
            f.write(json.dumps({"ts": now.isoformat(), "token": fn,
                                "command": target, "class": cls,
                                "approved_by": tok.get("approved_by", "?"),
                                "remaining": remaining},
                               ensure_ascii=False) + "\n")
        return tok
    return None


MAX_USES = 20  # mint-time cap — a bigger grant should be a policy change, not a token


def cmd_mint(command, by, ttl_min, uses=1):
    """HUMAN-ONLY token minting. An agent shell carries CLAUDECODE in its env —
    refusing under it makes 'minting from a plain terminal' the approval act."""
    if os.environ.get("CLAUDECODE"):
        sys.stderr.write(
            "tool_guard --mint: REFUSED — this is an agent shell (CLAUDECODE env "
            "present). Minting an approval token is the HUMAN act of approval; "
            "run this in a plain terminal.\n")
        return 3
    cls = classify(command)
    if cls is None:
        sys.stderr.write("tool_guard --mint: that command is not blocked — no token "
                         "needed.\n")
        return 2
    if not (1 <= uses <= MAX_USES):
        sys.stderr.write(f"tool_guard --mint: --uses must be 1..{MAX_USES} "
                         f"(got {uses}) — a bigger grant belongs in policy, not a token.\n")
        return 2
    now = datetime.datetime.now(datetime.timezone.utc)
    exp = now + datetime.timedelta(minutes=ttl_min)
    tok = {"command": _norm_cmd(command), "class": cls,
           "expires_at": exp.isoformat(), "approved_by": by, "uses": uses}
    os.makedirs(APPROVALS_DIR, exist_ok=True)
    name = "tok-%s.json" % hashlib.sha256(
        (tok["command"] + tok["expires_at"]).encode("utf-8")).hexdigest()[:12]
    path = os.path.join(APPROVALS_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(tok, f, ensure_ascii=False, indent=2)
    print(json.dumps({"minted": path, "class": cls, "uses": uses,
                      "expires_at": tok["expires_at"]}, ensure_ascii=False))
    return 0


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
        tok = find_and_consume_token(command, cls)
        if tok is not None:
            sys.stderr.write(
                f"ALLOWED ONCE by approval token (approved_by={tok.get('approved_by')}, "
                f"class={cls}) — token consumed; a repeat needs a fresh mint.\n")
            return 0
        sys.stderr.write(BLOCK_MSG[cls] + "\n" + MINT_HINT + f"\n  command: {command}\n")
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

    # (4) APPROVAL TOKENS — one-shot allow, consumption, expiry, exact-match, mint fence
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        tok_env = dict(os.environ)
        tok_env["RWANG_APPROVALS_DIR"] = td

        def hook_env(cmdline, env):
            p = subprocess.run([py, me, "--hook"],
                               input=json.dumps({"tool_name": "Bash",
                                                 "tool_input": {"command": cmdline}}),
                               capture_output=True, text=True, env=env)
            return p.returncode, p.stderr

        target_cmd = "git push origin feat/x"

        # (4a) no token -> still blocked
        rc, err = hook_env(target_cmd, tok_env)
        step("token: no token -> blocked + mint hint",
             rc == 2 and "--mint" in err, f"rc={rc}")

        # (4b) mint refused inside an agent shell (CLAUDECODE present)
        agent_env = dict(tok_env)
        agent_env["CLAUDECODE"] = "1"
        p = subprocess.run([py, me, "--mint", target_cmd, "--by", "selftest"],
                           capture_output=True, text=True, env=agent_env)
        step("mint: refused under CLAUDECODE (agent shell)",
             p.returncode == 3 and "REFUSED" in p.stderr, f"rc={p.returncode}")

        # (4c) mint from a "plain terminal" (CLAUDECODE removed) -> token file
        plain_env = dict(tok_env)
        plain_env.pop("CLAUDECODE", None)
        p = subprocess.run([py, me, "--mint", target_cmd, "--by", "selftest",
                            "--ttl", "5"],
                           capture_output=True, text=True, env=plain_env)
        minted = [f for f in os.listdir(td) if f.endswith(".json")]
        step("mint: plain terminal -> token written",
             p.returncode == 0 and len(minted) == 1, f"rc={p.returncode} files={minted}")

        # (4d) wrong command does NOT ride the token
        rc, _ = hook_env("git push origin main", tok_env)
        step("token: different command -> still blocked", rc == 2, f"rc={rc}")

        # (4e) exact command -> allowed ONCE, token consumed to used/ + ledger
        rc, err = hook_env(target_cmd, tok_env)
        step("token: exact command -> ALLOWED once",
             rc == 0 and "ALLOWED ONCE" in err, f"rc={rc} err={err[:120]}")
        consumed = os.path.isfile(os.path.join(td, "consumed.ndjson"))
        moved = os.path.isdir(os.path.join(td, "used")) and \
            len(os.listdir(os.path.join(td, "used"))) == 1
        step("token: consumed -> moved to used/ + ledger row", consumed and moved, "")

        # (4f) second use -> blocked again (one-shot proven)
        rc, _ = hook_env(target_cmd, tok_env)
        step("token: second use -> blocked (one-shot)", rc == 2, f"rc={rc}")

        # (4g) expired token never allows
        expired = {"command": target_cmd, "class": "EXTERNAL",
                   "expires_at": "2020-01-01T00:00:00+00:00",
                   "approved_by": "selftest", "uses": 1}
        with open(os.path.join(td, "tok-expired.json"), "w", encoding="utf-8") as f:
            json.dump(expired, f)
        rc, _ = hook_env(target_cmd, tok_env)
        step("token: expired -> blocked", rc == 2, f"rc={rc}")

        # (4h) METERED token (uses: 2) — allow, allow, then block; ledger counts down
        os.remove(os.path.join(td, "tok-expired.json"))
        p = subprocess.run([py, me, "--mint", target_cmd, "--by", "selftest",
                            "--ttl", "5", "--uses", "2"],
                           capture_output=True, text=True, env=plain_env)
        step("mint: --uses 2 accepted", p.returncode == 0 and '"uses": 2' in p.stdout,
             f"rc={p.returncode} out={p.stdout.strip()[:120]}")
        rc1, _ = hook_env(target_cmd, tok_env)
        live_after_1 = [f for f in os.listdir(td) if f.startswith("tok-") and f.endswith(".json")]
        rc2, _ = hook_env(target_cmd, tok_env)
        rc3, _ = hook_env(target_cmd, tok_env)
        step("token: uses=2 -> allow, allow, block",
             rc1 == 0 and rc2 == 0 and rc3 == 2, f"rcs={rc1},{rc2},{rc3}")
        step("token: decremented file stayed live between uses",
             len(live_after_1) == 1, f"live={live_after_1}")
        ledger_rows = [json.loads(l) for l in
                       open(os.path.join(td, "consumed.ndjson"), encoding="utf-8")
                       .read().splitlines() if l.strip()]
        rem = [r.get("remaining") for r in ledger_rows if r["command"] == target_cmd]
        step("token: ledger records remaining 0 (one-shot), 1 then 0 (metered)",
             rem[-2:] == [1, 0], f"remaining-seq={rem}")

        # (4i) mint cap: --uses 21 refused
        p = subprocess.run([py, me, "--mint", target_cmd, "--by", "selftest",
                            "--uses", "21"],
                           capture_output=True, text=True, env=plain_env)
        step("mint: --uses over cap refused", p.returncode == 2, f"rc={p.returncode}")

    if fails:
        print("SELF-TEST FAILED — %d case(s): %s" % (len(fails), ", ".join(fails)))
        return 1
    print("SELF-TEST OK — check exit-codes, hook block/allow, non-command pass-through, "
          "fail-open, and approval tokens (mint fence, one-shot + metered uses:N "
          "allow/consume/ledger, exact-match, expiry, mint cap) all proven.")
    return 0


def main(argv):
    if argv == ["--self-test"]:
        return self_test()
    if argv == ["--hook"]:
        return cmd_hook(sys.stdin.read())
    if len(argv) == 2 and argv[0] == "--check":
        return cmd_check(argv[1])
    if argv and argv[0] == "--mint":
        command = None
        by = "human"
        ttl = 15
        uses = 1
        i = 1
        while i < len(argv):
            a = argv[i]
            if a == "--by" and i + 1 < len(argv):
                by = argv[i + 1]; i += 2
            elif a == "--ttl" and i + 1 < len(argv):
                try:
                    ttl = int(argv[i + 1])
                except ValueError:
                    sys.stderr.write("tool_guard --mint: --ttl must be minutes (int)\n")
                    return 2
                i += 2
            elif a == "--uses" and i + 1 < len(argv):
                try:
                    uses = int(argv[i + 1])
                except ValueError:
                    sys.stderr.write("tool_guard --mint: --uses must be an int\n")
                    return 2
                i += 2
            elif command is None and not a.startswith("--"):
                command = a; i += 1
            else:
                sys.stderr.write(f"tool_guard --mint: unexpected arg {a!r}\n")
                return 2
        if not command:
            sys.stderr.write(__doc__)
            return 2
        return cmd_mint(command, by, ttl, uses)
    sys.stderr.write(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
