# AUDIT — Phase-1 pause/resume parity & resume audit

**Task:** PR-T5 · **Branch:** `feat/pause-resume` · **Status:** `human_review` (see §5)
**Subject under audit:** the Phase-1 pause/resume refactor of
`orchestrator/progress.py` (pause/resume state machine) and `orchestrator/run.js`
(phase-split + idempotent Execute-rehydrate).

---

## 1. Scope

Phase 1 changed two things:

- **`orchestrator/progress.py`** grew a pause/resume **state machine**. The run
  `status` enum is now a *superset* of the old `running|blocked|done|failed`:
  it also carries `phase_done:<p>`, `awaiting_approval`, `awaiting_merge`,
  `needs_work`. Three new subcommands drive it — `phase-done --phase <p>`,
  `gate --phase <p> --await`, and `approve --phase <p> --by <who>` (which appends
  `approvals.ndjson`). Crucially, boundary/pause statuses are **preserved against
  stray `event` calls** (`_recompute_run_status` early-returns on any pause state).
- **`orchestrator/run.js`** was split into phase functions behind an `args.phase`
  dispatcher. The Execute phase **rehydrates** the task list from the durable
  `tasks.json` + `progress.json` and **skips tasks already `status == "passed"`**
  (`run.js` line 469: `wave.filter((t) => t.status !== "passed")`). That skip-filter
  is what makes a resumed run idempotent — and it trusts the *durable passed status
  on disk*, which is exactly what this audit pins down.

**What "parity" means here.** Two claims, and only these two are machine-checked:

1. **Resume / idempotency** — a run that is killed mid-Execute and re-read from
   disk exposes the same terminal state as an uninterrupted run, and the
   already-`passed` tasks are durably recorded so the Execute skip-filter re-runs
   nothing it already finished.
2. **State-machine correctness** — the pause/resume statuses are set and cleared
   correctly, and a boundary/pause status is not clobbered by a late task `event`.

Parity is asserted at the **state-substrate layer** (progress.py + the durable
files run.js reads). It does **not** here assert LLM-run equivalence — see §5.

---

## 2. Reproducible harness

Deterministic, LLM-free. It drives `orchestrator/progress.py` directly over a
throwaway `runs/_audit_t5/` scratch tree, asserts each property, and `rm -rf`s the
scratch dir at start and end so it never appears in `git status`. `python`, not
`python3` (per CLAUDE.md). Run from `G:/Rwang` under Git-Bash.

The harness covers four blocks:

- **(a) Full-run lifecycle parity** — `init` a 3-task run, `event … --status pass`
  all three, `phase-done route|execute|review`, `finish done`; assert terminal
  `progress.json`.
- **(b) Resume / idempotency** — `init` 3 tasks, pass T-1, *simulate a kill*, re-read
  `progress.json` from disk, assert T-1 durably `passed` while T-2/T-3 stay
  `pending`; assert the run.js skip-filter would skip exactly `[T-1]`; then finish
  and assert the terminal signature equals (a)'s.
- **(c) Boundary preservation** — after `phase-done --phase execute`, fire a stray
  `event --status note`; assert status is *still* `phase_done:execute`.
- **(d) Approval audit** — `gate --await` → `awaiting_approval`; `approve --by tester`
  → writes one `approvals.ndjson` line and clears the pause back to `running`.

### Representative command lines (as executed)

```bash
python orchestrator/progress.py init  runs/_audit_t5/full  --spec s.yaml --target /t \
       --autonomy autonomous --epic 'E' --tasks runs/_audit_t5/full/tasks.json
python orchestrator/progress.py event runs/_audit_t5/full  --task T-1 --status pass --tier T2 --model m --cost 0
python orchestrator/progress.py phase-done runs/_audit_t5/full --phase route
python orchestrator/progress.py phase-done runs/_audit_t5/full --phase execute
python orchestrator/progress.py phase-done runs/_audit_t5/full --phase review
python orchestrator/progress.py finish runs/_audit_t5/full --status done

# (b) after passing T-1 only, RE-READ from disk (the "kill" leaves disk as SSOT):
python orchestrator/progress.py init  runs/_audit_t5/resume --tasks runs/_audit_t5/resume/tasks.json ...
python orchestrator/progress.py event runs/_audit_t5/resume --task T-1 --status pass ...
#   -> progress.json: T-1 passed; T-2,T-3 pending  => run.js would skip [T-1], resume [T-2,T-3]

# (c) boundary must survive a stray event:
python orchestrator/progress.py phase-done runs/_audit_t5/boundary --phase execute
python orchestrator/progress.py event      runs/_audit_t5/boundary --task T-2 --status note --note 'stray'
#   -> status STILL phase_done:execute

# (d) approval interlock:
python orchestrator/progress.py gate    runs/_audit_t5/approval --phase execute --await   # -> awaiting_approval
python orchestrator/progress.py approve runs/_audit_t5/approval --phase execute --by tester # -> running + approvals.ndjson
```

