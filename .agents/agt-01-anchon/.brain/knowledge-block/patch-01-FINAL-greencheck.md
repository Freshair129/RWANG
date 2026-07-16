# Knowledge — PATCH-01-FINAL green-check (fable + sol) → GREEN after 3+4 one-line fixes

Green-check of the **consolidation** (rev3 + rev4[A1-A4,A7] + rev4.1 + rev4.2 + amended ledger → one FINAL).
Consolidation = rewrite = the recurrence risk. Result: **~97% faithful, 0 re-introduced bugs, all 12
recurrence re-checks PASS**; NOT-GREEN only on 2 dropped clauses + 1 ambiguity (all in §F, the "restates
rules" section) + 4 cosmetic. Fixed → **GREEN**.

## sol (§E2/§F/§G scope) — GREEN
Every rule it settled present + correct: strict fail-closed (C2/C3/undeclared/MUST-on-path) · gate-eligibility
excludes Deprecated/Draft/DraftMock + ai-origin-must-be-Active · provenance first-class lossless with
`obligation_ref` · ledger ingest both halves · §G total function. None dropped/weakened.

## fable (whole-doc fidelity vs live doc + .brain history) — found the drops
- **D1** — the **content-half** of the ingest re-check (rev4.1 A6′.4: "receiver re-runs E2; strict excludes
  disallowed bound content; gates never consume non-gate-eligible bound content") was absent from FINAL §F
  AND the ledger file. FINAL carried only the obligation half (live-resolve). → **fixed** (added to FINAL §F
  + ledger).
- **D2** — rev3 §F's "`MUST` vs `MUST_NOT` on one scope = hard stop to a human" absent from both. → **fixed**.
- **M1** — FINAL §F "bound (…), attributed in-band, **or** excluded" parsed as the refuted either/or (A6′.2
  closed it as **both**); FINAL E2 had it right → two strictness levels. → **fixed** ("**and** attributed
  in-band, or excluded").
- Cosmetic M2 "(two pipelines)"→"(per consumer)"; M3 "both §3.2 sites (E6,E7,E10)"→"all three"; M4 §I
  overclaim (digest double-omission is inherent, not human-gated); M5 header credited gpt55 through rev4.1
  (actual rev3). → all fixed.

## 12 recurrence re-checks — ALL PASS (fable, vs FINAL text not the provenance table)
single `metadata.status` field · `D0..D6`=7 · no W in preset · C off nodes · `origin` first-class+write-once
· §G total · live-resolve both halves · comma removed · E9b edge-scan=E4 closure · line-228 swept (verified
exact) · Feature→Genesis · gate-eligibility excludes Deprecated.

## Meta-rule confirmed a 4th time (consolidation step)
Fidelity leaked exactly where a section **restates** rules whose canon lives elsewhere (§F ↔ ledger file).
**A consolidation must diff its restatements clause-by-clause against the superseded letters, not
section-by-section** — the provenance table mapped sections, and both drops were invisible at section
granularity.

## Non-merge residuals for rev5 (recorded, faithful across sources)
§G Deprecated-edit unenumerated (fail-safe) · "agents default to observe" dropped at rev4.1 not the merge ·
"reached Active" (A1) vs "status ≠ Active" (A6′.1) diverge only in the commit-canonical-gated demotion corner.

## Status: GREEN — apply point
With the 3 mandatory + 4 cosmetic fixes applied, FINAL is a faithful consolidation. **Ready to apply into
`genesisblock_architecture.md`.**

## APPLIED + final-verified (fable, 2026-07-12)
PATCH-01-FINAL applied surgically into the live doc (234→320 lines, 13 markers, no stale
`DRAFT_MOCK`/`ai_governance`/normative `context_scaling_tier`). fable final-verify = **APPLY-HAS-ISSUES
(minor, all fixed)**: 13/13 edits + the 3 green-check fixes landed, no safety hole reopened, original
content intact. 3 restatement drops fixed in place: (1) §3.1 strict-filter enumeration omitted `Deprecated`;
(2) §Axes preset dropped H3 "+FULL-contracts" / H4 "+SUMMARY"; (3) §F meta-rule bullet not carried. + 2
cosmetic (header pointer made self-contained; §Axes Resolution parenthetical +provenance).
**Meta-rule confirmed a 5th time — the apply is itself a consolidation** (render patch → new language):
marker presence (13/13) passed while 3 clauses leaked → diff restatements clause-by-clause, not
marker-by-marker. **rev5 backlog gains:** §4 "Sync & Compile" manifest-ingest bots write atoms to the
central store — a write path ungoverned in every rev (next to edge-writes).
**Done: doc is applied, verified, and coherent.**
