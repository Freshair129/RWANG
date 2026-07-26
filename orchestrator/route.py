#!/usr/bin/env python3
"""route.py — deterministic tier router for the tiered-swarm skill.

Reads the extended spec task list (the YAML/JSON produced by spec-driven-development
+ the two routing fields this skill adds) and emits a `tier_hint` per task from
DETERMINISTIC signals only. It calls NO model (the router is a rules-first, zero-VRAM
ROLE — never a tier you send work to). See references/routing-policy.md.

The single keystone rule (HARD RULE in SKILL.md):
    a task with NO `verify_command` is NOT cheap-eligible -> it floors at T2 (Claude-mid).
You cannot safely route a model to work you cannot cheaply grade.

USAGE:
    python route.py <spec.yaml|spec.json>          # pretty summary to stderr, JSON to stdout
    python route.py <spec.yaml> --json             # JSON only (machine-readable)
    python route.py <spec.yaml> --runner-tasks     # {"epic_dod", "tasks":[...]} — the fully
                                                   #   joined runner task list run.js consumes
                                                   #   (tasks.json); no LLM re-reads the spec
    cat spec.yaml | python route.py -              # read spec from stdin (yaml)

INPUT shape (either a top-level list of tasks, or a dict with a `tasks:` key). Each task:
    {id, description, verify_command | acceptance.verify_command,
     tier_hint?, depends_on?, review_gate?, domain?}

OUTPUT (stdout, JSON): a list of
    {id, cheap_eligible, computed_tier, executor_model, reasons[], spec_tier_hint,
     disagrees_with_spec}
Exit 0 always (routing is advisory); a disagreement is reported, not fatal.

Dependency-free except PyYAML for .yaml input (json input needs nothing).
"""

import json
import sys

# Axis-1 capability ladder, cheap -> expensive. T1.5 checked before T1 when parsing.
TIERS = ["T0", "T1", "T1.5", "T2", "T3"]
_IDX = {t: i for i, t in enumerate(TIERS)}

# Concrete executor per tier on THIS host (RTX 3060 12GB). T1 is domain-aware.
_MODEL = {
    "T0": "vibethinker-3b",
    "T1": "mellum2-12b-a2.5b",          # general local-mid; Rust -> aroow below
    "T1.5": "kimi-k2.7-code:cloud",
    "T2": "claude-sonnet-4-6",
    "T3": "claude-opus-4-8",
}

# Words in a task description that signal hard authoring / high blast-radius work.
_FRONTIER_WORDS = ("author", "rca", "design", "synthes", "architect", "plan ",
                   "proof", "adversarial")


def norm_tier(t):
    """Normalize 'T1-local', 't1.5', 'T2' ... to a canonical tier or None."""
    if t is None:
        return None
    s = str(t).strip().upper()
    for cand in ("T1.5", "T0", "T1", "T2", "T3"):   # T1.5 before T1
        if s.startswith(cand):
            return cand
    return None


def higher(a, b):
    """Return the more-expensive of two tiers (None treated as lowest)."""
    if a is None:
        return b
    if b is None:
        return a
    return a if _IDX[a] >= _IDX[b] else b


def verify_command_of(task):
    vc = task.get("verify_command")
    if not vc:
        acc = task.get("acceptance")
        if isinstance(acc, dict):
            vc = acc.get("verify_command")
    return vc


def is_rust(task, vc):
    blob = " ".join(str(x) for x in (
        task.get("description", ""), task.get("domain", ""), vc or "")).lower()
    return ("cargo" in blob) or (".rs" in blob) or ("rust" in blob)


def route_task(task):
    reasons = []
    vc = verify_command_of(task)
    cheap_eligible = bool(vc)

    # 1) HARD RULE: no machine-checkable AC -> not cheap-eligible -> floor at T2.
    if cheap_eligible:
        floor = "T0"
        computed = "T1"
        reasons.append("has verify_command -> cheap-eligible; base T1 local-mid")
    else:
        floor = "T2"
        computed = "T2"
        reasons.append("NO verify_command -> NOT cheap-eligible -> floor T2 (HARD RULE)")

    # 2) Authoring / review_gate / hard-reasoning signals -> frontier T3.
    desc = str(task.get("description", "")).lower()
    if task.get("review_gate") is True:
        computed = higher(computed, "T3")
        reasons.append("review_gate=true -> output crosses adversarial review -> T3")
    if any(w in desc for w in _FRONTIER_WORDS):
        computed = higher(computed, "T3")
        reasons.append("description signals authoring/hard reasoning -> T3")

    # 3) Honor an explicit spec tier_hint as a FLOOR (human may force higher; never lower
    #    than the safety floor from the HARD RULE).
    spec_hint = norm_tier(task.get("tier_hint"))
    final = higher(higher(computed, floor), spec_hint)

    rust = is_rust(task, vc)
    model = _MODEL[final]
    if final == "T1" and rust:
        model = "aroow-rust-coder-9b"
        reasons.append("Rust domain -> aroow-rust-coder-9b at T1")

    return {
        "id": task.get("id") or task.get("task") or "<unnamed>",
        "cheap_eligible": cheap_eligible,
        "computed_tier": final,
        "executor_model": model,
        "reasons": reasons,
        "spec_tier_hint": spec_hint,
        "disagrees_with_spec": bool(spec_hint) and spec_hint != final,
    }


