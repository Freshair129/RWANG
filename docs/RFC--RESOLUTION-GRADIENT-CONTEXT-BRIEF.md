---
version: "0.1.0"
created_at: "2026-07-11T00:00:00+07:00,ClaudeFable,pending"
last_update: "2026-07-11T00:00:00+07:00,Boss"
status: "active"
superseded_by: null
attributes:
  domain: "agent-governance"
  doc_type: "rfc"
  scope: "Resolution gradient into run.js's context brief — RCA Phase D second half (0.6.x)"
  language: "en"
---

# RFC--RESOLUTION-GRADIENT-CONTEXT-BRIEF — Graded, scored, budgeted context assembly for the runner

**Complexity:** C-3 · **Access Scope:** H2 · **Dispatch Tier:** T-cloud · **Model Level:** Frontier · **W-Scale:** W2 · **Risk:** HIGH (default from C-3)
**Required Artifacts:** this RFC → owner decision → implementation (deterministic tier helper + `run.js` context-assembly wiring + `store/knowledge.mjs` sim binding)
**Verification:** every claim carries a file citation or a measurement; adoption criteria in §8. This doc passes `doc_lint.py` D1–D6 and keeps `governance_lint.py` green.

---

## 1. Summary

The runner's context brief is today a flat, unscored, unbudgeted blob of prose. This RFC replaces its assembly with the **resolution-gradient pipeline** the origin design always specified — graded retrieval where each candidate loads at one of four resolution tiers chosen by relevance and budget, with on-demand promotion:

1. **Hops return as a decay term, not a fence.** Retrieval relevance is scored `0.7·sim + 0.3·1/(1+hops)` — the exact formula the parent RFC parked ([RFC--H-AXIS-0.6.0.md](RFC--H-AXIS-0.6.0.md) §2, D2) once hops became measurable. They are measurable now: `hop_metrics.py` shipped ([AUDIT--GRAPH-HEALTH-2026-07-10.md](AUDIT--GRAPH-HEALTH-2026-07-10.md)).
2. **Graded resolution replaces flat prose.** Each atom loads at `FULL | SUMMARY | SKELETON | MENTION`; the MVP ships `FULL + MENTION + expand()`, faithful to `CONCEPT--RESOLUTION-GRADIENT` decision D-2.
3. **The token budget is the hard wall.** `scope.budgetTokens` bounds the package; overflow trims by tier order, never by recency — the contract FLIGHT §5.5 already renders.

This is the **second half of RCA Phase D**, named "Not done" in the AUDIT §6 and scheduled as the "0.6.x" rollout step of the parent RFC ([RFC--H-AXIS-0.6.0.md](RFC--H-AXIS-0.6.0.md) §5.3).

## 2. Motivation — evidence, not taste

| Evidence | Source |
| --- | --- |
| The work is explicitly named unfinished: "Resolution gradient into the runner's context brief … hop distance as a decay term in retrieval scoring, with FULL/SUMMARY/SKELETON/MENTION tiers and `expand()`" | `AUDIT--GRAPH-HEALTH-2026-07-10.md` §6 "Not done" |
| The parent RFC parked exactly this: "0.6.x (measured hops, with the traceability graph): implement D3/D4 — hop computation, decay-scored retrieval + resolution gradient into the runner's context brief, ceiling lint" | `RFC--H-AXIS-0.6.0.md` §5.3, D2 |
| Today's brief has **no scoring, no tiers, no budget, no `expand()`**: one `sonnet` agent writes ≤60 lines of prose to `runs/<runId>/context.md`, read by every Execute agent by path reference only | `orchestrator/run.js` (writer 455–487; reader 178–180) |
| Hops are now measured, deterministically, stdlib-only: the atom graph is 37 nodes, depth 5, diameter 7, APL 3.05 — small-world confirmed | `orchestrator/governance/hop_metrics.py`; `AUDIT--GRAPH-HEALTH-2026-07-10.md` §2 |
| The origin defines the whole pipeline: Layer 3 graph+vector scoring → Layer 4 resolution tier → Layer 5 budget, `score = 0.7·sim + 0.3·1/(1+hops)`, FULL→MENTION + `expand()` | `cognitive_system/gks/framework/FRAMEWORK--UNIVERSAL-CONTEXT-FRAMEWORK.md` §10; `concept/CONCEPT--RESOLUTION-GRADIENT.md` |
| The downstream consumer is already specified: a per-task `ContextPackage` (brief slice + PAST MISTAKES + exemplar) against a `scope.budgetTokens` bar, rendering a live trim order | `DESIGN--RWANG-FLIGHT-DESKTOP-UX.md` §5.5 (237–264) |
| The sim substrate is anchored but unbuilt: `store.genesisdb` binds bge-m3 (vectorDim 1024) to the external GenesisBlockDB, but Rwang's own `store/knowledge.mjs` binding is imported by `engine.mjs` and absent from the tree | `config.json` §store (557–566); `engine.mjs` `queryGrounded`/`queryPastMistakes` |

