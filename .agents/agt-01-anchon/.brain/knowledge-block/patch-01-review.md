# Knowledge — PATCH-01 review (fable + gpt55, both: apply-with-changes)

Two independent adversarial reviews of `genesisblock_architecture.PATCH-01--unfuse-H-axis.md`.
Verdict both: **apply-with-changes**. Direction (un-fuse) settled 4/4; §F (obligation-ledger) sound.
`[f]`=fable (verified vs live doc), `[g]`=gpt55, `[both]`.

## 🔴 Fatal — the quarantine filter cannot fire `[f]`
Original doc §4.2 (line 107) writes `metadata.status="DRAFT_MOCK"` (screaming-snake); PATCH-01 E1/E2
adds a **second** field `governance.status="DraftMock"` (Pascal) and filters on that. Two fields, two
spellings → **the mock walks straight past the filter; E2 is a no-op as written.** Reconcile to ONE
field / ONE enum / ONE spelling before anything else.

## Required fixes before apply
1. **Status collision (above)** — single status field/enum/spelling. `[f]`
2. **Re-key §4.3 CI linter** — patch deletes `context_scaling_tier` but the doc's §4.3 gate (line 112)
   still keys off it → the doc's *best* mechanism dangles. Re-key structurally ("Feature needs a Contract
   within 1 hop" — needs no H). Rule: an axis rename must sweep **all** consumers, not just the schema. `[f]`
3. **`D0..D5` (6) vs §D table's 7 altitudes** — reproduced the exact `H0-4 vs H0-6` off-by-N it exists to
   fix. Align enum to the altitude count. `[f]`
4. **`W3/W4` undefined + read/write re-coupling** — the "Complexity guard" column holds write-authority
   symbols; §C defines write-authority as *named* levels (observe→…→commit), not W-numbers. Define or
   delete; rename the column; drop `watch degree` (static metric in a runtime table). `[both]`
5. **E2 derivation gaps** — `C2` unmapped; missing/undeclared-C must **fail-closed = strict** (not
   permissive); `"any node on a C3 path"` needs formal semantics (edge type/direction, write-time vs
   query-time). A C3 path depending on a permissive C0/C1 node must **escalate**. `[both]`
6. **Split the DraftMock filter** — unconditional render-filter makes human promotion impossible.
   Need: **visible+labeled in human review views**, **excluded from agent context-assembly and all
   gates**. The patch conflated the human-render path with the agent-context path. `[both]`
7. **Node-C is a category error** — `complexity` is a **task** property (patch's own §A), stored per
   **node** = the same shape as the RCA'd `context_scaling_tier`. Define what node-C means (max C of
   touching tasks? originating task?) and its recompute rule, or move C to the task. `[both]`
8. **Provenance is a real omission (not a defensible drop)** — one-bit `DraftMock` fails: an AI at
   `edit-draft` authority emits plain `Draft` (AI-made, unreviewed, un-mock-labeled) that a C3-strict
   traversal consumes as fact. Add an `origin: human|ai-draft|ai-mock|derived` field, or record an
   explicit defer naming this risk. Provenance had 2–3 triangulation votes. `[both]`
9. **Add a "Deferred axes" note** — Risk/Provenance/Sensitivity/Freshness dropped silently. Sensitivity
   must constrain radius once runtime read-scope exists `[g]`. Meta-irony `[f]`: §F says "carry negative
   decisions" yet the patch drops its own. One paragraph converts 3 of 4 holes into decisions.
10. **Add the 4/4 rule "views submit patches, never direct canonical mutation"** — dropped from patch. `[g]`
11. **Write-authority named but not enforced** — add to schema/enforcement or mark deferred. `[g]`
12. **Obligation-ledger operational gaps** — producer rules; `discharge` is a mutation so it needs a
    minimum write-authority level; `"altitude-band edge"` undefined; scope-intersection is uncomputable
    until the doc's edge-enum vs `uses`/`requires` contradiction (§2.2 vs §3) is fixed. `[both]`
13. **`isolation_level` stored as "DERIVED…"** invites compute-vs-store drift — materialize with a
    recompute trigger or don't store. `[g]`

## Meta / honesty findings `[f]` (against the live doc)
- **§C's claim "C gates the pipeline exactly as the doc already describes" is FALSE** — SPEC-KN-2026-ROOT
  contains **no** C0–C3, no BRD/PRD/SRS pipeline (grep = 0). `C` is **imported** from Rwang/project
  context, not restated. Fine to import; must not claim it's already there.
- **Correction to RCA-20260712-01 framing:** the RCA's "root = phased pipeline gated by C" came from
  **project context (the user's account of original intent)**, not from this doc's text. The doc encodes
  the graph+views+H-ladder; the C-gated authoring pipeline is design intent told to us, not in the file.
  The RCA is accurate about *intent* but should say the doc does not encode it.
- Borderline gold-plating: the 7-field obligation record for a zero-implementation system; the *rule*
  (lossless carry + fail-closed) is settled, the record schema may start minimal. Not a blocker.

## Net
Un-fuse direction is right and §F is sound; but PATCH-01 **reproduced its own defect class twice**
(D-enum off-by-one, W-in-complexity-column) and its headline fix (mock quarantine) **cannot fire as
written**. → needs **rev2** with the 13 fixes. Do not apply as-is.
