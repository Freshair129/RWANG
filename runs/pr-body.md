## Governance Matrix complete — 14/14 policies enforced

5 commits on top of PR#1 (`3b56955`):

- `c5fea55` **Adversarial-review fixes** for the P1 guards: progress.py snapshot-tip race (verify-chain false-BROKEN under parallel waves — now reads the true ndjson tip under a nested lock, proven by a 12-concurrent-appends selftest leg), drift_check untracked-file-content false-skip (state hash now digests untracked bytes), deterministic Git-Bash probe in check_evidence.py (WSL bash on PATH used to fail the verify-gate from PowerShell shells). Also restores the three spec docs into `docs/` under git (originals were untracked on the target repo and got cleaned).
- `c9a42e4` merge of main (M0 smoke GREEN + A1 spec).
- `d2289d0` **GP4+GP5+GP6**: tool_guard.py (G3 choke point + PreToolUse hook mode, fail-open on malformed input), git_guard.py (branch-only, wired as a CODE gate in phaseCommit), owners_check.py (same-wave file-set collision = fail at Route), Shared Runtime Contract fields emitted on every progress.py event (run_id/task_id/attempt_id/files[]/approved_by/verify{} — additive, inside the hash chain), contract_selftest.py (end-to-end proof), audit_query.md, holdout_runner.py (holdout cases executed from OUTSIDE the worker tree; wired as a code-gated Execute step; selftest proves the unseen-regression catch and greps run.js to prove worker prompts never mention holdout), decay_report.py (§9.4 metrics).
- `026c735` **PreToolUse hook wired** in `.claude/settings.json` (user-approved) — every Bash/PowerShell call in this repo is classified first; EXTERNAL and DESTRUCTIVE block at the harness level. Proven live: the hook blocked its own wiring session's probe command.
- (this branch tip) **One-shot approval tokens** — the missing approval channel for invariant #1 ("no external write *without human approval*"): a human mints `approvals/*.json` in a plain terminal (`--mint` refuses under the `CLAUDECODE` env an agent shell carries), the hook allows that EXACT command once and consumes the token atomically into `approvals/used/` + `approvals/consumed.ndjson`. This PR itself was pushed through that mechanism.

### State
- `governance_lint`: **14/14 enforced, 0 errors, 0 warnings**, green from both Git Bash and PowerShell
- all guard self-tests green (incl. 17-leg tool_guard suite); `node --check run.js` green
- M0 smoke was GREEN 5/5 on the pre-GP4 base

### Reviewer notes
- Patterns are line-regex over the command string: literal pattern text in echoes/commit messages false-positives, and script indirection can evade — both documented in `blocked_patterns.txt` + spec §5; the protocol rule (agents never mint tokens / never wrap forbidden commands in scripts) plus the consumed ledger are the compensating controls until an argv-level matcher lands.
- Known residuals are consolidated in `docs/SPEC--AGENT-RUNTIME-GOVERNANCE.md` §13.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
