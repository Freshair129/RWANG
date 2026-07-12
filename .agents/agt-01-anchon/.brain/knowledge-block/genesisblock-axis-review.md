# Knowledge — GenesisBlock axis review (ANCHON, fable loadout)

Vetted findings from ANCHON's 2-stage review of `D:\Codex\local-personal-agent\genesisblock_architecture.md`
(SPEC-KN-2026-ROOT). Cold entries formed with no access to Rwang docs; `[POST]` formed after reading them.

## Cold (pre-exposure — Stage 1)
- Doc is an unconsolidated AI chat transcript posing as a blueprint: ends with a question back to the user + flattery; 3 load-bearing self-contradictions (schema enum H0–H4 vs table H0–H6; marker dialects `@atom-node-id` vs `@atom-bind`; edge enum vs example's `uses`/`requires`; Guard Node in diagram absent from type enum).
- **#1 hole:** write-back has no trust model — parser blind-UPDATEs SSOT from any view, and §4.2 permissive mode lets AI write `DRAFT_MOCK` straight into the store while the render pipeline has no status filter → context-poisoning amplifier. Fix: quarantine namespace for AI drafts, excluded from context assembly until promoted.
- Single H0–H6 ladder conflates retrieval radius, content genre, and task type; `context_scaling_tier` stored per-NODE is a category error (scope is a task/query property). Counter-design: orthogonal axes — Radius (task), Altitude (node), Write-authority (separate ladder), token Budget with summary-degradation. Keep H-table as pedagogy only.
- Genuinely strong: views-as-queries + single point of mutation kills doc drift; H→human-document table is excellent pedagogy; §4.3 tier-declaration-as-checkable-claim with CI teeth is the sharpest governance move present.

## Post-exposure (after reading Rwang docs — Stage 2)
- [POST] Strongest convergence: cold "single H ladder is wrong, un-fuse it" IS Rwang's central RFC 0.6.0 move (split H scalar into access/radius/budget). Reached independently.
- [POST] Cold "Altitude on NODE" ≈ Rwang **D** axis (Compaction Depth, per-artifact) almost exactly. Cold "Radius on TASK" ≈ Rwang **R**, but Rwang DEFERRED R until measured; R does NOT transfer to the task DAG, only the knowledge graph (AUDIT F3, clustering 0.035) — subtlety missed cold.
- [POST] Missed cold: Rwang's **C** (Complexity) is the PRIMARY spine — H, Risk default from C. Had content-altitude but no task-ceremony axis.
- [POST] The "clash" dissolves & vindicates the split: Rwang declares H per-TASK (from per-task C), stores D per-NODE = the task/node split. GenesisBlock is the lone outlier bolting a task-property onto a node.
- [POST] Disagree with coordinator proposal: (a) `default=C-derived` is sound for Rwang's *capability*-H but BREAKS for GenesisBlock's *altitude*-H — read-scope doesn't track complexity (doc's own MySQL→Postgres query = low-C, universe-scope). (b) `H5–6 ← W` is strongest but conflates a static graph metric (node IS coupled) with a task operation (compute blast radius). Keep separate.
- [POST] Label fix: D = **Compaction Depth** (SPEC §6), NOT "resolution gradient" (that's a deferred **R** retrieval concern). Letter-collision: ANCHON's "W" = write-authority; Rwang's "W" = fan-out.
- [POST] Write-authority: NOT a hole for Rwang today (role write-exclusivity §7.2 + status lifecycle §12 + Safety Invariant 1) — but the GenesisBlock merge ACTIVATES it. Fix = make status a HARD context-assembly filter (quarantine built from Rwang's own status enum).
- [POST] **MERGE VERDICT:** #1 get-right = demux GenesisBlock's overloaded H into three Rwang axes (altitude→D, radius→R, blast-radius→W); never map H→H. #1 avoid = permissive AI-mock write-back reaching the executor context brief unfiltered. Graph substrate (views-as-queries, single-point-of-mutation) is safe to adopt; the write-back is the landmine.
