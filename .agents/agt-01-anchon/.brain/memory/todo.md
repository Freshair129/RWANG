# todo — ANCHON

- [x] Spec patch for GenesisBlock → `D:\Codex\local-personal-agent\genesisblock_architecture.PATCH-01--unfuse-H-axis.md`
      (un-fuse H into Authoring[C,D] + Runtime[Radius,Budget,Resolution,Write-authority]; H0-6 = preset;
      isolation_level ← C; + runtime obligation-ledger from the sol adversarial pass).
- [x] Quarantine design folded into PATCH-01 §E2 (DraftMock status + render-pipeline filter; strict ⇐ C3).
- [x] PATCH-01 reviewed (fable+gpt55, both apply-with-changes) → `knowledge-block/patch-01-review.md`.
- [x] rev2 issued + re-reviewed (fable+gpt55, apply-with-changes) → `patch-01-rev2-review.md`.
- [x] PATCH-01 **rev3** issued → `...PATCH-01-rev3--unfuse-H-axis.md` (rev1+rev2 superseded, do not apply).
      Applied the two meta-rules: re-translated all carried sentences (no node-C survives), swept write
      paths (E6 §3.2, E7 trailing write-back, E8 §4.1). N1 apply-safe in-place E1; N2 permissive =
      labeled mock consumption; N4 strict forced by MUST/MUST_NOT; N5 `uses` added.
- [x] rev3 re-reviewed (fable+gpt55, apply-with-changes near-green; N1-N8 closed) → `patch-01-rev3-review.md`.
- [x] rev4 folded to 7 amendments (A1-A7 + define Candidate) → `...PATCH-01-rev4--unfuse-H-axis.md`.
- [x] Targeted re-review rev4 A5+A6 (fable+sol, needs-change) → `patch-01-rev4-A5A6-review.md`. Killer: mock-minted MUST rides the lossless ledger unlabeled.
- [x] rev4.1 issued (A5′ total-function §G; A6′ provenance first-class lossless binding + ledger-ingest re-run E2) → `...PATCH-01-rev4.1--unfuse-H-axis.md`; ledger schema amended (`provenance_bindings` in handoff-digest-obligation-ledger.md).
- [x] Targeted check rev4.1 A6′.4 (fable+sol, NOT-CLOSED→one converged edit A6′.4b→CLOSED). Ledger schema amended (obligation_ref + live-resolve ingest).
- [x] rev4.2 issued (A6′.4b: live-resolve source at ingest, downgrade fail-closed, upgrade only by supersession) → `...PATCH-01-rev4.2--unfuse-H-axis.md`. **CONVERGED — both reviewers say mock-minted-MUST closed; this is the apply point.**
- [x] Consolidated to `PATCH-01-FINAL--unfuse-H-axis.md`; green-check (fable+sol) → GREEN after 3 mandatory (D1 ingest content-half, D2 MUST-conflict, M1 either/or→and) + 4 cosmetic fixes. 12/12 recurrence checks pass. → `patch-01-FINAL-greencheck.md`.
- [x] APPLIED PATCH-01-FINAL into `genesisblock_architecture.md` (E1-E10 + §Axes/§Runtime/§G/§H; 320 lines). FINAL kept as record.
- [x] Final-verified (fable): APPLY-HAS-ISSUES minor → 5 one-line fixes applied (§3.1 +Deprecated, preset H3/H4 resolution halves, §F meta-rule bullet, header self-contained, Resolution +provenance). Doc applied + verified + coherent. **DONE.**
- [x] Superseded revs NOT deleted — **moved to `D:\Codex\local-personal-agent\archive\` + stamped SUSPENDED** (9 files: PATCH-01 rev1-rev4.2, rev5-rev5.2) with an `archive/README.md` lineage. Active in main: applied doc, FINAL (applied-record), SPEC-EDGE-INGEST (candidate/deferred).
- [x] `.agents` cruft resolved (user already removed `agt-registry.md` + `agt-id-ANCHON`). `.agents/` clean: README.md · agt-01-anchon · agt-registry.yaml · .gitignore. **All work closed.**
- [x] rev5 drafted (edge-write + §4 manifest-ingest governance) + reviewed (fable REWORK 11 / sol NEEDS-CHANGE 5) → `patch-01-rev5-review.md`. rev5 re-imported 3 closed defect classes → 5th meta-rule (recurrence-check every new rev).
- [x] rev5.1 issued (all 11 folded: quarantine-boundary closure, in-band+binding, demote, missing-status default, per-atom origin decl, record-bound atomic promotion, manifest edit/delete governed, edge_ref binding, edge live-resolve) → `...PATCH-01-rev5.1--edge-and-ingest-governance.md`; ledger amended (`edge_ref`).
- [x] Targeted check rev5.1 R5.2′+R5.4′ (fable CLOSED-w/3 / sol NOT-CLOSED; reconciled: sol's general fail-open + fable's reference-not-restate). → rev5.2.
- [x] rev5.2 issued (R5.2″ incomplete-closure + metadata-only + bounded scan + E4-by-reference; R5.4″ serializable full-state CAS + defined attestation) → `...PATCH-01-rev5.2--edge-and-ingest-governance.md`; ledger quarantine-boundary rule enhanced.
- [x] CLOSED (not rolled back): edge+ingest arc judged **over-engineering** for a zero-implementation blueprint. `SPEC-EDGE-INGEST-GOVERNANCE.md` (PATCH-02) kept as a **candidate/deferred implementation-time threat-model reference**, stamped CANDIDATE/not-applied/not-green with its 3 open fable findings (M1 restatement, D1 honest-invariant, D2 edge-promotion-checks) documented but **intentionally not fixed** (fixing = continuing the loop). Proportionate blueprint version = ~1 paragraph (edges = node lifecycle; ingest = Draft + human promote). The deep analysis (mock-minted-MUST, DoS, serializable CAS, 6× restatement-recurrence) stays in `.brain` as the reference for if/when it's built.
- [ ] (rev6 backlog) §G Deprecated-edit rationale + `default observe` · node-level derived-label carrier (R3).
- [ ] (rev5 backlog) Govern edge writes (edges are first-class records, ungoverned in all revs).
- [ ] (resolved by review) `default = C-derived`: undefined for C2/altitude-H → rev2 makes isolation a
      derived, fail-closed per-traversal value; no fixed default. Close.
- [ ] Open question to resolve with the coordinator: is `default = C-derived` retained for capability-H
      but replaced for altitude-H? (I argued it breaks for altitude-H.)
