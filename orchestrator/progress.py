#!/usr/bin/env python3
"""progress.py — maintain the Rwang SHARED PROGRESS SCHEMA for a single run.

A dependency-free Python 3 CLI the Rwang runner's agents call to keep the live
progress files in sync. Two files per run live under <runDir> (= G:/Rwang/runs/<runId>):

  progress.ndjson  one JSON event per line, append-only (the audit trail).
  progress.json    the rolled-up snapshot the monitor reads.

This script runs as a NORMAL CLI (not inside a workflow body), so datetime IS
allowed here. Timestamps: pass --ts <iso> to pin one, else datetime.now() is used.

progress.json shape (agrees verbatim with run.js and monitor.html):
  {
    "runId": str, "spec": str, "target_repo": str, "autonomy": str,
    "status": "running|blocked|done|failed|phase_done:<p>|awaiting_approval|awaiting_merge|needs_work",
    "awaiting": {"phase": str},   # present only while status == awaiting_approval
    "started_at": iso, "updated_at": iso, "epic_dod": str,
    "phases": [ {"name": str, "status": "pending|running|passed|failed"} ],
    "tasks":  [ {
        "id": str, "description": str, "tier": str, "model": str,
        "status": "pending|running|passed|escalated|failed|blocked",
        "attempts": [ {"tier": str, "model": str, "result": "pass|fail",
                       "verify_exit": int} ],
        "cost_usd": num, "tokens": {"local": int, "billed": int},
        "verify_command": str, "depends_on": [str], "updated_at": iso
    } ],
    "ledger": {"local_tokens": int, "billed_tokens": int, "billed_usd": num},
    "events": [ {"ts": iso, "task": str, "event": str, "detail": str} ],
    "last_event_hash": str        # tip of the ndjson hash chain ("genesis" while empty);
  }                               # updated on EVERY append — see TAMPER-EVIDENT HASH CHAIN

ndjson event line:
  {"ts": iso, "task": str,
   "event": "queued|running|verify|pass|fail|escalate|blocked|phase_done|gate|approve|note",
   "status": str, "tier": str, "model": str, "cost_usd": num, "detail": str,
   "prev_event_hash": str, "event_hash": str}

TAMPER-EVIDENT HASH CHAIN: every appended ndjson event carries
    event_hash = sha256(prev_event_hash + "\n" +
                        json.dumps(event_without_the_two_hash_fields, sort_keys=True,
                                   ensure_ascii=False, separators=(",", ":")))
The first hashed event uses prev_event_hash = "genesis". Legacy events (written
before the chain existed) carry no hash fields; the chain starts at the first
hashed event with prev="genesis". progress.json mirrors the chain tip in
"last_event_hash" on every append, so truncating the ndjson tail is detectable:
the shortened chain still self-verifies but no longer matches the snapshot tip.

SUBCOMMANDS
  init       <runDir> --spec --target --autonomy --epic "..." --tasks <tasks.json>
  event      <runDir> --task --status --tier --model --cost --note [--local-tokens] [--billed-tokens] [--verify-exit]
  phase-done <runDir> --phase <route|execute|review|commit>       # status -> phase_done:<p>
  gate       <runDir> --phase <p> --await                         # status -> awaiting_approval (supervised pause)
  approve    <runDir> --phase <p> [--by <who>]                    # record approval -> status running
  finish     <runDir> --status done|blocked|failed|awaiting_merge|needs_work
  rehydrate  <runDir>              # READ-ONLY: print the deterministic resume join of
                                   # tasks.json x progress.json ({"epic_dod", "tasks":[...]}
                                   # with per-task status) — run.js consumes it verbatim
  verify-chain <runDir>            # READ-ONLY: walk the ndjson hash chain, then compare the
                                   # tip against progress.json "last_event_hash".
                                   # exit 0 chain intact (or pure-legacy run — warning only)
                                   #      1 broken/tampered/truncated
                                   #      2 unreadable input (missing ndjson/snapshot)

The phase-done/gate/approve trio is the pause/resume interlock: a phase runner
sets phase_done:<p>; a supervised driver gates the boundary (awaiting_approval)
and only advances once `approve` has appended runs/<runDir>/approvals.ndjson.

All three accept an optional --ts <iso>. Concurrency-safe: progress.json is updated
read-modify-write under a lockfile with retry; progress.ndjson is opened append-mode
per call (atomic small writes). Prints the updated task line (or run summary).

Dependency-free (stdlib only).
"""

import argparse
import errno
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone

# Phases mirror run.js meta.phases. The router runs in Route; task work in Execute;
# the adversarial review + finalize in Review.
PHASES = ["Route", "Execute", "Review"]

