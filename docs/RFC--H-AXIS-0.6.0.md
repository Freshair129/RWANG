---
version: "0.1.0"
created_at: "2026-07-10T00:00:00+07:00,ClaudeFable,pending"
last_update: "2026-07-10T00:00:00+07:00,Boss"
status: "active"
superseded_by: null
attributes:
  domain: "agent-governance"
  doc_type: "rfc"
  scope: "H-axis redesign proposal for governance framework 0.6.0 + upstream sync"
  language: "en"
---

# RFC--H-AXIS-0.6.0 — Un-fuse the H axis: 5 enforceable access tiers, measured hops, derived ceiling

**Complexity:** C-3 · **Context-Hop:** H4 (governance; owner-requested) · **Dispatch Tier:** T-cloud · **Model Level:** Frontier · **W-Scale:** W2 · **Risk:** HIGH (default from C-3)
**Required Artifacts:** this RFC → owner decision → SPEC 0.6.0 edit + upstream proposals
**Verification:** every claim carries a measurement or file citation; adoption criteria in §8.

---

## 1. Summary

Split the current H scalar into the three things it actually is — an **access ceiling** (enforced today), a **retrieval-relevance radius** (designed in the origin docs, not yet built), and a **budget** (already enforced elsewhere) — and make each surface tell the truth:

1. The declared per-task `H` becomes a **5-tier access scale `H0`–`H4`**, defined 1:1 by the capability sets `planner.mjs tierTools` actually enforces. `H5`/`H6` are removed (they grant nothing `H4` does not).
2. **Hops become measurable or unspoken**: the word "hop" leaves binding text until it is computed on a real graph; when the traceability graph ships, `Hk` is defined as the standard **k-hop ego graph** of the task's anchor node, and hop distance feeds retrieval as a *decay term*, not a fence.
3. The famous **6 becomes a derived parameter**: `hop_ceiling ≈ 2 × hierarchy_depth(graph)` (6 for a 4-layer hierarchy), enforced as an architecture-health lint, not an agent permission.

## 2. Motivation — evidence, not taste

| Evidence | Source |
| --- | --- |
| Code distinguishes exactly **5 capability sets**: H0 read → H1 +glob/grep → H2 +write/multiFile → H3 +shell → H4 +network; **H5 ≡ H4**, and H6 existed only as a bug (unknown tier → H0 read-only toolset) until `b6cd792` | `planner.mjs tierTools` |
| Real usage: atoms declare H1×2, **H2×17, H3×16**, H4×2, **H0/H5/H6 × 0** — the ladder's top and bottom are dead weight | `D:/rwang/RWANG/gks/atoms` frontmatter survey 2026-07-10 |
| The origin defined H as **literal measured graph hops** with a small-world health rule; downstream copies kept the labels and dropped the measurement | `govibe/.agents/FRAMEWORK--HIERARCHY-COMPACTION-STANDARDS.md` (GVDOC-1003) §3 vs `STD-Execution-Governance.md` §3 |
| The deeper origin never used a fence at all: hop distance is a **decay term** in retrieval scoring (`0.7·sim + 0.3·1/(1+hops)`) with resolution tiers FULL→MENTION + `expand()`, and the hard wall is the **token budget** (pipeline Layer 5) | `cognitive_system/gks/framework/FRAMEWORK--UNIVERSAL-CONTEXT-FRAMEWORK.md`, `concept/CONCEPT--RESOLUTION-GRADIENT.md` |
| Fusing access/radius/budget into one scalar produced a real BLOCKER: the 0.4.0b Budget Control bullet was a written-in bypass of the H approval gate | `RCA--GOVERNANCE-FRAMEWORK-DRIFT.md` RC-1; `REVIEW--GOVERNANCE-FRAMEWORK-2026-07-09.md` [3] |
| The "spaghetti" reading of the 6-hop rule is inverted: adding edges only shortens shortest paths — dense coupling makes distances *smaller*. Long required radius indicates missing hub/summary nodes or oversized tasks. Fan-out (**W**) is the true coupling detector | graph-theory argument recorded in RCA §6 Phase C |

## 3. Design

### D1 — Access scale: `H0`–`H4`, defined by enforceable capability sets

| Tier | Capability set (from `tierTools`) | Scope reading | Extra requirement |
| --- | --- | --- | --- |
| `H0` | read (single bounded file) | atom/subtask | — |
| `H1` | + glob, grep | task/component neighborhood | — |
| `H2` | + write, multiFile | story/feature | — |
| `H3` | + shell | epic/module | — |
| `H4` | + network (full set) | architecture / cross-system | approval before implementation |

`H5`/`H6` are **removed from the access scale**. The approval *grantor* no longer rides on extra H rungs; it derives from C (0.5.0b §10 rule generalized): `C-2` scope → Architecture gate owner; `C-3` scope → owner (`T-human`).

### D2 — Un-fused surfaces (restores the UCF layering)

| Concern | Mechanism | Status |
| --- | --- | --- |
| WHO may touch what (access) | declared `H0`–`H4` → `tierTools` allow-set | enforced today |
| WHAT is relevant (radius) | hop-decay retrieval scoring + resolution gradient FULL/SUMMARY/SKELETON/MENTION + `expand()` | build with the traceability graph (Phase D of the RCA) |
| HOW MUCH may be spent (budget) | existing cost caps / `capBlock` / tier downgrade | enforced today — H never duplicates it |