## 3. Design

### D1 — The five-layer pipeline, mapped to Rwang

The origin pipeline (`FRAMEWORK--UNIVERSAL-CONTEXT-FRAMEWORK` §10) is five ordered layers. Two are already enforced in Rwang; this RFC builds the other three.

| Layer | Concern | In Rwang | This RFC |
| --- | --- | --- | --- |
| 1 Namespace | storage partition | target repo / run dir | reused |
| 2 ABAC | who-may-read | `planner.mjs tierTools` / declared `H` | reused |
| 3 Graph + vector scoring | relevance topology | — (none today) | **build (D2)** |
| 4 Resolution tier | FULL/SUMMARY/SKELETON/MENTION | — (flat prose today) | **build (D3)** |
| 5 Budget | token ceiling | cost caps exist; brief is uncapped | **build (D4)** |

The layers are cost-ordered; re-ordering breaks correctness. Layers 1–2 already run (namespace = the run's target; ABAC = the tier's `tierTools` allow-set). The gap this RFC closes is 3–5, over the brief specifically.

### D2 — Scoring (Layer 3): hops as a decay term, sim from bge-m3

For each candidate atom `a` relative to a task `T`:

```
score(a, T) = w1 · sim(a, T) + w2 · 1/(1 + hops(a, T))        w1 = 0.7, w2 = 0.3
```

- **`sim(a, T)`** — semantic similarity, from GenesisDB bge-m3 hybrid search (`hybridSearch`, the Probe binding FLIGHT §5.5 names, k=3 α=0.5). This is a **model call** and therefore lives in the **JS runner**, never in the deterministic core (CLAUDE.md: *"NEVER put LLM SDK calls in the core"*).
- **`hops(a, T)`** — BFS distance from `T`'s **anchor node** to `a` on the **GKS atom graph**, reusing `hop_metrics.py`'s graph math (`_bfs`, `read_atoms`). Per AUDIT F3, hop-decay is valid **only on the atom graph** — the backlog task DAG is a dependency chain, not a knowledge graph, and radius semantics do not transfer to it.
- **Anchor node** — the atom whose id/title best matches the task (highest `sim`); when a task maps to no atom (score below a floor), the run degrades to the sim-only ranking with `hops → ∞` (decay term → 0). See §7 OQ-2.

The weights `0.7/0.3` are the origin's working assumption, flagged there as open (spec §14 OQ-1); §7 OQ-3 carries it forward for retuning on Rwang's own graph.

### D3 — Resolution tiers (Layer 4): FULL + MENTION now, four eventually

Every scored atom is rendered at one tier:

```
Tier      Content shape                          Typical tokens   MVP?
FULL      complete body + frontmatter            500 – 5000       ✅ yes
SUMMARY   frontmatter + first paragraph + h2s    50 – 300         ⏳ Phase 2
SKELETON  id + title + 1-line description        20 – 60          ⏳ Phase 2
MENTION   id only (pointer for expand)           5 – 10           ✅ yes
```

