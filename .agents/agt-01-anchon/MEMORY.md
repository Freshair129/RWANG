# MEMORY index — ANCHON (agt-01)

One line per knowledge item. Content lives in `.brain/`; this file is only the map read at boot.

## Knowledge block (vetted)
- [genesisblock-axis-review](.brain/knowledge-block/genesisblock-axis-review.md) — ANCHON's own cold+post review of SPEC-KN-2026-ROOT: single H0–H6 ladder is overloaded → un-fuse; write-back has no trust model (mock → context poisoning); C/D/R/W mapping vs Rwang.
- [axis-triangulation-4way](.brain/knowledge-block/axis-triangulation-4way.md) — 4 independent cold votes (fable-5, gpt-5.5, gpt-5.6-sol, Rwang) agree: split H, quarantine mocks, patch-not-direct-write, H = presets only.
- [handoff-digest-obligation-ledger](.brain/knowledge-block/handoff-digest-obligation-ledger.md) — sol adversarial: `{frontier,digest}` alone silently cuts cross-handoff reasoning (5 scenarios); fix = lossless `active_obligations` ledger + fail-closed overflow. Rule: content thins, structure AND obligations never.
- [patch-01-review](.brain/knowledge-block/patch-01-review.md) — fable+gpt55 both apply-with-changes on PATCH-01 rev1: FATAL status-field/spelling mismatch makes the mock quarantine a no-op; patch reproduces its own defect class twice (D-enum off-by-one, W-in-complexity-column); §C falsely claims C is in the doc; 13 required fixes → rev2.
- [patch-01-rev2-review](.brain/knowledge-block/patch-01-rev2-review.md) — fable+gpt55 apply-with-changes on rev2: N1 E1-diff not apply-safe; N2 quarantine scope; node-C leaks back; write side not swept. Meta-rules: re-translate carried sentences; sweep producers AND consumers. → rev3.
- [patch-01-rev3-review](.brain/knowledge-block/patch-01-rev3-review.md) — fable+gpt55 apply-with-changes near-green on rev3; N1-N8 CLOSED. 7 mandatory (A1-A7). New meta-rule: trust-gating labels must be in the lossless-carry set. → rev4 (A1-A7 folded).
- [patch-01-rev4-A5A6-review](.brain/knowledge-block/patch-01-rev4-A5A6-review.md) — fable+sol both needs-change on rev4 A5+A6 (targeted). Ideas right, letter regressed. **KILLER (both, independent): a mock mints a MUST that rides the lossless obligation ledger unlabeled → survives its own strict-exclusion → poisons strict agents via the most-trusted channel; rev4's meta-rule indicts its own ledger.** A5 narrowing opened 4 write-matrix holes. Fixes: A5-x1 total-function §G; A6-x1/x2/x3 provenance as first-class lossless binding + ledger-ingest re-run E2 + amend the ledger schema. Edge writes ungoverned in all revs (defer rev5). → rev4.1 → targeted A6′.4 check (fable+sol NOT-CLOSED→converged edit A6′.4b: **live-resolve source_node_id at ingest, downgrade fail-closed, upgrade only by supersession**) → **rev4.2 = CONVERGED, both say mock-minted-MUST CLOSED.** Applicable set: rev3 + rev4(A1-A4,A7) + rev4.1 + rev4.2 + amended ledger.
- [patch-01-FINAL-greencheck](.brain/knowledge-block/patch-01-FINAL-greencheck.md) — consolidation → `PATCH-01-FINAL--unfuse-H-axis.md`. fable+sol green-check: **GREEN** after 3 mandatory (D1 ingest content-half, D2 MUST-conflict, M1 either/or→and — all §F consolidation drops) + 4 cosmetic. 0 re-introduced bugs; 12/12 recurrence checks pass. Meta-rule 4th confirm: consolidation must diff restatements clause-by-clause. **Applied + final-verified into the live doc.**
- [patch-01-rev5-review](.brain/knowledge-block/patch-01-rev5-review.md) — rev5 (edge-write + §4 manifest-ingest governance) reviewed (fable REWORK 11 / sol NEEDS-CHANGE 5). Real trust breaks I created: DoS via edge-closure expansion · Draft-edge content injection · manifest git-identity (hunk-authorship not a primitive; promote=push side-effect; replayable; delete-vanished) · edge provenance carrier undefined. **3/11 = recurrences → 5th meta-rule: run recurrence-check on EVERY new rev.** → rev5.1 (all 11 folded; ledger gains `edge_ref` + edge live-resolve). Needs targeted check on R5.2′ quarantine-boundary + R5.4′ record-bound promotion before apply.

## RCA
- [RCA-20260712-01](.brain/rca/RCA-20260712-01.md) — H-axis overload: the `H0–6` "AI context scaling" ladder is a document-authoring altitude ladder reused as a second (runtime) axis under one symbol → un-fuse into Authoring(C,D) + Runtime(Radius/Budget/Resolution/Write-authority); H0–6 kept as preset only.

## Working state
- [goal](.brain/memory/goal.md) · [todo](.brain/memory/todo.md) · [concern](.brain/memory/concern.md)

## Inbound (unvetted — do not treat as fact)
- _(empty)_
