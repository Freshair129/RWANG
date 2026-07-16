# Knowledge — PATCH-01 rev3 re-review (fable + gpt55, both: apply-with-changes, near-green)

Two independent re-reviews of rev3 vs the live doc. Both: **apply-with-changes**, bounded to a small edit
set; "the rev2 fatal class is gone" (gpt55). Defect severity is **monotonically decreasing** across
generations (rev1 fatal logic → rev2 apply-safety → rev3 coverage residue, mostly fail-safe). `[f]`=fable
(verified vs live doc), `[g]`=gpt55.

## Verified CLOSED in rev3
N1 (E1 in-place edit of live line 43 — apply-safe) · N2 (four-consumer matrix; permissive = labeled
consumption, no gate authority) · N3 (**zero** node-C carried-untranslated sentences — meta-rule 1 held) ·
N4 (`modality` field in the obligation record makes "MUST/MUST_NOT forces strict" computable) · N5 (`uses`
in closure + E3) · Feature→Genesis · edge-direction=outgoing · DraftMock promotion · W bands (match Rwang
AUDIT measured usage) · C table · derived · anchors.

## Mandatory before apply (union of both reviews)
- **A1 gate-eligibility `[g]`** — a `Deprecated` (human) Contract can still satisfy E4. Define gate-eligible
  = `status ∉ {Draft, DraftMock, Deprecated}`; deploy = `Active`; ai-origin must reach `Active`. E4 needs a
  gate-eligible Contract.
- **A2 §3.1 read filter `[g]`** — the render/context path must invoke the E2 strict/permissive/human split
  before concatenation (rev3 left it implied).
- **A3 §3.1 edge scan `[f] M4`** — §3.1 (live line 76) scans only `depends_on`/`contains`; E3 added
  `requires`/`uses` and E4 gates on them → **the gate keys on edges the view pipeline ignores.** Extend the
  scan to the full E2 closure set.
- **A4 third writer `[g]/[f] M1`** — a **third** direct-UPDATE claim at live **line 228** (trailing Source-
  Mapping passage) is outside E7's 211–218 range; sweep it + qualify §3.2's "views reflect immediately" →
  "after canonical promotion".
- **A5 §G split `[f] M2`** — §G "node create/update/delete requires commit-canonical", read literally,
  **outlaws E5 mock-generation and E8 textbox Draft** (the permissive feature just legalized). Split:
  creating `Draft`/`DraftMock` proposals ≥ `propose` (mock-gen ≥ `edit-draft`); **any** promotion to
  `Candidate`/`Active` and any change to an `Active` node ≥ `commit-canonical` (covers human-origin Draft
  self-promotion the ai-only rule missed).
- **A6 provenance lossless `[f] M3` — the one non-fail-safe hole, rev3-introduced** — a labeled mock in a
  permissive traversal: at handoff the mock **content** enters the lossy `digest` but the "(mock,tentative)"
  **label** does not (§F makes only structure+obligations lossless). Agent-2 gets "ALGO uses FEFO" as fact,
  label stripped → strict task poisoned one handoff away. sol's silent-premise-loss **inverted** (silent
  caveat loss). Fix: provenance labels of non-`Active`/ai-origin content ride the **lossless** channel, or
  such content may not enter a digest.
- **A7 E1 comma `[f] M5`** — deleting the `ai_governance` block leaves a dangling comma after `content` →
  invalid JSON. Add "remove the trailing comma".

## Recommended (non-blocking)
Define `Candidate` (R1, fold it — cheap) · record mock-lineage on nodes promoted from mock-including
traversals so the human sees it (R2) · `derived` capped at min status of its sources, enforced in E2 (R3) ·
classify the §4 CI ingest bot under write-authority — git commit = commit-canonical, else ingest=Draft (R4)
· fix §I's misattribution of the duplicated write-back (R5).

## Meta-findings (carry forward)
- **Meta-rule 1 (re-translate carried sentences) HELD** — zero untranslated carries in rev3.
- **Meta-rule 2 (sweep producers AND consumers) recurred twice, milder** — one writer missed (line 228),
  one reader missed (§3.1 edge scan). Recurrence severity ↓ each generation.
- **New meta-rule candidate:** *a labeling regime is only as strong as its weakest lossy channel — any
  label that gates trust must be in the lossless-carry set (structure, obligations, provenance), or it is
  decoration past the first summarization.* (Generalizes A6.)

## Verdict
Both: **apply-with-changes**, converging; rev4 covering A1–A7 (+ define Candidate) should be green.
