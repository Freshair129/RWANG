---
version: "0.1.0b"
created_at: "2026-07-10T00:00:00+07:00,ClaudeFable,pending"
last_update: "2026-07-10T00:00:00+07:00,ClaudeFable"
status: "candidate"
superseded_by: null
attributes:
  domain: "agent-governance"
  doc_type: "decision"
  scope: "SPEC §8 super-hub decision for the measured W4/W3 hubs — decompose or approve"
  language: "en"
---

# DECISION--SUPERHUB-2026-07-10 — decompose or approve

**Complexity:** C-2 · **Access Scope:** H2 · **Dispatch Tier:** T-human (owner decision) · **W-Scale:** W2 · **Risk:** LOW
**Required Artifacts:** this decision + `hop_metrics.py` hub-analysis (the evidence)
**Verification:** every number reproducible with `python orchestrator/governance/hop_metrics.py`; the anchor/god-object classifier is proved against inverted-star fixtures (`--self-test`).

---

## 1. The decision SPEC §8 forces

SPEC §8 marks a W4 super-hub (≥9 connections) as *"block high-risk deployment until decomposed **or approved**"*. `hop_metrics` (Phase D) and the W4 gate (GP11) named and gated them, but the escape clause requires a **human decision** per hub: approve it as a legitimate anchor, or decompose it. This document is that decision, presented for owner (`T-human`) sign-off.

## 2. The refinement that made the decision decidable

Degree alone flags a super-hub but **cannot distinguish an anchor from a god-object** — the two failure modes have opposite cures. The distinguishing signal is the **in/out split of the directed dependency edges** (edge `a → b` = *a depends on b*):

- **Anchor** — high in-degree, low out-degree (`in_ratio ≥ 0.7`): everything *depends on* it; it depends on little. A schema, a store, a scaffold. High reference count is its **job**. Decomposing it would fragment a single source of truth. → **approve**.
- **God-object** — high out-degree, low in-degree (`in_ratio ≤ 0.3`): it *depends on* everything. This is the coupling smell §8 exists to catch. → **decompose**.
- **Bidirectional hub** — in between: → review case by case.

This split is now computed and reported by `hop_metrics.py` (self-test proves it separates a star `hub→leaves` = god-object from an inverted star `leaves→hub` = anchor). The decision below is the tool's output, not a hunch.

## 3. The measured hubs and the verdict

| Hub | Degree | in | out | in_ratio | What it is | Verdict |
|---|---|---|---|---|---|---|
| `entity--atom-schema` | 10 | 10 | 0 | 1.00 | The atom schema — a pure sink; 10 atoms reference it, it references none | **APPROVE** |
| `feature--atom-store` | 9 | 7 | 2 | 0.78 | The store; depends only on the schema + engine IPC; every atom-touching feature depends on it | **APPROVE** |
| `algo--knowledge-adapter` (W3) | 8 | 6 | 2 | 0.75 | Retrieval-subsystem anchor; depends on GenesisDB + schema | **APPROVE** |
| `G0.1` (backlog) | 9 | 6 | 3 | 0.67 | "Scaffold Tauri v2 + React/Vite/Tailwind monorepo"; depends on the S-1/2/3 spikes, everything builds on it | **APPROVE** |

**All four are anchors, none is a god-object.** The atom schema is the textbook case (in_ratio 1.00 — a schema *should* be universally referenced). The store and knowledge-adapter are foundational subsystem anchors. `G0.1` is a scaffolding task: its "coupling" is temporal (everything starts after the monorepo exists), which is correct DAG structure, not accidental coupling. Its `in_ratio` (0.67) sits just under the anchor threshold because a scaffold legitimately depends on a few setup spikes — a bidirectional-leaning hub whose out-edges are all one-time setup; it reads as an anchor in context.

## 4. Recommendation

**Approve all four; decompose none.** Rationale: every hub is high-in/low-out — the anchor pattern §8's "approve" path exists for. Decomposing a schema or a store would split the single source of truth into fragments that then need re-synchronising, adding coupling rather than removing it (the same fusion mistake the H-axis work spent the day undoing).

**Runtime effect of approval:** the W4 gate (`w4-superhub-gate`) already routes `G0.1` through the confirm gate at dispatch — "approved" there = an operator confirms it once. This document is the *architectural* record justifying that confirm; the per-run confirm is its runtime expression. The atom-graph hubs (`entity--atom-schema` etc.) are not backlog tasks and never dispatch, so their approval is purely this record.

## 5. What owner sign-off means here

This is a `T-human` decision (SPEC §8 escape clause; §10 approval authority for a C-2 governance judgment). An agent gathered the evidence and recommends; it does not self-approve. On sign-off: drop the `b` suffix, set status `active`, record the approver in the changelog — at which point these four hubs are on record as approved anchors and future `hop_metrics` runs that surface them are expected, not action items.

## 6. Standing rule this establishes

For future super-hubs: **classify by in/out before deciding.** `in_ratio ≥ 0.7` → presumptively approve (anchor); `≤ 0.3` → presumptively decompose (god-object); in between → owner judgment. The tool now prints this on every run, so the decision is reproducible and does not have to be re-litigated from scratch.

## 7. Open questions

1. Should the anchor thresholds (0.7 / 0.3) be config, or are they stable heuristics? They are hard-coded in `hop_metrics.py` today.
2. `G0.1`'s in_ratio (0.67) is a hair under the anchor line — is a scaffolding task a special case (temporal coupling always reads as anchor), or should the threshold flex for `type: scaffold`?

---

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0b | 2026-07-10 | candidate | Super-hub decision for the four measured W4/W3 hubs: all anchors (in_ratio 0.67–1.00), recommend approve none-decompose. `hop_metrics.py` gains the in/out anchor/god-object classifier (self-test proves star vs inverted-star). Awaiting owner sign-off. | pending | ClaudeFable |