# Words in a task description that mean the WORK ITSELF is an external write ->
# deterministically flag human_review=true (autonomy invariant 1: a human owns
# push/PR/merge/deploy). Conservative by design: a false positive only PAUSES a
# task for a human, it never auto-runs one.
_EXTERNAL_WRITE_WORDS = ("push", "merge", "deploy", "publish", "pull request",
                         "open a pr", "open pr")


def runner_task_list(spec, tasks, routed):
    """Join route.py output with the spec fields into the runner's task shape.

    The deterministic version of the join the Route agent used to do by hand:
    {id, description, tier, executor_model, verify_command, depends_on,
    review_gate, human_review} per task, plus the spec-level epic_dod. run.js
    writes this verbatim to <runDir>/tasks.json, so no LLM re-reads the spec.
    """
    out = []
    for t, r in zip(tasks, routed):
        desc = str(t.get("description", ""))
        blob = desc.lower()
        human = bool(t.get("human_review")) or any(
            w in blob for w in _EXTERNAL_WRITE_WORDS)
        out.append({
            "id": r["id"],
            "description": desc,
            "tier": r["computed_tier"],
            "executor_model": r["executor_model"],
            "verify_command": verify_command_of(t) or "",
            "depends_on": list(t.get("depends_on") or []),
            "review_gate": bool(t.get("review_gate")),
            "human_review": human,
        })
    epic = ""
    if isinstance(spec, dict):
        epic = str(spec.get("epic_dod") or "").strip()
    return {"epic_dod": epic, "tasks": out}


def load_spec(path):
    if path == "-":
        raw = sys.stdin.read()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return _load_yaml_str(raw)
    if path.lower().endswith(".json"):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    with open(path, "r", encoding="utf-8") as f:
        return _load_yaml_str(f.read())


def _load_yaml_str(raw):
    try:
        import yaml
    except ImportError:
        sys.stderr.write(
            "route.py: PyYAML not installed and input is YAML. "
            "Install `pip install pyyaml` or pass a .json task list.\n")
        sys.exit(2)
    return yaml.safe_load(raw)


def extract_tasks(spec):
    if isinstance(spec, list):
        return spec
    if isinstance(spec, dict):
        if isinstance(spec.get("tasks"), list):
            return spec["tasks"]
    sys.stderr.write("route.py: could not find a task list (top-level list or `tasks:`).\n")
    sys.exit(2)


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    json_only = "--json" in argv
    runner_mode = "--runner-tasks" in argv
    if not args:
        sys.stderr.write(__doc__)
        sys.exit(2)
    spec = load_spec(args[0])
    tasks = extract_tasks(spec)
    routed = [route_task(t) for t in tasks]

    if runner_mode:
        # ensure_ascii=True: stdout is often redirected to tasks.json on Windows,
        # where the console/file encoding is cp1252 — \uXXXX escapes are safe
        # everywhere and json.load restores them losslessly.
        print(json.dumps(runner_task_list(spec, tasks, routed), indent=2))
        return

    if not json_only:
        sys.stderr.write("\n=== route.py — tier assignments ===\n")
        for r in routed:
            flag = "  <-- DISAGREES with spec tier_hint" if r["disagrees_with_spec"] else ""
            sys.stderr.write(
                f"  {r['id']:<28} {r['computed_tier']:<5} {r['executor_model']:<22}"
                f"{'cheap' if r['cheap_eligible'] else 'NOT-cheap':>10}{flag}\n")
            for why in r["reasons"]:
                sys.stderr.write(f"      - {why}\n")
        sys.stderr.write("\n")

    print(json.dumps(routed, indent=2))


if __name__ == "__main__":
    main(sys.argv[1:])
