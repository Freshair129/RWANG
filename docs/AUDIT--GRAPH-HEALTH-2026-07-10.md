---
version: "0.1.0b"
created_at: "2026-07-10T00:00:00+07:00,ClaudeFable,pending"
last_update: "2026-07-10T00:00:00+07:00,ClaudeFable"
status: "candidate"
superseded_by: null
attributes:
  domain: "agent-governance"
  doc_type: "audit"
  scope: "First measurement of the graphs the H/R axes describe (RCA Phase D)"
  language: "en"
---

# AUDIT--GRAPH-HEALTH-2026-07-10 — the hop ceiling, measured

**Complexity:** C-2 · **Access Scope:** H2 · **Dispatch Tier:** T-cloud · **Model Level:** Frontier · **W-Scale:** W2 · **Risk:** LOW
**Required Artifacts:** this audit + `orchestrator/governance/hop_metrics.py` (the instrument)
**Verification:** every number below is reproducible with `python orchestrator/governance/hop_metrics.py`; the tool's graph math is proved against hand-computed fixtures (`--self-test`).

---

## 1. Why this exists

RFC--H-AXIS-0.6.0 (D3/D4) removed hop language from binding text with an explicit promise: *hops return once they are measured on a real graph, and the ceiling becomes a derived parameter rather than the number 6 borrowed from a 1967 letter experiment.* RCA Phase D is that promise. This audit is its first execution.

Two real graphs exist today; neither needed new storage:

- **GKS atom graph** — `### Depends on` wikilinks between atoms (the graph GVDOC-1003 §3 describes).
- **Task DAG** — `backlog.json` `tasks[].deps`.

## 2. Measurements (2026-07-10)

| Metric | GKS atom graph | Task DAG (`backlog.json`) |
|---|---|---|
| nodes / edges | 37 / 55 | 45 / 53 |
| components · acyclic | 1 · yes | 1 · yes |
| DAG depth (layers) | 5 | 13 |
| **derived ceiling** `2 × (depth − 1)` | **8** | 24 |
| **diameter** | **7** | 14 |
| **average path length** | **3.05** | 5.30 |
| clustering coefficient | 0.228 | 0.035 |
| degree max / mean | 10 / 2.97 | 9 / 2.36 |
| nodes over derived ceiling | **0** | 0 |
| W4 super-hubs (deg ≥ 9) | `entity--atom-schema`, `feature--atom-store` | `G0.1` |
| W3 warnings (deg 6–8) | `algo--knowledge-adapter` | `G3.4` |

## 3. Findings

**F1 — The constant 6 fails; the derived ceiling holds.** The atom graph's diameter is **7**. Every task requiring the far side of the graph would breach a fixed 6-hop ceiling. Against the **derived** ceiling (`2 × (5 − 1) = 8`) **no node is over budget**. This is precisely the outcome RFC D4 predicted when it replaced the constant with a derivation, and it is now measured rather than argued.

**F2 — "Six degrees" is a claim about *typical* paths, not the worst pair.** The atom graph's **average path length is 3.05** — less than half the folklore number — while its diameter is 7. Clustering (0.228) is ~2.8× that of a random graph of the same density (≈0.08). Short typical paths with high clustering **is** the small-world signature; the network is small-world, and the diameter never had to be ≤ 6 for that to be true. Reducing the reach precondition to `diameter ≤ 6` is therefore both stricter than the theory and false on our own graph. **Average path length is the honest metric**, exactly as POC-H6 §5 already named it (`avg_path_length`, `clustering_coefficient`).

**F3 — Radius semantics do not transfer to the task DAG.** The backlog is a 13-layer dependency chain: clustering 0.035, no small-world structure. Reading `R` (retrieval radius) tiers off this graph would be a category error. `R` belongs to the knowledge graph; the task DAG is what `waves()` topologically batches. The instrument reports both and labels the distinction.

**F4 — Real super-hubs exist, and W finds them.** `entity--atom-schema` and `feature--atom-store` each carry degree 10; `G0.1` carries 9. Per SPEC §8 these are **W4** — "block high-risk deployment until decomposed or approved". This is the coupling detector working on real data, and it vindicates moving spaghetti-detection from the hop axis to the fan-out axis: the coupling is visible in **degree**, and the graph's paths stayed short (APL 3.05) *because of* those hubs, not in spite of them.

