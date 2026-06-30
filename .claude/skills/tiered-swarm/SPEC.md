# SPEC — tiered-swarm (reproduction spec, dogfooded)

> This spec is written in the skill's **own** `references/spec-template.md` format: a
> human-owned epic DoD, four phase gates, and a task list whose per-task
> `verify_command`s are **executable acceptance criteria** that prove the system was
> reproduced correctly. Run the `verify_command`s from the skill directory
> (`.claude/skills/tiered-swarm/`) unless noted. Re-implementing the skill on a new host =
> making every `verify_command` below pass. See `BLUEPRINT.md` for the how.

---

## 0. Goal

Reproduce a **spec-driven, local-first, cost-tiered multi-model orchestration** capability
that routes each sub-task to the cheapest tier (local Ollama → cloud-open-weights → Claude)
that can pass a machine-checkable acceptance command, behind a verify gate, with a two-way
cost ledger metering every tier including local. The proven spine is
`VERIFY → AUTHOR → REVIEW → ASSEMBLE`.

## 1. Constraints

```
Constraints:
  - Host: a GPU with >=8 GB VRAM (designed for RTX 3060 12 GB); Ollama installed + serving
    on http://localhost:11434; python (3.x) + PyYAML; Git Bash (POSIX sh) on Windows.
  - python3 may NOT be on PATH (only `python`): every script must resolve an interpreter
    defensively. (This host: python 3.13.7, no `python3` alias.)
  - Compose, do not merge: reuse the `spec-driven-development` and `tdd-workflow` skills;
    this skill owns only the outer spine + routing + verify gate + cost ledger.
  - Pricing is a dated snapshot with an UNCERTAINTY FLAG — never present Claude rates as
    certain; re-verify before any billing logic.
  - Scripts in scripts/ MUST NOT embed LLM API SDKs (openai/anthropic/langchain). Model
    invocation = Agent/Task (Claude) or the Ollama HTTP API (local/cloud-OW).
  - Out of scope: a long-running daemon; multi-GPU; a GUI; auto-pulling models.
```

---

## 2. Definition of Done — MULTI-LEVEL

### 2a. Epic DoD (SSOT, human-owned) — count: 1

```
EPIC DoD:
  WHEN an operator invokes the tiered-swarm skill with a decomposed task and a host that
       meets the constraints,
  THE SYSTEM SHALL route each sub-task to a tier, gate cheap output behind a verify command,
       and emit an auditable two-way cost ledger covering local and Claude tiers,
  AND every script SHALL run dependency-light on `python` (no python3 requirement) and a
       mistyped billed model SHALL fail loudly rather than be priced at $0.
  Done means: a fresh-host smoke test (BLUEPRINT.md §5) passes all phase gates below.
```

### 2b. Per-phase gate AC (the routing interlock) — count: 4

```
PHASE GATES:
  Verify-gate:   `python scripts/check_evidence.py <findings.json>` exits 0 only when every
                 finding's evidence command resolves; exits 1 on a bogus finding.
  Author-gate:   the spine never routes an unverified cheap finding into an author; SKILL.md
                 states the rule and routing-policy.md enforces it (grep checks below).
  Review-gate:   an adversarial reviewer (T3) reviews authored output before Assemble.
  Assemble-gate: a human assembles + re-checks the epic DoD; no external write without
                 approval.
```

### 2c. Per-task AC (executable, smallest routable unit) — count: N

Each task below carries a `verify_command` that returns pass/fail. These are the RED tests a
composed `tdd-workflow` would turn GREEN.

---

## 3. Task list — components of the system

