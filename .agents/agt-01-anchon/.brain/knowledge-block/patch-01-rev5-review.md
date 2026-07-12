# Knowledge — rev5 (edge + ingest governance) review (fable REWORK + sol NEEDS-CHANGE) → rev5.1

Both reviewers on rev5 (my first draft of edge-write + §4 manifest-ingest governance). Converged + deep:
sol 5, fable 11 (superset). rev5 was a fresh draft (not a consolidation) and **re-imported 3 already-closed
defect classes** — the process lesson below. `[f]`=fable, `[s]`=sol.

## Real trust breaks I created (not cosmetic)
- **DoS via closure expansion `[s][f]`** — rev5 "E2 traverses ALL edges" let a `propose`/`edit-draft` actor
  add one Draft edge to a big component → recursively enlarge the strict closure / `frontier.descendants` /
  obligation-applicability → exhaust the combined fail-closed budget = **denial channel**; also activates
  unrelated Active-sourced obligations (node live-resolve can't catch — the untrusted edge only supplied the
  *path*). Fix: a non-gate-eligible edge **propagates strictness but is a quarantine BOUNDARY** — no
  recursive expansion through it.
- **Content injection via Draft edge `[f]`** — a Draft edge from the task target to an Active node N pulls
  N's content into strict context (E9 filters by *node* status), with the edge hidden → mock-minted
  relationship materializes as unexplained trusted content. rev5's mitigation was binding-only = the refuted
  **M1 either/or**. Fix: in-band attribution **AND** lossless binding, or exclude.
- **Manifest git-identity breaks `[f][s]`** — (1) "hunk authorship" is **not a git primitive** → collapses to
  commit-author, so AI hunks in a human commit mint `origin: human`, and `origin` is write-once → permanent
  false label; mint path is unsigned/spoofable. (2) Promotion was a **side-effect of the ingest commit** →
  one signed push mints AND promotes (committing ≠ reviewing), making the git path weaker than the E6/E7
  proposal path; the headline invariant ("AI can't inject Active canon") held only for bot commits, not the
  dominant AI-hunks-in-human-commit case. (3) A signed commit is **replayable authority**. (4) Silent on
  manifest **edit/delete of existing Active atoms** (A5 "delete vanished" recurrence).
- **Edge provenance carrier undefined `[f][s]`** — rev5 asserted edges ride `provenance_bindings`, but the
  schema has no edge_ref kind / no two-node source; edges ride the **structure** family which has no binding
  slot → label-strip (A6-x1 recurrence, third family). Live-resolve not extended to edges.

## Recurrences of already-closed classes (the 3)
1. "below Candidate" leaks `Deprecated` into strict render = the §3.1 apply-fix (+Deprecated).
2. `demote` missing from the edge op-matrix = the A5 complement-hole.
3. edge provenance carrier undefined = A6-x1.
Plus contradictions: edge gate-eligible incl. Candidate (R5.1) vs "only Active" (R5.2); "ALL edges" vs the
5-type closure set; undefined `E2` (applied doc uses "§Runtime strict-path"/E9).

## 11 mandatory → all folded into rev5.1
(1) one gate-eligibility def (incl. Candidate; deploy=Active) · (2) "below Candidate"→"Draft/Deprecated" ·
(3) quarantine-boundary + in-band AND binding · (4) "edges of the closure relation-set, any status" ·
(5) add `demote` · (6) missing-status ⇒ Draft + migration sweep · (7) per-atom manifest `origin` decl,
undeclared/unsigned ⇒ ai-draft · (8) promotion explicit/record-bound/atomic, gates every gate-eligible
transition · (9) manifest modify=proposed-patch, delete=proposed-deprecation · (10) `edge_ref` binding kind
in ledger canon **and** §Runtime · (11) edge live-resolve at ingest, downgrade fail-closed.

## Meta-rule (new, confirmed here)
**Run the recurrence-checklist against every NEW rev, not only consolidations.** rev-N+1 fresh drafts
re-import defect classes closed in rev-N letters unless the checklist runs. (fable found 3/11 were
recurrences.) Added to the standing meta-rules (now 5: re-translate carried sentences · sweep producers+
consumers · trust-labels in every lossless channel · diff restatements clause-by-clause · **recurrence-check
every new rev**).

## rev5.1 targeted check (R5.2′+R5.4′) — fable "CLOSED w/3 edits" vs sol "NOT-CLOSED" → rev5.2
Interesting split, both right at different scope:
- **R5.2′ — sol caught a general fail-OPEN fable missed.** fable: the *current* E4 (existential ∃Contract) is
  fail-closed even under truncation; found the E4 restatement dropped R5.1′'s ai-origin-Active clause (an
  ai-draft Candidate edge slips E4 — restatement clause-drop, recurrence). sol: **truncating the closure at a
  Draft boundary is fail-open for any universal-over-closure consumer** — a real dependency beyond the
  boundary escapes. Fix (adopt sol): mark the closure **`incomplete`**; an incomplete closure can't satisfy
  any closure-dependent gate/promotion/deploy. + detection is **metadata-only** (no content import) + bounded
  boundary scan (fail-closed on overflow). + E4 **reference, don't restate** the full predicate (fable).
- **R5.4′ — fable+sol converged.** "authenticated human attestation" was an undefined symbol → define =
  verified human signature over manifest content covering the per-atom origin declarations (accountability,
  not authorship; the only implementable reading — else implementers fall back to commit-author = the rev5
  bug). Promotion = **serializable transaction, full-state CAS** `{draft id+version+pre-status, commit/blob,
  base-graph revision, prospective graph, CI attestation binding {base,prospective,version,run-id}, authz
  epoch}`, consume-once, abort→fresh CI+approval. `pre-status` closes **demote-then-replay** (fable). CI
  attestation binds exact state (sol). Cross-record drift tolerated because gate-eligibility re-derives live.
- **Residual (documented):** a human can falsely attest AI content (attesting ≠ authoring) — undetectable,
  bounded to the Candidate/Active gap, behind commit-canonical.
- **Recurrence-check on rev5.1:** 8/9 pass; 1 re-import = the E4 partial-restatement (restatement clause-drop
  class) → refines meta-rule 4: **"reference, don't restate" any predicate defined once** (inline partial
  restatements = the same defect class as consolidation drops).

## Status
rev5.2 issued (R5.2″ incomplete-closure + metadata-only + bounded scan + E4-by-reference; R5.4″ serializable
full-state CAS + defined attestation); ledger quarantine-boundary rule enhanced. fable says apply-ready after
these; the surface is genuinely at distributed-systems-correctness depth (serializable txn, closure
completeness) — candidate to extract as its own spec (PATCH-02) rather than a PATCH-01 appendix.