---

## 3. Captured results

Full harness run, verbatim summary (20 assertions, 0 failures):

```
(a) FULL-RUN lifecycle parity
  PASS  (a) run status == done (=done)
  PASS  (a) all tasks passed (=['passed'])
  PASS  (a) Route phase passed (=passed)
  PASS  (a) Execute phase passed (=passed)
  PASS  (a) Review phase passed (=passed)
  PASS  (a) ndjson exists & appended (>3 lines) (=yes)     [line count = 10, > 3 init 'queued' lines -> append-only]

(b) RESUME / idempotency at the state layer
  PASS  (b) T-1 survived as passed (=passed)
  PASS  (b) T-2 still pending (=pending)
  PASS  (b) T-3 still pending (=pending)
  PASS  (b) skip-filter would SKIP == [T-1] (=['T-1'])
  PASS  (b) skip-filter would RESUME == [T-2,T-3] (=['T-2', 'T-3'])
  PASS  (b) resumed terminal == uninterrupted terminal (=done|T-1=passed;T-2=passed;T-3=passed)

(c) Boundary preservation
  PASS  (c) at boundary status == phase_done:execute (=phase_done:execute)
  PASS  (c) stray note did NOT clobber boundary (=phase_done:execute)

(d) Approval audit
  PASS  (d) gate set awaiting_approval (=awaiting_approval)
  PASS  (d) awaiting.phase recorded (=execute)
  PASS  (d) approve cleared pause -> running (=running)
  PASS  (d) awaiting key removed (=False)
  PASS  (d) approvals.ndjson has exactly 1 line (=1)
  PASS  (d) approval by == tester (=tester)

RESULT: PASS=20  FAIL=0    (scratch dir removed; no git leak)
```

Key parity fact: **(b)'s resumed terminal signature is byte-identical to (a)'s
uninterrupted one** — `done|T-1=passed;T-2=passed;T-3=passed` — so a
kill-then-resume at the state layer converges on the same terminal `progress.json`
as a clean run, and the intermediate durable state is exactly what run.js's
`status !== "passed"` skip-filter needs to avoid re-running finished work.

---

## 4. What each block proves

| Block | Property proven | Guards against |
|-------|-----------------|----------------|
| (a) | Full lifecycle rolls up correctly: tasks→`passed`, all three phase lights→`passed`, run→`done`; ndjson is append-only. | Silent schema drift in the happy path. |
| (b) | Durable passed-status survives a "kill"; resume re-runs nothing already `passed`; terminal state == uninterrupted run. | Resume re-doing finished work, or diverging terminal state. |
| (c) | A late/stray `event` cannot demote a boundary (`phase_done:*`) back to `running`/`blocked`. | The pause interlock being silently clobbered by an out-of-order agent write. |
| (d) | `gate`→`awaiting_approval`→`approve` clears the pause and writes an append-only approval audit line. | Un-audited or non-clearing approvals in supervised mode. |

---

## 5. Machine-proven vs pending human validation

**Machine-proven (this audit, §3):** the **deterministic substrate** is correct —
the `progress.py` pause/resume state machine (statuses, `phase-done`/`gate`/`approve`
transitions, boundary preservation, approval audit) and the **durable
passed-status on disk** that run.js's Execute skip-filter (`status !== "passed"`)
relies on to make resume idempotent. (a)–(d) are reproducible and green with
`python` only, no LLM.

**NOT auto-certifiable — requires a human-run smoke:** full **end-to-end
autonomous-vs-monolith equivalence** is *not* proven here. This audit does **not**
launch the real LLM `run.js` Workflow against a real target repo, and it does not
diff a from-scratch monolithic run's terminal `progress.json` against a
paused-then-resumed run's. Doing so requires:

- a live target repo, real spec, real model calls (non-deterministic, cost-bearing);
- the Workflow sandbox (this harness deliberately shells `progress.py` directly instead);
- a human to eyeball that the resumed branch diff and terminal state match a
  monolithic run's — an equivalence no assertion in this repo can certify.

Because the last mile is a **human smoke test against a real target**, PR-T5 is
correctly marked **`human_review`**. The claim here is deliberately narrow: the
*state machine and the durable resume substrate* are proven; *LLM-run behavioral
equivalence* is asserted-by-construction but **awaits human validation**. No
overclaim of full end-to-end parity is made.

---

## 6. Verdict

**PASS (substrate).** The Phase-1 pause/resume state machine and the durable
passed-status that run.js's idempotent Execute-resume depends on are proven correct
and reproducible (20/20 assertions); full LLM end-to-end monolith-vs-resume
equivalence remains a required human smoke test — hence `human_review`.