# Which schema event-status maps a task into which run phase. Used to recompute the
# phase status from the tasks once an event lands.
_RUN_STATUSES = {"pending", "running", "passed", "escalated", "failed", "blocked"}

# Map an incoming --status to (task_status, ndjson_event, is_attempt, attempt_result).
# The runner passes pass|fail|escalate|blocked|running|note; we normalize here so the
# task.status enum stays exactly {pending,running,passed,escalated,failed,blocked}.
_STATUS_MAP = {
    "running":  ("running",   "running",  False, None),
    "pass":     ("passed",    "pass",     True,  "pass"),
    "passed":   ("passed",    "pass",     True,  "pass"),
    "fail":     ("failed",    "fail",     True,  "fail"),
    "failed":   ("failed",    "fail",     True,  "fail"),
    "escalate": ("escalated", "escalate", True,  "fail"),
    "escalated":("escalated", "escalate", True,  "fail"),
    "blocked":  ("blocked",   "blocked",  False, None),
    "verify":   ("running",   "verify",   False, None),
    "queued":   ("pending",   "queued",   False, None),
    "note":     (None,        "note",     False, None),  # note: don't change task.status
}


# --------------------------------------------------------------------------- #
# timestamps                                                                   #
# --------------------------------------------------------------------------- #
def now_iso(ts_arg):
    """Return the caller-supplied --ts if given, else an ISO-8601 UTC stamp."""
    if ts_arg:
        return ts_arg
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# simple cross-process lock around progress.json (read-modify-write)           #
# --------------------------------------------------------------------------- #
class _Lock:
    """A tiny lockfile (O_CREAT|O_EXCL) with bounded retry. Works on Windows + POSIX.

    Robust to concurrent appends: each writer acquires the lock, re-reads
    progress.json from disk, mutates, writes atomically, releases. Stale locks
    (older than _STALE_S) are reclaimed so a crashed writer can't wedge the run.
    """

    _STALE_S = 30.0

    def __init__(self, target_path):
        self.lockpath = target_path + ".lock"
        self.fd = None

    def __enter__(self):
        deadline = time.time() + 20.0
        while True:
            try:
                self.fd = os.open(self.lockpath, os.O_CREAT | os.O_EXCL | os.O_RDWR)
                os.write(self.fd, str(os.getpid()).encode("ascii", "ignore"))
                return self
            except OSError as e:
                if e.errno not in (errno.EEXIST, errno.EACCES):
                    raise
                # Reclaim a stale lock left by a crashed writer.
                try:
                    age = time.time() - os.path.getmtime(self.lockpath)
                    if age > self._STALE_S:
                        os.remove(self.lockpath)
                        continue
                except OSError:
                    pass
                if time.time() > deadline:
                    # Last resort: proceed without the lock rather than hang the run.
                    sys.stderr.write(
                        "progress.py: lock wait exceeded; proceeding unlocked.\n")
                    self.fd = None
                    return self
                time.sleep(0.05)

    def __exit__(self, *exc):
        if self.fd is not None:
            try:
                os.close(self.fd)
            except OSError:
                pass
            try:
                os.remove(self.lockpath)
            except OSError:
                pass
        self.fd = None
        return False


# --------------------------------------------------------------------------- #
# disk helpers                                                                 #
# --------------------------------------------------------------------------- #
def _paths(run_dir):
    return (os.path.join(run_dir, "progress.json"),
            os.path.join(run_dir, "progress.ndjson"))


def _read_snapshot(json_path):
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_snapshot_atomic(json_path, snap):
    """Write progress.json via a temp file + replace so the monitor never reads a torn file."""
    tmp = json_path + ".tmp.%d" % os.getpid()
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(snap, f, indent=2, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, json_path)  # atomic on Windows + POSIX


# --------------------------------------------------------------------------- #
# tamper-evident hash chain over progress.ndjson (see docstring)                #
# --------------------------------------------------------------------------- #
GENESIS = "genesis"
_HASH_FIELDS = ("prev_event_hash", "event_hash")


def _event_hash(prev_hash, event):
    """sha256 chain hash of one event. The event is canonicalized WITHOUT the two
    hash fields (sorted keys, compact separators, ensure_ascii=False) so verify can
    recompute it from the parsed line regardless of on-disk key order/spacing."""
    body = {k: v for k, v in event.items() if k not in _HASH_FIELDS}
    canon = json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256((prev_hash + "\n" + canon).encode("utf-8")).hexdigest()


