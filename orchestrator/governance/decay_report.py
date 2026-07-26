#!/usr/bin/env python3
"""decay_report.py — G7 quality-decay metrics over a run's event log (GP6).

Long-horizon decay shows up as numbers before it shows up as disasters:
  rework_rate       = escalate events / attempt events   (window)
  drift_incidents   = drift_detected notes               (window)
  holdout_fail_rate = attempts with verify.holdout_exit != 0 / attempts that
                      carry a holdout_exit               (window)
Thresholds (governance spec §9.4 — starting points, calibrate after real runs):
  rework > 0.30 · drift > 0 · holdout_fail > 0.10  ->  DECAY ALERT (exit 1).
The runner's response to an alert (shrink the batch, double verifier cadence)
lives in run.js; this script only measures — deterministically, from ndjson.

USAGE:
    python orchestrator/governance/decay_report.py <runDir> [--window N] [--json]
    python orchestrator/governance/decay_report.py --self-test
EXIT: 0 healthy · 1 decay alert · 2 usage/unreadable
stdlib-only, deterministic.
"""
import json
import os
import sys

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

TH_REWORK = 0.30
TH_DRIFT = 0
TH_HOLDOUT = 0.10


def compute(events, window):
    tail = events[-window:] if window and window > 0 else events
    attempts = [e for e in tail if e.get("event") in ("attempt", "escalate")
                or e.get("event_type") in ("attempt", "escalate")]
    n_attempt = sum(1 for e in tail
                    if (e.get("event") or e.get("event_type")) == "attempt")
    n_escalate = sum(1 for e in tail
                     if (e.get("event") or e.get("event_type")) == "escalate")
    drift = sum(1 for e in tail
                if "drift_detected" in str(e.get("detail", "")))
    with_holdout = [e for e in tail
                    if isinstance(e.get("verify"), dict)
                    and e["verify"].get("holdout_exit") is not None]
    holdout_fail = sum(1 for e in with_holdout if e["verify"]["holdout_exit"] != 0)

    rework_rate = (n_escalate / n_attempt) if n_attempt else 0.0
    holdout_rate = (holdout_fail / len(with_holdout)) if with_holdout else 0.0
    alerts = []
    if rework_rate > TH_REWORK:
        alerts.append(f"rework_rate {rework_rate:.2f} > {TH_REWORK}")
    if drift > TH_DRIFT:
        alerts.append(f"drift_incidents {drift} > {TH_DRIFT}")
    if holdout_rate > TH_HOLDOUT:
        alerts.append(f"holdout_fail_rate {holdout_rate:.2f} > {TH_HOLDOUT}")
    _ = attempts
    return {"window": len(tail), "attempts": n_attempt, "escalations": n_escalate,
            "rework_rate": round(rework_rate, 4),
            "drift_incidents": drift,
            "holdout_checked": len(with_holdout),
            "holdout_fail_rate": round(holdout_rate, 4),
            "alerts": alerts, "ok": not alerts}


def report(run_dir, window, json_only):
    ndjson = os.path.join(run_dir, "progress.ndjson")
    if not os.path.isfile(ndjson):
        sys.stderr.write(f"decay_report: no progress.ndjson under {run_dir!r}\n")
        return 2
    events = []
    for line in open(ndjson, "r", encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except ValueError:
            continue  # torn line — measurement skips, verify-chain flags
    rep = compute(events, window)
    print(json.dumps(rep, ensure_ascii=False, indent=2))
    if not json_only:
        sys.stderr.write("decay_report: %s\n"
                         % ("healthy" if rep["ok"] else " | ".join(rep["alerts"])))
    return 0 if rep["ok"] else 1


# --------------------------------------------------------------------------- #
def self_test():
    fails = []

    def step(name, cond, detail=""):
        sys.stderr.write("[%s] %s%s\n" % ("OK  " if cond else "FAIL", name,
                                          (" — " + detail) if (detail and not cond) else ""))
        if not cond:
            fails.append(name)

    def ev(event, detail="", holdout=None):
        e = {"event": event, "event_type": event, "detail": detail}
        if holdout is not None:
            e["verify"] = {"visible_exit": 0, "holdout_exit": holdout}
        return e

    # (1) healthy run: 10 attempts, 1 escalation (10%), no drift, holdout clean
    healthy = [ev("attempt", holdout=0) for _ in range(10)] + [ev("escalate")]
    r = compute(healthy, 0)
    step("healthy -> ok", r["ok"] and r["rework_rate"] == 0.1, json.dumps(r))

    # (2) rework blowup: 4 escalations / 8 attempts = 0.5 > 0.30
    hot = [ev("attempt") for _ in range(8)] + [ev("escalate") for _ in range(4)]
    r = compute(hot, 0)
    step("rework 0.5 -> alert", not r["ok"] and any("rework" in a for a in r["alerts"]),
         json.dumps(r))

    # (3) a single drift incident -> alert (threshold is zero-tolerance)
    r = compute([ev("attempt"), ev("note", detail="drift_detected: T-2 no longer verifies")], 0)
    step("drift incident -> alert", not r["ok"] and r["drift_incidents"] == 1, json.dumps(r))

    # (4) holdout failures: 2/10 = 0.2 > 0.10
    hh = [ev("attempt", holdout=0) for _ in range(8)] + [ev("attempt", holdout=1) for _ in range(2)]
    r = compute(hh, 0)
    step("holdout 0.2 -> alert", not r["ok"] and r["holdout_fail_rate"] == 0.2, json.dumps(r))

    # (5) window slicing: old escalations fall out of a window of 5
    seq = [ev("escalate") for _ in range(4)] + [ev("attempt") for _ in range(5)]
    r = compute(seq, 5)
    step("window drops old escalations", r["ok"] and r["escalations"] == 0, json.dumps(r))

    if fails:
        print("SELF-TEST FAILED — %s" % ", ".join(fails))
        return 1
    print("SELF-TEST OK — healthy, rework, drift, holdout, window slicing proven.")
    return 0


def main(argv):
    if argv == ["--self-test"]:
        return self_test()
    json_only = False
    window = 0
    run_dir = None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--window" and i + 1 < len(argv):
            try:
                window = int(argv[i + 1])
            except ValueError:
                sys.stderr.write("decay_report: --window must be an integer\n")
                return 2
            i += 2
        elif a == "--json":
            json_only = True; i += 1
        elif a.startswith("-"):
            sys.stderr.write(f"decay_report: unknown arg {a!r}\n"); return 2
        elif run_dir is None:
            run_dir = a; i += 1
        else:
            sys.stderr.write(f"decay_report: unexpected extra arg {a!r}\n"); return 2
    if run_dir is None:
        sys.stderr.write(__doc__)
        return 2
    return report(run_dir, window, json_only)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