Per `CONCEPT--RESOLUTION-GRADIENT` D-2, the **MVP ships FULL + MENTION + `expand()`** — the highest-value, highest-risk slice, proving the `expand()` autonomy hypothesis. The four-tier data model is encoded from day one, so the SUMMARY/SKELETON renderers are an **additive Phase-2 deliverable, not a re-architecture**. They ship only if telemetry shows ≥ 20% of MENTION-tier atoms get expanded (the origin's threshold); below that, the FULL/MENTION cliff is fine.

Tier assignment is a **pure function of `score` and remaining budget** — it holds no model call and therefore belongs in the **deterministic core** (a `resolution_gradient.py`, the structural analog of `hop_metrics.py`: stdlib, self-tested against fixtures).

### D4 — Budget (Layer 5): the hard wall, trimmed by tier order

`scope.budgetTokens` (the bar FLIGHT §5.5 renders, `1,420/2,000 tok`) is the ceiling on the assembled package. Atoms are admitted highest-score-first at FULL until the budget tightens, then demoted down the tier ladder (FULL → SUMMARY → SKELETON → MENTION) — **compress high-resolution first, never drop by recency**. PAST MISTAKES are **pinned** (non-trimmable, FLIGHT §5.5); the exemplar trims first. This is exactly the "trim order" the Context Preview already displays — the pipeline produces it, the UI reflects it.

### D5 — `expand(id, { to, reason })`

An Execute agent that judges a MENTION under-resolved promotes it mid-task:

- **Mechanism** — an `expand` affordance added to the executor prompt ([run.js:178-180](../orchestrator/run.js)); the promoted atom's higher-tier body lands in the agent's next read of `context.md` (or a returned slice).
- **Governance** — every `expand()` is audit-logged with the score that produced the original tier (origin verification rule).
- **Access bound (answers parent RFC OQ-4)** — declared access `H` **does** cap `expand()` targets: the reachable set is `ABAC ∩ H-reach`, not ABAC alone. An agent cannot `expand()` its way past its declared reach; widening reach still routes through Brief-Here / approval (0.5.0b law). This keeps `expand()` from becoming a bypass of the un-fused access axis the parent RFC just restored.

### D6 — Wiring into `run.js`

- The context-brief agent ([run.js:455-487](../orchestrator/run.js)) is **augmented, not replaced**: instead of free-form prose, `context.md` becomes a graded assembly — FULL atom bodies for the top scores, a MENTION index (id + pointer) for the tail, under the budget bar. The existing "facts frozen at Route time — trust the live repo" contract is preserved.
- The executor prompt ([run.js:178-180](../orchestrator/run.js)) gains the `expand()` affordance (D5).
- **Sacred-core split, restated:** the new deterministic helper owns tiering + budget math (pure, self-tested); the model-call `sim` stays in JS via the `store/knowledge.mjs` binding. `run.js` remains a Workflow script — all filesystem/model work happens inside `agent()` calls, none in the body.

### D7 — Graceful degradation

When `store.knowledge = 'file'` (GenesisDB absent — the current broken-import reality, and FLIGHT §5.5's explicit "Degraded" state), the sim term is unavailable. The pipeline **still runs on hop-only scoring** `1/(1+hops)`; relevance ranking degrades but graded resolution, budget, and `expand()` all keep working. The `store/knowledge.mjs` binding is therefore named a **hard dependency of the sim term only**, not of the pipeline — this RFC does not block on GenesisDB being wired.

## 4. Migration & compatibility

| Surface | Change | Cost |
| --- | --- | --- |
| `run.js` context-brief agent | augment: graded assembly instead of prose (D6); same file path, same freeze contract | agent-prompt rewrite |
| Deterministic core | add `resolution_gradient.py` (tier + budget math, self-tested like `hop_metrics.py`) | new file, stdlib only |
| `store/knowledge.mjs` | implement the missing sim binding (`getStore`/`queryContext`/`groundContext`) so `sim` resolves; else D7 fallback | new JS module (or accept degrade) |
| `config.json` | add a resolvable `embed`/`rerank` role (today bge-m3 is only a `store` anchor, not in `roles`) | config edit |
| `hop_metrics.py` | reused read-only (graph math + `read_atoms`) — no change | 0 |
| FLIGHT §5.5 Context Preview | already specifies the `ContextPackage`/budget/trim-order contract — the pipeline **feeds** it | 0 (conform) |
| Existing specs' semantics | none touched — this adds a pipeline, changes no rule | 0 |

## 5. Rollout

1. **Phase 1 (MVP):** Layer-3 scoring (`0.7·sim + 0.3·1/(1+hops)`, hop-only fallback per D7) + FULL/MENTION tiers + `expand()` + `scope.budgetTokens` budget. Deterministic helper lands with self-tests; `run.js` assembly wired.
2. **Phase 2 (four tiers):** SUMMARY + SKELETON renderers, gated on `expand()` telemetry ≥ 20% (D3). Additive — no re-architecture.
3. **Phase 3 (UI live):** feed the FLIGHT Context Preview live trim-order from the assembled package (§5.5 data bindings).

## 6. Alternatives considered

- **Lexical / hop-only similarity** — rejected as the primary path (owner chose real bge-m3 embeddings for full UCF fidelity); **retained only as the D7 degrade path** when GenesisDB is absent.
- **Keep the flat prose brief** — rejected: no relevance ordering, no token budget, no `expand()`; it cannot feed the FLIGHT budget/trim-order contract and cannot honor the parent RFC's decay-term promise.
- **Build a new in-repo vector store** — rejected: GenesisBlockDB already owns the bge-m3 + FTS5 + RRF + rerank pipeline (`specs/P0-vector-quant-sidecar.yaml` confirms that ownership); Rwang should bind to it, not fork embedding math into the control plane.
- **Put the scoring in the Python core** — rejected: embedding is a model call; CLAUDE.md forbids SDK calls in the core. Only the sim-free tier/budget math is core-eligible (D6).

## 7. Open questions

1. **`hierarchy_depth` source of truth** (inherited from parent RFC OQ-1): the GKS layer map declares 4, the measured atom DAG longest path is 5 — the derived ceiling differs (6 vs 8). Which does the anchor-graph reader trust? (Does not block scoring; the ceiling is a health lint, not a gate.)
2. **Anchor-node selection when a task maps to no atom.** D2 degrades to sim-only ranking (`hops → ∞`); is that acceptable, or should such tasks floor at a minimum FULL set from the spec's own `depends_on`?
3. **Weight tuning.** Is `0.7·sim + 0.3·1/(1+hops)` right on Rwang's graph (APL 3.05, diameter 7), or does the small radius argue for a different `w2`? The origin flags this as open (spec §14 OQ-1).
4. **`expand()` budget accounting.** Does an `expand()` that overflows `scope.budgetTokens` trigger a re-trim of lower-score atoms, or is it refused? (D4 implies re-trim; needs confirmation for unattended runs.)

## 8. Acceptance criteria (for adopting this RFC)

- Owner approves D1–D7 (each `D` is separable; amend per-decision).
- This RFC passes `doc_lint.py` (D1–D6) and `governance_lint.py` stays green with it present (the `doc-governance` GP7 hard gate).
- The Phase-1 design introduces no rule change to any existing SPEC — verified by re-reading §4 (all cells are add/augment/reuse, none is "change semantics of").
- Upstream disposition of the origin concept recorded as "cited canonical, not forked" before this RFC drops its `b`.

---

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0 | 2026-07-11 | active | D1–D7 approved in full by the owner; `b` suffix dropped per SPEC §12 (the approval act). Implementation of §5 Phase 1 (scoring + FULL/MENTION + `expand()` + budget) is unblocked; `store/knowledge.mjs` sim binding remains the one hard dependency (else D7 hop-only fallback). | pending | Boss (approver) |
| 0.1.0b | 2026-07-11 | candidate | Initial RFC: wire the resolution gradient into `run.js`'s context brief (RCA Phase D second half / parent RFC 0.6.x). Five-layer pipeline mapped to Rwang (build Layers 3–5); scoring `0.7·sim + 0.3·1/(1+hops)` with sim from GenesisDB bge-m3 (JS runner) and hops from `hop_metrics.py` (core); FULL+MENTION+`expand()` MVP with SUMMARY/SKELETON gated on telemetry; `scope.budgetTokens` budget with tier-order trim feeding FLIGHT §5.5; sacred-core split (deterministic tier/budget helper vs model-call sim); answers parent RFC OQ-4 (declared `H` caps `expand()` targets); hop-only graceful degradation when GenesisDB absent. | pending | ClaudeFable |