def _last_chain_hash(ndjson_path):
    """Return the event_hash of the last hashed event in the ndjson, else GENESIS.
    Legacy lines (no hash fields) and torn/unparseable lines are skipped — the
    chain resumes from the last hash that made it to disk."""
    last = GENESIS
    try:
        with open(ndjson_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except ValueError:
                    continue
                h = ev.get("event_hash") if isinstance(ev, dict) else None
                if isinstance(h, str) and h:
                    last = h
    except OSError:
        pass  # no ndjson yet -> chain starts at genesis
    return last


def _append_ndjson(ndjson_path, event):
    """Append one event line, extended with the tamper-evident hash chain fields
    (prev_event_hash, event_hash). Read-prev + append happen under a lockfile on
    the ndjson so concurrent writers cannot fork the chain; the file itself is
    still opened append-mode per call (whole-line writes). Returns the appended
    event's event_hash (the new chain tip) so callers can mirror it into
    progress.json as "last_event_hash"."""
    with _Lock(ndjson_path):
        prev = _last_chain_hash(ndjson_path)
        chained = dict(event)
        chained["prev_event_hash"] = prev
        chained["event_hash"] = _event_hash(prev, event)
        with open(ndjson_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(chained, ensure_ascii=False) + "\n")
            f.flush()
    return chained["event_hash"]


def _current_chain_tip(ndjson_path, fallback):
    """The REAL chain tip right now, read from the ndjson under its lock.

    Under concurrent appends (run.js runs a whole wave in parallel), the
    process-local tip returned by _append_ndjson can be stale by the time this
    process wins the progress.json lock — mirroring the stale tip made
    verify-chain report BROKEN on an untampered chain (adversarial review MJ1).
    Callers hold the json lock when calling this; the nested ndjson lock is safe
    because no code path holds the ndjson lock while waiting on the json lock.
    The final snapshot writer in any interleaving therefore lands the true tip."""
    with _Lock(ndjson_path):
        tip = _last_chain_hash(ndjson_path)
    return tip if isinstance(tip, str) and tip else fallback


# --------------------------------------------------------------------------- #
# recomputation: phase status + run status derived from the tasks              #
# --------------------------------------------------------------------------- #
def _recompute_phases(snap):
    """Roll task statuses up into the Route/Execute/Review phase lights.

    Route is 'passed' once tasks exist (the router ran). Execute reflects the
    task population. Review stays pending until finish flips it.
    """
    tasks = snap.get("tasks", [])
    statuses = [t.get("status", "pending") for t in tasks]

    def set_phase(name, status):
        for ph in snap.get("phases", []):
            if ph.get("name") == name:
                ph["status"] = status
                return

    # Route: the act of having a routed task list means routing passed.
    set_phase("Route", "passed" if tasks else "running")

    # Execute: failed if anything blocked; passed if all terminal-passed; else running.
    if not tasks:
        set_phase("Execute", "pending")
    elif any(s == "blocked" for s in statuses):
        set_phase("Execute", "failed")
    elif all(s == "passed" for s in statuses):
        set_phase("Execute", "passed")
    elif any(s in ("running", "escalated", "failed") for s in statuses):
        set_phase("Execute", "running")
    else:
        set_phase("Execute", "pending")

    # Review is owned by finish(); leave it unless already set.


def _recompute_run_status(snap):
    """Run status from tasks, unless a terminal finish already set it.

    blocked if any task is blocked; running otherwise (done/failed are set only by
    the explicit `finish` subcommand).
    """
    st = snap.get("status")
    if st in ("done", "failed"):
        return
    # Boundary/pause states are set intentionally by phase-done/gate/finish; a
    # stray task `event` must not clobber them back to running/blocked.
    if st in ("awaiting_approval", "awaiting_merge", "needs_work") or (
            isinstance(st, str) and st.startswith("phase_done")):
        return
    statuses = [t.get("status", "pending") for t in snap.get("tasks", [])]
    if any(s == "blocked" for s in statuses):
        snap["status"] = "blocked"
    else:
        snap["status"] = "running"


# --------------------------------------------------------------------------- #
# subcommand: init                                                            #
# --------------------------------------------------------------------------- #
def cmd_init(a):
    run_dir = a.run_dir
    os.makedirs(run_dir, exist_ok=True)
    json_path, ndjson_path = _paths(run_dir)
    ts = now_iso(a.ts)
    run_id = os.path.basename(os.path.normpath(run_dir))

    # Load the routed task list (array of task dicts). Each gets status=pending and
    # the per-task bookkeeping fields the schema requires.
    with open(a.tasks, "r", encoding="utf-8") as f:
        raw_tasks = json.load(f)
    if isinstance(raw_tasks, dict) and isinstance(raw_tasks.get("tasks"), list):
        raw_tasks = raw_tasks["tasks"]
    if not isinstance(raw_tasks, list):
        sys.stderr.write("progress.py init: --tasks must be a JSON array of tasks.\n")
        sys.exit(2)

    tasks = []
    for t in raw_tasks:
        tasks.append({
            "id": str(t.get("id", "<unnamed>")),
            "description": t.get("description", ""),
            "tier": t.get("tier", t.get("computed_tier", "")),
            "model": t.get("model", t.get("executor_model", "")),
            "status": "pending",
            "attempts": [],
            "cost_usd": 0.0,
            "tokens": {"local": 0, "billed": 0},
            "verify_command": t.get("verify_command", "") or "",
            "depends_on": list(t.get("depends_on", []) or []),
            "updated_at": ts,
        })

    snap = {
        "runId": run_id,
        "spec": a.spec or "",
        "target_repo": a.target or "",
        "autonomy": a.autonomy or "autonomous",
        "status": "running",
        "started_at": ts,
        "updated_at": ts,
        "epic_dod": a.epic or "",
        "phases": [{"name": p, "status": "pending"} for p in PHASES],
        "tasks": tasks,
        "ledger": {"local_tokens": 0, "billed_tokens": 0, "billed_usd": 0.0},
        "events": [],
    }
    # Route phase is 'running' the moment we initialize (the router just ran).
    _recompute_phases(snap)

    # Fresh ndjson (truncate any prior) + first 'queued' line per task, hash-chained
    # from GENESIS (init owns the fresh file, so the chain restarts here by design).
    tip = GENESIS
    with open(ndjson_path, "w", encoding="utf-8") as f:
        for t in tasks:
            ev = {
                "ts": ts, "task": t["id"], "event": "queued", "status": "pending",
                "tier": t["tier"], "model": t["model"], "cost_usd": 0.0,
                "detail": "queued at init",
            }
            ev["prev_event_hash"] = tip
            ev["event_hash"] = _event_hash(tip, ev)
            tip = ev["event_hash"]
            f.write(json.dumps(ev, ensure_ascii=False) + "\n")
    snap["last_event_hash"] = tip

    with _Lock(json_path):
        _write_snapshot_atomic(json_path, snap)

    print("init runId=%s tasks=%d autonomy=%s status=%s" %
          (run_id, len(tasks), snap["autonomy"], snap["status"]))


# --------------------------------------------------------------------------- #
# subcommand: event                                                           #
# --------------------------------------------------------------------------- #
def cmd_event(a):
    run_dir = a.run_dir
    json_path, ndjson_path = _paths(run_dir)
    ts = now_iso(a.ts)

    mapped = _STATUS_MAP.get((a.status or "").lower())
    if mapped is None:
        sys.stderr.write(
            "progress.py event: unknown --status %r (expected one of %s)\n"
            % (a.status, "|".join(sorted(_STATUS_MAP))))
        sys.exit(2)
    task_status, ndjson_event, is_attempt, attempt_result = mapped

    cost = float(a.cost or 0.0)
    local_tok = int(a.local_tokens or 0)
    billed_tok = int(a.billed_tokens or 0)
    verify_exit = int(a.verify_exit) if a.verify_exit is not None else (
        0 if attempt_result == "pass" else 1 if attempt_result == "fail" else 0)

    # 1) Append the ndjson event (append-mode; safe to interleave whole lines).
    chain_tip = _append_ndjson(ndjson_path, {
        "ts": ts, "task": a.task, "event": ndjson_event,
        "status": task_status or "note",
        "tier": a.tier or "", "model": a.model or "",
        "cost_usd": cost, "detail": a.note or "",
    })

    # 2) Read-modify-write progress.json under the lock, with a small retry on the
    #    rare torn/looping read so concurrent writers can't corrupt the snapshot.
    printed = None
    last_err = None
    for _attempt in range(8):
        try:
            with _Lock(json_path):
                snap = _read_snapshot(json_path)

                task = None
                for t in snap.get("tasks", []):
                    if t.get("id") == a.task:
                        task = t
                        break
                if task is None:
                    # Unknown task id: still record the event in the rolled-up list,
                    # but don't fabricate a task entry.
                    sys.stderr.write(
                        "progress.py event: task %r not found in progress.json "
                        "(event still appended to ndjson + events).\n" % a.task)
                else:
                    if task_status is not None:
                        task["status"] = task_status
                    if is_attempt:
                        task["attempts"].append({
                            "tier": a.tier or task.get("tier", ""),
                            "model": a.model or task.get("model", ""),
                            "result": attempt_result,
                            "verify_exit": verify_exit,
                        })
                    # Record the tier/model actually used for this attempt.
                    if a.tier:
                        task["tier"] = a.tier
                    if a.model:
                        task["model"] = a.model
                    task["cost_usd"] = round(float(task.get("cost_usd", 0.0)) + cost, 6)
                    tok = task.setdefault("tokens", {"local": 0, "billed": 0})
                    tok["local"] = int(tok.get("local", 0)) + local_tok
                    tok["billed"] = int(tok.get("billed", 0)) + billed_tok
                    task["updated_at"] = ts

                # Ledger: accumulate every tier including local (count, not just $).
                led = snap.setdefault(
                    "ledger", {"local_tokens": 0, "billed_tokens": 0, "billed_usd": 0.0})
                led["local_tokens"] = int(led.get("local_tokens", 0)) + local_tok
                led["billed_tokens"] = int(led.get("billed_tokens", 0)) + billed_tok
                led["billed_usd"] = round(float(led.get("billed_usd", 0.0)) + cost, 6)

                # Mirror the event into the rolled-up events[] (monitor convenience).
                snap.setdefault("events", []).append({
                    "ts": ts, "task": a.task, "event": ndjson_event,
                    "detail": a.note or "",
                })

                _recompute_phases(snap)
                _recompute_run_status(snap)
                snap["updated_at"] = ts
                snap["last_event_hash"] = _current_chain_tip(ndjson_path, chain_tip)

                _write_snapshot_atomic(json_path, snap)

                if task is not None:
                    printed = ("task=%s status=%s tier=%s model=%s cost_usd=%.6f "
                               "tokens(local=%d,billed=%d) attempts=%d -> run=%s" % (
                                   task["id"], task["status"], task.get("tier", ""),
                                   task.get("model", ""), task.get("cost_usd", 0.0),
                                   task["tokens"]["local"], task["tokens"]["billed"],
                                   len(task["attempts"]), snap["status"]))
                else:
                    printed = ("event recorded for unknown task=%s status=%s -> run=%s"
                               % (a.task, task_status or "note", snap["status"]))
            break
        except (OSError, ValueError) as e:
            last_err = e
            time.sleep(0.05)
    else:
        sys.stderr.write("progress.py event: could not update progress.json: %s\n" % last_err)
        sys.exit(1)

    print(printed)


# --------------------------------------------------------------------------- #
# subcommand: finish                                                          #
# --------------------------------------------------------------------------- #
def cmd_finish(a):
    run_dir = a.run_dir
    json_path, ndjson_path = _paths(run_dir)
    ts = now_iso(a.ts)
    status = (a.status or "").lower()
    if status not in ("done", "blocked", "failed", "awaiting_merge", "needs_work"):
        sys.stderr.write(
            "progress.py finish: --status must be done|blocked|failed|awaiting_merge|needs_work.\n")
        sys.exit(2)

    chain_tip = _append_ndjson(ndjson_path, {
        "ts": ts, "task": "<run>", "event": "note", "status": status,
        "tier": "", "model": "", "cost_usd": 0.0, "detail": "run finished: %s" % status,
    })

    with _Lock(json_path):
        snap = _read_snapshot(json_path)
        snap["status"] = status
        snap["updated_at"] = ts
        snap["last_event_hash"] = _current_chain_tip(ndjson_path, chain_tip)
        # Settle the Review phase: passed iff the run reached a clean terminal
        # (done, or awaiting_merge = committed-to-branch clean), else failed.
        for ph in snap.get("phases", []):
            if ph.get("name") == "Review":
                ph["status"] = "passed" if status in ("done", "awaiting_merge") else "failed"
        snap.setdefault("events", []).append({
            "ts": ts, "task": "<run>", "event": "note",
            "detail": "run finished: %s" % status,
        })
        _write_snapshot_atomic(json_path, snap)

    print("finish runId=%s status=%s" %
          (snap.get("runId", os.path.basename(os.path.normpath(run_dir))), status))


# --------------------------------------------------------------------------- #
# subcommand: phase-done  (a phase runner marks its phase complete)            #
# --------------------------------------------------------------------------- #
def cmd_phase_done(a):
    run_dir = a.run_dir
    json_path, ndjson_path = _paths(run_dir)
    ts = now_iso(a.ts)
    phase = a.phase
    new_status = "phase_done:%s" % phase

    chain_tip = _append_ndjson(ndjson_path, {
        "ts": ts, "task": "<run>", "event": "phase_done", "status": new_status,
        "tier": "", "model": "", "cost_usd": 0.0, "detail": "phase %s complete" % phase,
    })

    with _Lock(json_path):
        snap = _read_snapshot(json_path)
        snap["status"] = new_status
        snap["updated_at"] = ts
        snap["last_event_hash"] = _current_chain_tip(ndjson_path, chain_tip)
        # Light up that phase in the phases[] roll-up (case-insensitive match).
        for ph in snap.get("phases", []):
            if str(ph.get("name", "")).lower() == phase.lower():
                ph["status"] = "passed"
        snap.setdefault("events", []).append({
            "ts": ts, "task": "<run>", "event": "phase_done",
            "detail": "phase %s complete" % phase,
        })
        _write_snapshot_atomic(json_path, snap)

    print("phase-done runId=%s phase=%s status=%s" %
          (snap.get("runId", ""), phase, new_status))


# --------------------------------------------------------------------------- #
# subcommand: gate  (supervised pause — awaiting human approval to proceed)    #
# --------------------------------------------------------------------------- #
def cmd_gate(a):
    run_dir = a.run_dir
    json_path, ndjson_path = _paths(run_dir)
    ts = now_iso(a.ts)
    phase = a.phase
    if not a.await_:
        sys.stderr.write("progress.py gate: only --await is supported.\n")
        sys.exit(2)

    chain_tip = _append_ndjson(ndjson_path, {
        "ts": ts, "task": "<run>", "event": "gate", "status": "awaiting_approval",
        "tier": "", "model": "", "cost_usd": 0.0,
        "detail": "awaiting approval to start %s" % phase,
    })

    with _Lock(json_path):
        snap = _read_snapshot(json_path)
        snap["status"] = "awaiting_approval"
        snap["awaiting"] = {"phase": phase}
        snap["updated_at"] = ts
        snap["last_event_hash"] = _current_chain_tip(ndjson_path, chain_tip)
        snap.setdefault("events", []).append({
            "ts": ts, "task": "<run>", "event": "gate",
            "detail": "awaiting approval to start %s" % phase,
        })
        _write_snapshot_atomic(json_path, snap)

    print("gate runId=%s awaiting_approval phase=%s" % (snap.get("runId", ""), phase))


# --------------------------------------------------------------------------- #
# subcommand: approve  (record a human approval; clears the pause)             #
# --------------------------------------------------------------------------- #
def cmd_approve(a):
    run_dir = a.run_dir
    json_path, ndjson_path = _paths(run_dir)
    ts = now_iso(a.ts)
    phase = a.phase
    by = a.by or "human"
    approvals_path = os.path.join(run_dir, "approvals.ndjson")

    # Append-only approval audit (mirrors the progress.ndjson pattern).
    with open(approvals_path, "a", encoding="utf-8") as f:
        f.write(json.dumps({
            "ts": ts, "phase": phase, "by": by, "decision": "approved",
        }, ensure_ascii=False) + "\n")
        f.flush()

    chain_tip = _append_ndjson(ndjson_path, {
        "ts": ts, "task": "<run>", "event": "approve", "status": "running",
        "tier": "", "model": "", "cost_usd": 0.0,
        "detail": "approved to start %s by %s" % (phase, by),
    })

    with _Lock(json_path):
        snap = _read_snapshot(json_path)
        snap["status"] = "running"
        snap.pop("awaiting", None)
        snap["updated_at"] = ts
        snap["last_event_hash"] = _current_chain_tip(ndjson_path, chain_tip)
        snap.setdefault("events", []).append({
            "ts": ts, "task": "<run>", "event": "approve",
            "detail": "approved to start %s by %s" % (phase, by),
        })
        _write_snapshot_atomic(json_path, snap)

    print("approve runId=%s phase=%s by=%s -> running" %
          (snap.get("runId", ""), phase, by))


# --------------------------------------------------------------------------- #
# subcommand: rehydrate  (read-only resume join for a standalone Execute phase)#
# --------------------------------------------------------------------------- #
def cmd_rehydrate(a):
    """Print {"epic_dod", "tasks":[...]} by joining tasks.json (routed truth)
    with progress.json (live status). Deterministic — replaces the LLM join the
    runner's rehydrate agent used to perform. Read-only: touches no state."""
    run_dir = a.run_dir
    json_path, _ = _paths(run_dir)
    tasks_path = os.path.join(run_dir, "tasks.json")
    try:
        with open(tasks_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, ValueError) as e:
        sys.stderr.write("progress.py rehydrate: cannot read %s: %s\n" % (tasks_path, e))
        sys.exit(2)
    routed = raw.get("tasks") if isinstance(raw, dict) else raw
    if not isinstance(routed, list):
        sys.stderr.write(
            "progress.py rehydrate: tasks.json must be a task array or {\"tasks\": [...]}.\n")
        sys.exit(2)
    try:
        snap = _read_snapshot(json_path)
    except (OSError, ValueError) as e:
        sys.stderr.write("progress.py rehydrate: cannot read progress.json: %s\n" % e)
        sys.exit(2)

    by_id = {str(t.get("id")): t for t in snap.get("tasks", [])}
    out = []
    for t in routed:
        tid = str(t.get("id", "<unnamed>"))
        live = by_id.get(tid, {})
        out.append({
            "id": tid,
            "description": t.get("description", ""),
            # Resume at the tier/model last ATTEMPTED (progress.json wins) so an
            # escalated task does not restart at the bottom rung on resume.
            "tier": live.get("tier") or t.get("tier", ""),
            "executor_model": live.get("model") or t.get("executor_model", ""),
            "verify_command": t.get("verify_command", "") or "",
            "depends_on": list(t.get("depends_on") or []),
            "review_gate": bool(t.get("review_gate")),
            "human_review": bool(t.get("human_review")),
            "status": live.get("status", "pending"),
        })
    # ensure_ascii=True: stdout may cross a cp1252 Windows console — \uXXXX
    # escapes survive any encoding and json.load restores them losslessly.
    print(json.dumps({"epic_dod": snap.get("epic_dod", ""), "tasks": out}, indent=2))


# --------------------------------------------------------------------------- #
# subcommand: verify-chain  (read-only tamper-evidence audit of the ndjson)     #
# --------------------------------------------------------------------------- #
def cmd_verify_chain(a):
    """Walk progress.ndjson verifying the hash chain, then compare the chain tip
    against progress.json "last_event_hash" (the anti-truncation anchor).

    Deterministic + read-only. JSON report -> stdout, summary -> stderr.
    exit 0 = intact (a pure-legacy run — no hash fields at all — also exits 0,
    with a "no chain (legacy run)" warning); 1 = broken/tampered/truncated;
    2 = unreadable input (missing progress.ndjson / progress.json).
    """
    run_dir = a.run_dir
    json_path, ndjson_path = _paths(run_dir)
    errors, warnings = [], []
    n_events = n_hashed = 0
    prev = GENESIS
    chain_started = False

    try:
        f = open(ndjson_path, "r", encoding="utf-8")
    except OSError as e:
        sys.stderr.write("progress.py verify-chain: cannot read %s: %s\n" % (ndjson_path, e))
        sys.exit(2)
    with f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            n_events += 1
            try:
                ev = json.loads(line)
            except ValueError:
                errors.append("line %d: not valid JSON" % i)
                continue
            if not isinstance(ev, dict):
                errors.append("line %d: event is not an object" % i)
                continue
            stored = ev.get("event_hash")
            if not (isinstance(stored, str) and stored):
                if chain_started:
                    # An unhashed line AFTER the chain began cannot be attested —
                    # every writer hashes now, so this is a break, not legacy.
                    errors.append("line %d: unhashed event after the chain started" % i)
                # else: legacy prefix (pre-chain writer) — allowed, chain not begun.
                continue
            n_hashed += 1
            if ev.get("prev_event_hash") != prev:
                errors.append("line %d: prev_event_hash mismatch (expected %s, got %s)"
                              % (i, prev, ev.get("prev_event_hash")))
            recomputed = _event_hash(prev, ev)
            if recomputed != stored:
                errors.append("line %d: event_hash mismatch — event content was altered" % i)
            # Chain onward from the STORED hash: a single tampered line then yields
            # exactly one mismatch instead of cascading down the rest of the file.
            prev = stored
            chain_started = True

    try:
        snap = _read_snapshot(json_path)
    except (OSError, ValueError) as e:
        sys.stderr.write("progress.py verify-chain: cannot read progress.json: %s\n" % e)
        sys.exit(2)
    snap_tip = snap.get("last_event_hash")

    legacy = False
    if n_hashed == 0:
        if snap_tip is None:
            legacy = True
            warnings.append("no chain (legacy run)")
        elif snap_tip == GENESIS:
            pass  # new-format run with zero events yet — an empty chain is intact
        else:
            errors.append("progress.json last_event_hash=%s but progress.ndjson has no "
                          "hashed events (chain deleted or file replaced)" % snap_tip)
    else:
        if snap_tip is None:
            errors.append("chain present in ndjson but progress.json has no "
                          "last_event_hash (snapshot stale or tampered)")
        elif snap_tip != prev:
            errors.append("chain tip %s != progress.json last_event_hash %s "
                          "(ndjson truncated or snapshot stale)" % (prev, snap_tip))

    ok = not errors
    report = {
        "ok": ok, "legacy": legacy, "events": n_events, "hashed": n_hashed,
        "chain_tip": prev if n_hashed else None,
        "snapshot_last_event_hash": snap_tip,
        "errors": errors, "warnings": warnings,
    }
    print(json.dumps(report, indent=2))
    w = sys.stderr.write
    for e in errors:
        w("  ERROR: %s\n" % e)
    for x in warnings:
        w("  warn:  %s\n" % x)
    w("verify-chain: %s (%d event(s), %d hashed)\n"
      % ("INTACT" if ok else "BROKEN", n_events, n_hashed))
    sys.exit(0 if ok else 1)


# --------------------------------------------------------------------------- #
# argparse                                                                     #
# --------------------------------------------------------------------------- #
def build_parser():
    p = argparse.ArgumentParser(
        prog="progress.py",
        description="Maintain the Rwang shared progress schema (progress.json + progress.ndjson).")
    sub = p.add_subparsers(dest="cmd", required=True)

    pi = sub.add_parser("init", help="create runDir, write progress.json (all tasks pending) + ndjson")
    pi.add_argument("run_dir")
    pi.add_argument("--spec", default="")
    pi.add_argument("--target", default="")
    pi.add_argument("--autonomy", default="autonomous")
    pi.add_argument("--epic", default="")
    pi.add_argument("--tasks", required=True, help="path to a JSON array of routed tasks")
    pi.add_argument("--ts", default=None, help="optional ISO-8601 timestamp (else now)")
    pi.set_defaults(func=cmd_init)

    pe = sub.add_parser("event", help="append an ndjson event + update the task in progress.json")
    pe.add_argument("run_dir")
    pe.add_argument("--task", required=True)
    pe.add_argument("--status", required=True,
                    help="pass|fail|escalate|blocked|running|verify|queued|note")
    pe.add_argument("--tier", default="")
    pe.add_argument("--model", default="")
    pe.add_argument("--cost", default="0", help="billed USD to add this event")
    pe.add_argument("--note", default="")
    pe.add_argument("--local-tokens", dest="local_tokens", default="0",
                    help="Ollama prompt_eval_count+eval_count to add (rate 0)")
    pe.add_argument("--billed-tokens", dest="billed_tokens", default="0",
                    help="Claude-tier billed token count to add")
    pe.add_argument("--verify-exit", dest="verify_exit", default=None,
                    help="explicit verify exit code for this attempt")
    pe.add_argument("--ts", default=None, help="optional ISO-8601 timestamp (else now)")
    pe.set_defaults(func=cmd_event)

    pf = sub.add_parser("finish", help="flip the terminal run status")
    pf.add_argument("run_dir")
    pf.add_argument("--status", required=True, help="done|blocked|failed|awaiting_merge|needs_work")
    pf.add_argument("--ts", default=None, help="optional ISO-8601 timestamp (else now)")
    pf.set_defaults(func=cmd_finish)

    pd = sub.add_parser("phase-done", help="mark a phase complete (status -> phase_done:<p>)")
    pd.add_argument("run_dir")
    pd.add_argument("--phase", required=True, help="route|execute|review|commit")
    pd.add_argument("--ts", default=None, help="optional ISO-8601 timestamp (else now)")
    pd.set_defaults(func=cmd_phase_done)

    pg = sub.add_parser("gate", help="supervised pause at a boundary (status -> awaiting_approval)")
    pg.add_argument("run_dir")
    pg.add_argument("--phase", required=True, help="the phase whose start is being gated")
    pg.add_argument("--await", dest="await_", action="store_true",
                    help="set awaiting_approval (required)")
    pg.add_argument("--ts", default=None, help="optional ISO-8601 timestamp (else now)")
    pg.set_defaults(func=cmd_gate)

    pa = sub.add_parser("approve", help="record a human approval, clear the pause (-> running)")
    pa.add_argument("run_dir")
    pa.add_argument("--phase", required=True, help="the phase being approved to start")
    pa.add_argument("--by", default="human", help="who approved (audit)")
    pa.add_argument("--ts", default=None, help="optional ISO-8601 timestamp (else now)")
    pa.set_defaults(func=cmd_approve)

    pr = sub.add_parser(
        "rehydrate",
        help="READ-ONLY: print the resume join of tasks.json x progress.json")
    pr.add_argument("run_dir")
    pr.set_defaults(func=cmd_rehydrate)

    pv = sub.add_parser(
        "verify-chain",
        help="READ-ONLY: verify the ndjson hash chain + the snapshot tip "
             "(exit 0 intact/legacy-warning, 1 broken/tampered/truncated, 2 unreadable)")
    pv.add_argument("run_dir")
    pv.set_defaults(func=cmd_verify_chain)

    return p


_SUBCMDS = {"init", "event", "finish", "phase-done", "gate", "approve", "rehydrate",
            "verify-chain"}


def _normalize_order(argv):
    """Accept BOTH `progress.py <cmd> <runDir> ...` and `progress.py <runDir> <cmd> ...`.

    The runner (run.js) issues runDir-before-subcommand; argparse wants subcommand-first.
    Swap the first two tokens when they arrive in runDir-first order so either contract
    works and an agent can't break progress writes by ordering them the natural way.
    """
    argv = list(argv)
    if len(argv) >= 2 and argv[0] not in _SUBCMDS and argv[1] in _SUBCMDS:
        argv[0], argv[1] = argv[1], argv[0]
    return argv


def main(argv):
    parser = build_parser()
    a = parser.parse_args(_normalize_order(argv))
    a.func(a)


if __name__ == "__main__":
    main(sys.argv[1:])
