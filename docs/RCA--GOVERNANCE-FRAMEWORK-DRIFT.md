---
version: "0.1.0b"
created_at: "2026-07-10T00:00:00+07:00,ClaudeFable,pending"
last_update: "2026-07-10T00:00:00+07:00,ClaudeFable"
status: "candidate"
superseded_by: null
attributes:
  domain: "agent-governance"
  doc_type: "rca"
  scope: "Root cause analysis of governance-framework drift (H axis and SPEC 0.4.0b defects) + forward plan"
  language: "en"
---

# RCA--GOVERNANCE-FRAMEWORK-DRIFT

**Complexity:** C-2 · **Context-Hop:** H4 (governance, approved by owner request) · **Dispatch Tier:** T-cloud · **Model Level:** Frontier · **W-Scale:** W2 · **Risk:** MEDIUM
**Required Artifacts:** this RCA + REVIEW--GOVERNANCE-FRAMEWORK-2026-07-09 (evidence base)
**Verification:** every claim below carries a file/commit citation; the corrective commit is `b6cd792`.

---

## 1. Problem Statement

On 2026-07-09 an adversarially-verified review of `SPEC--RWANG-STANDALONE-GOVERNANCE-FRAMEWORK.md` v0.4.0b confirmed **25 defects** (3 BLOCKER), including:

- the standalone contract contained **no external-write prohibition and no branch-only rule** — an agent bound only by it could push/merge legally (B2);
- §5 Budget Control was a **written-in bypass of the H approval gate** it sits next to (B3);
- the with-Leader gate flow **silently dropped the AC and Test gates** — complex work passed fewer gates than simple work (B1);
- a live engine bug: `planner.mjs` `H_TIERS` lacked `H6`, so a declared-H6 task **silently received the H0 read-only toolset**.

The governance contract — the artifact that gates everything else — was itself ungated, internally contradictory, and detached from both its origin design and its enforcement code. This RCA explains how, and what prevents recurrence.

## 2. Timeline (with sources)

| Date | Event | Source |
|---|---|---|
| 2026-05-13 | **Origin design**: UCF 5-layer pipeline (namespace → ABAC → graph+vector scoring → resolution tier → budget); hops appear as a *decay term* `0.3·1/(1+hops)` in retrieval scoring, resolution gradient FULL→MENTION + `expand()`, budget as the hard wall | `cognitive_system/gks/framework/FRAMEWORK--UNIVERSAL-CONTEXT-FRAMEWORK.md`, `concept/CONCEPT--RESOLUTION-GRADIENT.md` |
| 2026-06-02→07 | GVDOC-1003 defines **H0–H6 as literal measured graph hops** with the small-world ceiling as an architecture-health rule; the *same doc* also uses the letter H for a second scale ("Compaction Heights" H1–H5) — the letter-overload is born | `govibe/.agents/FRAMEWORK--HIERARCHY-COMPACTION-STANDARDS.md` |
| 2026-06-07→15 | GoVibe STD v2.0→2.2.0+ga: C levels mapped to H; **hop measurement dropped, labels kept** — H becomes WBS-scope vocabulary | `govibe/docs/STD-Execution-Governance.md` |
| 2026-07-01 | RWANG SPEC 0.1.0b (ATHER): standalone **copy** of the standard; renames compaction to D (correct move) but inherits label-H; no precedence rule vs the other governance docs | SPEC changelog |
| 2026-07-09 | **Three same-day minor bumps by one agent** (Antigravity, 0.2.0b/0.3.0b/0.4.0b): model-name tables, Budget Control + Ceiling bullets, §7.2 gate system — no review between bumps; B1 and B3 enter here | SPEC changelog |
| 2026-07-09/10 | Review (44 raw → 26 deduped → 25 confirmed) → v0.5.0b applied (25 + 20 consistency fixes) + `planner.mjs` H6 repair, committed `b6cd792` on `docs/governance-0.5.0b` | `REVIEW--GOVERNANCE-FRAMEWORK-2026-07-09.md` |

## 3. Root Causes

**RC-1 — Semantic fusion (design root).** The origin kept three orthogonal concerns in separate enforced layers: WHO (ABAC permission), retrieval relevance (hop-decay scoring), HOW MUCH (token budget). Downstream, all three were fused into one scalar "H". Every later writer emphasized a different facet of the fused scalar — scope (STD), approval trigger (SPEC §5), tool unlock (`tierTools`) — so contradictions like Budget-Control-vs-approval-gate were not accidents; they were the fusion cracking under load.

**RC-2 — The contract was not subject to its own gates (process root).** The framework mandates doc review, verify gates, and approval before implementation — but *the framework document itself* passed none of them: three same-day bumps by a single agent with no reviewer, no approval semantics (the `b` suffix had no defined approval act until 0.5.0b), and `candidate` docs functioning as law. The most load-bearing document in the repo had the least process applied to it.

**RC-3 — Standalone-by-copy without a sync or precedence protocol (fork root).** RWANG's self-containment goal was implemented by *copying* the GoVibe standard. Two documents then claimed the same runtime with materially different rules (LLM-reviewer gates: allowed in one, forbidden in the other), disambiguated only by unwritten knowledge. Copy-forks of governance text guarantee drift unless one source is canonical and the rest derive.

**RC-4 — No doc↔code contract lint (enforcement root).** Nothing checked that tiers named in the doc exist in `H_TIERS`, that axis letters are unique, or that "approved" is machine-decidable. `governance_lint.py` guards the runner's policy matrix, but the framework doc sat outside every guard — which is how `H6 → indexOf −1 → H0 toolset` lived silently in `planner.mjs`.