```yaml
tasks:
  - id: T-1
    description: "SKILL.md is thin and declares the trigger + core loop + HARD RULE"
    requirement_ref: R-0
    tier_hint: T0
    executor_model: vibethinker-3b
    verify_command: "test $(grep -c '' SKILL.md) -lt 200 && grep -q 'verify_command' SKILL.md && grep -q 'VERIFY' SKILL.md"
    depends_on: []
    review_gate: false

  - id: T-2
    description: "model-tiers.md encodes the 2-axis taxonomy (capability tiers + role specialists)"
    requirement_ref: R-1
    tier_hint: T0
    executor_model: vibethinker-3b
    verify_command: "grep -qi 'T0' references/model-tiers.md && grep -qi 'bge-m3' references/model-tiers.md && grep -qi 'router' references/model-tiers.md"
    depends_on: []
    review_gate: false

  - id: T-3
    description: "routing-policy.md states the cheap-eligibility test + FrugalGPT break-even"
    requirement_ref: R-2
    tier_hint: T0
    executor_model: vibethinker-3b
    verify_command: "grep -q 'verify_command' references/routing-policy.md && grep -q 'c_frontier_fix' references/routing-policy.md"
    depends_on: []
    review_gate: false

  - id: T-4
    description: "route.py floors a no-verify_command task to T2+ and is Rust-domain-aware"
    requirement_ref: R-3
    tier_hint: T1
    executor_model: aroow-rust-coder-9b
    verify_command: "echo '{\"tasks\":[{\"id\":\"x\",\"description\":\"author rca\",\"review_gate\":true},{\"id\":\"y\",\"description\":\"check\",\"verify_command\":\"cargo test\"}]}' | python scripts/route.py - --json | python -c \"import sys,json; r={x['id']:x for x in json.load(sys.stdin)}; assert r['x']['cheap_eligible'] is False and r['x']['computed_tier']=='T3'; assert r['y']['executor_model']=='aroow-rust-coder-9b'; print('route OK')\""
    depends_on: []
    review_gate: false

  - id: T-5
    description: "check_evidence.py opens the gate on a real finding, closes on a bogus one"
    requirement_ref: R-2
    tier_hint: T1
    executor_model: aroow-rust-coder-9b
    verify_command: "echo '[{\"id\":\"ok\",\"evidence_command\":\"echo hi\",\"must_match\":\"hi\"},{\"id\":\"bad\",\"evidence_command\":\"false\"}]' > /tmp/f.json; python scripts/check_evidence.py /tmp/f.json; test $? -eq 1 && echo 'gate OK'"
    depends_on: []
    review_gate: false

  - id: T-6
    description: "cost_estimate.py computes the two-way formula and a typo'd Claude tag RAISES"
    requirement_ref: R-4
    tier_hint: T1
    executor_model: mellum2-12b-a2.5b
    verify_command: "python -c \"import sys; sys.path.insert(0,'scripts'); import cost_estimate as ce; assert abs(ce.cost_of_call('claude-opus-4-8',1000000,0,0,1000000)-30.0)<1e-9;\nimport traceback\ntry: ce.cost_of_call('claude-opus-4.8',1,0,0,1); raise SystemExit('FAIL: silent \\$0')\nexcept ValueError: print('cost OK')\""
    depends_on: []
    review_gate: false

  - id: T-7
    description: "cost_ledger.py aggregates a mixed local+Claude ledger with a local/billed split"
    requirement_ref: R-4
    tier_hint: T1
    executor_model: mellum2-12b-a2.5b
    verify_command: "printf '{\"model\":\"aroow-rust-coder-9b\",\"in_uncached\":1843,\"out\":412}\\n{\"model\":\"claude-opus-4-8\",\"in_uncached\":202000,\"out\":36000}\\n' | python scripts/cost_ledger.py - | grep -q 'local vs billed'"
    depends_on: []
    review_gate: false

  - id: T-8
    description: "ollama_route.sh is valid POSIX sh and resolves a python interpreter without python3"
    requirement_ref: R-0
    tier_hint: T0
    executor_model: vibethinker-3b
    verify_command: "sh -n scripts/ollama_route.sh && grep -q 'command -v python3 .*||.*command -v python' scripts/ollama_route.sh"
    depends_on: []
    review_gate: false

  - id: T-9
    description: "the two composed skills are present (compose-not-merge)"
    requirement_ref: R-5
    tier_hint: T0
    executor_model: vibethinker-3b
    verify_command: "test -f \"$HOME/.claude/skills/spec-driven-development/SKILL.md\" && test -f \"$HOME/.claude/skills/tdd-workflow/SKILL.md\""
    depends_on: []
    review_gate: false

  - id: T-10
    description: "DESIGN-RATIONALE.md (SSOT) answers all five design questions"
    requirement_ref: R-6
    tier_hint: T0
    executor_model: vibethinker-3b
    verify_command: "for q in 'Q1' 'Q2' 'Q3' 'Q4' 'Q5'; do grep -q \"## $q\" references/DESIGN-RATIONALE.md || exit 1; done; echo 'rationale OK'"
    depends_on: []
    review_gate: false
```

### Requirements traceability

| Req | Statement |
|---|---|
| R-0 | Runs on the constrained host (python without python3; POSIX sh; no LLM SDK in scripts). |
| R-1 | Two-axis taxonomy: capability tiers ⟂ role specialists; router is a role. |
| R-2 | Local-first only behind a verify gate; FrugalGPT break-even decides cheap-vs-escalate. |
| R-3 | No machine-checkable `verify_command` ⟹ not cheap-eligible ⟹ floor T2+. |
| R-4 | Two-way cost (count × per-type price), metered on every tier; typo'd billed tag fails loud. |
| R-5 | Compose `spec-driven-development` + `tdd-workflow`; never merge. |
| R-6 | The five design decisions are recorded in DESIGN-RATIONALE.md. |

---

## 4. How to run this spec as the system's own smoke test

```sh
cd .claude/skills/tiered-swarm
python scripts/route.py SPEC.md --json   # routes T-1..T-10 (note: pass a JSON export of `tasks:` if PyYAML absent)
# then execute each task's verify_command; all must pass.
```

A passing run of every `verify_command` above **is** the Definition of Done — the system has
been reproduced correctly on this host.