Over-limit paths (law since 0.5.0b, restated): over *budget* within ceiling → delegate; a delegate **inherits the parent's approved H ceiling**. Needs *wider access* → Brief Here / approval. At the top and still stuck → halt to `T-human`.

### D3 — Hops become standard vocabulary, or silence

Binding text stops saying "hop" until hops are computed. When the traceability graph ships: `Hk` = the **k-hop ego graph** (ball of radius k) of the task's anchor node — one line, standard term, tool-compatible (ego-graph / path-expansion queries, k-hop retrieval literature).

### D4 — The ceiling is derived, and it is a health gate, not a permission

`hop_ceiling ≈ 2 × hierarchy_depth(graph)` — for the current 4-layer GKS hierarchy that is 6, which is why 6 always "felt right". Measured per graph, stored in config, re-derived when the hierarchy changes. Enforcement: a **lint warning** ("task context closure needed k > ceiling hops → add an intermediate summary node or decompose the task"), never an agent block. Coupling/spaghetti detection stays with **W** (fan-out), whose reading is direction-correct.

### D5 — Defaults: declare only overrides

`H` defaults from C: `C-0→H0`, `C-1→H1`, `C-2→H2`, `C-3→H3` (`H4` by declaration + approval). A task header states H only when overriding the default upward — same declare-to-override-upward grammar as Risk (SPEC 0.5.0b §2).

### D6 — One canon, derived copies

Canonical residence of the axis definition: the origin framework family (`cognitive_system/gks`). Downstream proposals: **GVDOC-1003 v1.4** (fix the inverted spaghetti TIP; fix "6 Hops รวมตัวมันเอง = 6 Nodes" — 6 hops including self is 7 nodes; stop using the letter H for Compaction Heights), **STD-Execution-Governance v2.3** (H table → 5 access tiers + derived ceiling), **RWANG SPEC 0.6.0** (this RFC applied). Each derived doc carries an explicit precedence clause — no more copy-forks (RCA RC-3).

## 4. Migration & compatibility

| Surface | Change | Cost |
| --- | --- | --- |
| Atoms (`context_scaling_tier`) | none — zero atoms use H5/H6 | **0** |
| `planner.mjs` | `H_TIERS` → `["H0".."H4"]` (supersedes the `b6cd792` H6 append); unknown tier keeps falling back safe-low | 1 line + comment |
| RWANG SPEC §5/§9/§13/§14 | H table → 5 rows; artifact table `C-3/H5-H6` row rekeyed to `C-3` + owner approval; grantor bullets simplified | doc edit, major bump → 0.6.0 |
| `doc_lint.py` X1 | unchanged — it already proves SPEC tiers ⊆ code tiers, and will catch any straggler `H5`/`H6` reference the SPEC edit misses | 0 |
| GoVibe STD / GVDOC-1003 | upstream proposals per D6 — RWANG does not diverge silently | coordination (owner) |
| FLIGHT UX axis chips | render 5-value H; hop/ceiling readouts arrive with Phase D | cosmetic |

## 5. Rollout

1. **0.6.0a (doc + code truncate):** apply D1/D2/D5 to the SPEC, truncate `H_TIERS`, keep `doc_lint` green. No behavior change for any existing atom.
2. **Upstream window:** submit D6 proposals; hold RWANG at 0.6.0a until GoVibe accepts or a precedence clause records the divergence deliberately.
3. **0.6.x (measured hops, with the traceability graph):** implement D3/D4 — hop computation, decay-scored retrieval + resolution gradient into the runner's context brief, ceiling lint.

## 6. Alternatives considered

- **Keep 7 tiers** — rejected: two tiers are machine-indistinguishable and unused; a governance scale where two values cannot differ in enforcement is decoration (RCA lesson 5).
- **Rename H entirely to a standard term everywhere** — rejected: atoms/specs/UI all speak H; the standard term (`k-hop ego graph`) belongs in the *definition*, not in a costly mass rename.
- **Hard hop fence at runtime now** — rejected: nothing measures hops yet; enforcing an unmeasured number repeats the exact drift this RFC exists to end.

## 7. Open questions

1. `hierarchy_depth` source of truth: GKS layer map or measured longest root-to-leaf path in the traceability graph?
2. Does GoVibe accept the upstream edits, or does RWANG record a deliberate divergence clause?
3. Should the H2/H3 boundary (write vs shell) also require a lightweight confirm for `shell` on unattended runs, or is the existing tool_guard classification sufficient?
4. When resolution-gradient retrieval lands, does the declared access H also cap `expand()` targets, or is expand governed by ABAC only?

## 8. Acceptance criteria (for adopting this RFC)

- Owner approves D1–D6 (or amends per-decision — each D is separable).
- SPEC 0.6.0 draft passes `doc_lint` including X1 with the truncated `H_TIERS`.
- No atom or run breaks: verified by re-running the atom survey (expect zero H5/H6) and `governance_lint` 15/15.
- Upstream disposition recorded (accepted / diverged-with-clause) before 0.6.0 drops its `b`.

---

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0 | 2026-07-10 | active | D1-D6 approved in full by the owner; `b` suffix dropped per SPEC §12 (the approval act). 0.6.0a applied to the SPEC in the same commit. | pending | Boss (approver) |
| 0.1.0b | 2026-07-10 | draft | Initial RFC: 5-tier access scale (drop H5/H6), un-fuse access/radius/budget per UCF, standard k-hop vocabulary, derived hop ceiling as health lint, W owns coupling, upstream sync plan. | pending | ClaudeFable |