## 4. Defects this measurement exposes in approved documents

| # | Document | Defect | Evidence | Proposed correction |
|---|---|---|---|---|
| D-1 | `RFC--H-AXIS-0.6.0` §D4 (active 0.1.0) | Formula states `hop_ceiling ≈ 2 × hierarchy_depth`, then parenthesises "(6 for a 4-layer hierarchy)" — but `2 × 4 = 8`. An off-by-one: walking up and back down a 4-layer hierarchy costs `2 × (4 − 1) = 6`. | Arithmetic; the tool implements `2 × (depth − 1)` and reproduces 6 for a 4-layer tree. | Change the formula to `2 × (depth − 1)`; the parenthetical is already right. |
| D-2 | `POC-H6-Budget-Sufficiency` §2/§3 (approved 0.1.1, govibe) | Reduces the reach precondition to **"graph diameter ≤ 6"**. Wrong metric (six-degrees is about typical paths) and **false on the real graph** (diameter 7). | This audit §2. | Restate the precondition on `avg_path_length` (and/or `eccentricity ≤ derived ceiling`), which §5 of that same document already nominates as the assertable metric. |
| D-3 | `FRAMEWORK--HIERARCHY-COMPACTION-STANDARDS` §3 (active 1.4.0, govibe) | Text is correct (`2 × (layers − 1)`, ceiling re-derived when depth changes) but illustrates with a 4-layer hierarchy → 6. The **actual** atom graph is 5 layers → ceiling 8. | This audit §2. | Keep the rule; update the worked example to the measured graph, or mark the 4-layer figure as illustrative. |

None of these three is load-bearing for any running gate: the ceiling is a health report (RFC D4), not an agent permission. They are documentation defects with a measurement now attached, and D-2/D-3 live upstream (`govibe`) where the owner signs off.

## 5. What landed

- `orchestrator/governance/hop_metrics.py` — deterministic, stdlib-only, BFS. Reads the atom wikilink graph and/or the task DAG; reports components, acyclicity, depth, derived ceiling, diameter, average path length, clustering, degree distribution, W3/W4 hubs, and nodes over the derived ceiling. `--self-test` proves the graph math against hand-computable fixtures (path, triangle, star at the W3/W4 boundary, disconnected cycle). `--strict` is available for CI; the default is a report, because **an over-ceiling node never blocks an agent** (RFC D4) — it means the graph is missing a hub or the task was scoped too wide.
- Governance Matrix row `graph-health-metrics` (GP10, enforced): the guard proves the instrument still works, not that the graph is healthy. Same shape as `quality-decay-metrics`.

## 6. Not done (named, not hidden)

- **Resolution gradient into the runner's context brief** (the second half of RCA Phase D): hop distance as a decay term in retrieval scoring, with FULL/SUMMARY/SKELETON/MENTION tiers and `expand()`. The origin design exists (`FRAMEWORK--UNIVERSAL-CONTEXT-FRAMEWORK`, `CONCEPT--RESOLUTION-GRADIENT`); wiring it into `run.js`'s context assembly is separate work.
- **Per-task context closure.** This audit measures the graph, not what any individual task actually retrieved. Answering "did task T need more than the ceiling?" requires recording each task's retrieval set — a new event field, not an assumption.

## 7. Open questions

1. Should `hierarchy_depth` come from the DAG's longest path (as implemented) or from a declared layer map (System→Module→Feat→Function)? The two disagree today: the atom DAG measures 5, the GVDOC hierarchy declares 4.
2. Do the two W4 super-hubs (`entity--atom-schema`, `feature--atom-store`) warrant decomposition, or are they legitimate schema/store anchors that every atom must reference? SPEC §8 requires a decision, not silence.

---

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0b | 2026-07-10 | candidate | First measurement of the atom graph and task DAG: derived ceiling holds (8) where the constant 6 fails (diameter 7); average path length 3.05 confirms small-world on the metric that carries the claim; three documentation defects exposed (RFC D4 off-by-one, POC-H6 diameter reduction, GVDOC worked example); `hop_metrics.py` + Matrix row GP10 landed. | pending | ClaudeFable |