**RC-5 — Letter economy (contributing).** H used for two scales in the origin doc; T used for three ("dispatch class", "model tier", "T0–T3 ladder") across the family. Cheap to avoid, expensive to untangle.

## 4. What Went Right

- The **runtime was safer than its contract**: engine/route.py hard rules (verify floor, gated types, kill switch) and AUTONOMY.md invariants held even while the doc drifted.
- The doc was still `candidate` — nothing formally approved was wrong.
- Multi-lens review + per-finding adversarial verification caught all of it **before** promotion, and the origin docs (UCF/GVDOC-1003) contained the correct design to restore — the knowledge was never lost, only disconnected.

## 5. Corrective Actions (done)

| # | Action | Evidence |
|---|---|---|
| CA-1 | SPEC v0.5.0b: 25 review fixes + 20 consistency-pass fixes (safety invariants §2.1, gate-flow repair, Verify Gate/approval/Brief Packet definitions, T/W/D cleanup, precedence clause vs SPEC--AGENT-RUNTIME-GOVERNANCE) | `b6cd792` |
| CA-2 | `planner.mjs` H6 repair (declared H6 no longer falls to read-only) | `b6cd792` |
| CA-3 | Durable evidence base committed | `REVIEW--GOVERNANCE-FRAMEWORK-2026-07-09.md` |

## 6. Forward Plan (preventive + roadmap)

### Phase A — Close out 0.5.0b *(owner: Boss, now)*
- Review and merge `docs/governance-0.5.0b` (`b6cd792`). Merge is human-owned; nothing is pushed.
- Decide approval: per §12, dropping the `b` suffix + setting `status: active` (recording approver in the changelog) is the approval act. Keeping it `candidate` is also legitimate until Phase C lands.

### Phase B — Gate the governance docs themselves *(prevents RC-2, RC-4; effort ~1–2 days agent work)*
- **doc-lint guard**: deterministic, stdlib checker for canonical docs — frontmatter schema, status enum, changelog columns, `b`-suffix↔status consistency, MUST-language on binding rules. Wire into `orchestrator/governance/governance_lint.py` so a broken canonical doc refuses runs exactly like a broken matrix.
- **doc↔code contract checks**: SPEC H tiers ⊆ `planner.mjs H_TIERS`; axis letters unique across the doc family; the "approved" predicate machine-decidable.
- **bump rule**: a version bump on any governance doc requires a reviewer row distinct from the author in the changelog (kills the 0.4.0b failure mode: three unreviewed same-day bumps).

### Phase C — H-axis 0.6.0 redesign *(the deliberate decision; owner: Boss decides, agents draft; needs upstream sync)*
Write `RFC--H-AXIS-0.6.0` proposing:
1. **Standard vocabulary**: `Hk` = k-hop ego graph of the task's anchor node; policy attached separately, radius defined in one line.
2. **Un-fuse the scalar** (restore UCF layering): WHO = tool/permission scope (what `tierTools` already enforces); retrieval relevance = hop-decay scoring (`0.7·sim + 0.3·1/(1+hops)`) with resolution gradient FULL→MENTION + `expand()`; HOW MUCH = the existing cost caps. Delegation inherits the parent ceiling (already law since 0.5.0b).
3. **Derived ceiling**: `H_max ≈ 2 × hierarchy_depth` of the actual graph (default 6 for a 4-layer hierarchy) — a measured config, not a constant.
4. **Re-aim the smell**: needing > `H_max` ⇒ missing hub/summary node or oversized task (decompose / add intermediate doc). Coupling/spaghetti detection belongs to **W** (fan-out) — note dense coupling *shortens* paths, so GVDOC-1003's TIP is inverted as written.
5. **Upstream sync, one canon**: propose GVDOC-1003 v1.4 + STD-Execution-Governance v2.3 with the corrections (inverted TIP, "6 hops = 6 nodes" arithmetic, H-letter overload); declare the canonical residence (cognitive_system/gks) and make GoVibe/RWANG derive with an explicit precedence clause — no more copy-forks (RC-3).

### Phase D — Make hops real *(after the traceability graph ships; unblocks the honest metric)*
- Measure each task's context-closure hop distance on the RWANG traceability graph / GenesisDB; lint "task needed > H_max" as an architecture warning (the origin's health-gate, finally falsifiable).
- Feed the resolution gradient into the runner's context-brief assembly (the FLIGHT spec's Flight Plan context preview already renders trim orders — connect it).
- Until then, `tierTools` stays as the honest WHO-side approximation; hop language stays out of binding text.

### Phase E — GKS compiler hygiene *(independent; small)*
- Fix the recursive frontmatter self-embedding (attributes nested ~4 deep) and false `has_secret/leak_risk` classifier stamps observed in `cognitive_system/gks` outputs; re-normalize affected files.

## 7. Lessons

1. **A governance contract needs governance most of all** — apply the doc gate to the doc that defines the doc gate.
2. **Never fuse orthogonal controls into one scalar** to save a field; the fusion debt comes due as contradictions.
3. **Copy is not standalone** — standalone means *self-sufficient with declared precedence*, not *forked text*.
4. **If a number came from a story (six degrees), derive it from your own graph before writing it into law.**
5. Labels that outlive their measurements become numerology; keep the measurement or drop the label.

---

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0b | 2026-07-10 | candidate | Initial RCA: 5 root causes, timeline with sources, corrective actions (0.5.0b, b6cd792), forward plan Phases A–E. | pending | ClaudeFable |
