# Knowledge — rev4 A5+A6 targeted re-review (fable + sol, both: needs-change)

Targeted review of **only** rev4 amendments A5 (§G write-authority) and A6 (provenance lossless). Both:
**needs-change** — the *ideas* (A5 split, A6 lossless label, the meta-rule) are right; the *letter*
regressed/underspecified. `[f]`=fable, `[s]`=sol (obligation-ledger designer). Bounded wording deltas,
still converging.

## 🔴 The sharpest residual — BOTH found it independently (high confidence)
**A mock mints a binding MUST that rides the lossless ledger, surviving its own exclusion.** `[f][s]`
A permissive agent reads a `DraftMock` Contract saying "MUST use FEFO" and records a `MUST` obligation —
`source_node_id` but **no source label**. That mock-minted MUST **forces strict isolation** (E2/§F); strict
then **excludes the mock node from context — but the obligation is already in the ledger and obligations are
never dropped.** The mock's normative claim **outlives the mock's own exclusion**, delivered to a strict
agent via the channel it trusts *most*. rev4's own meta-rule ("a label that gates trust must live in the
lossless set") **indicts its own amendment**: the ledger is lossless but carries no source label. A6 only
patched the *digest*, not the *ledger*.

## A5 — split direction right; narrowing rev3's blanket rule opened the complement `[f][s]`
Executability restored (E5 mock-gen now ≥`edit-draft`, E8 textbox ≥`propose`); any-promotion closes
human-origin self-promotion. But replacing rev3's blanket create/update/delete clause left holes:
1. **create-at-status** — a node born `Active`/`Candidate` is neither proposal-create nor promotion → a
   `propose` actor creating `{status:Active}` violates no clause. (rev3 covered it.)
2. **delete vanished** — no clause mentions delete.
3. **Candidate edit after review** — not a promotion, not an Active change → post-review content injection,
   then promoted without re-review.
4. **`origin` tampering** — an `edit-draft` actor can flip `origin: ai-mock → human` on a Draft, laundering
   the trail A1/A6 key on. (rev3's blanket update-rule incidentally blocked this.)

## A6 — closes the 1-hop digest strip; contradicts itself + carrier undefined `[f][s]`
- **Two clauses conflict** `[f]`: clause 1 "label rides lossless, **never** the digest" vs clause 2
  "content may not enter a digest **stripped of its label**" (implies in-band). "equivalently" is false.
  Out-of-band alone = **binding gap** (agent-2 holds "X is mock" but the digest sentence carries no
  attribution to X); in-band alone = **second-hop strip**. Need **both**.
- **Scope conflict** `[f]`: "non-`Active` or ai-origin" vs "non-gate-eligible" — different sets. Pick
  **non-gate-eligible** (the trust boundary).
- **Carrier undefined** `[f][s]`: the canonical obligation record (`handoff-digest-obligation-ledger.md`,
  bound by rev3 §F) has no provenance kind / no source-status field. Provenance must be a **first-class
  lossless family** `provenance_bindings[]` binding `{source_node_id, source_version_or_hash, origin,
  status}` — **the ledger schema must be amended** `[s]`.
- **Ingress rule missing** `[s]`: lossless transport alone doesn't close it — the **receiving task must
  re-run E2** on handoff ingest, and **derived content must preserve qualifying upstream provenance**, else
  mock content is relabeled `derived`/`Active` and reaches a strict gate.
- **Overflow class** `[f]`: a provenance entry may be dropped **iff** all content sourced from that node is
  dropped with it; label alone never dropped (keeps §F fail-closed without over-firing on mock-heavy tasks).

## Consolidated mandatory edits (A5/A6 only)
- **A5-x1** — make §G a **total function** over write ops: create only at `{Draft, DraftMock}` (else
  `commit-canonical`); edit Draft/DraftMock ≥`edit-draft`, Candidate edit ⇒ `commit-canonical` or
  auto-demote to Draft, Active ⇒ `commit-canonical`; delete ≥`commit-canonical` (Draft self-delete
  ≥`edit-draft`); demote/deprecate ⇒ `commit-canonical`; `origin` **write-once** (change ⇒
  `commit-canonical`); obligation discharge **and supersession** ≥`edit-draft`.
- **A6-x1** — one scope (**non-gate-eligible**), both mechanisms (in-band attribution to `source_node_id`
  **or** excluded from digest), defined carrier (`provenance_bindings[]` — amend the ledger schema).
- **A6-x2** — provenance overflow class (label+content dropped together; label alone never).
- **A6-x3 (the killer)** — ledger ingest rule: an obligation whose source is non-gate-eligible **may not be
  recorded as MUST/MUST_NOT** (at most `assumption`/`open-question` carrying source `{origin,status}`);
  **and the receiver re-runs E2 on ingest**; derived preserves upstream provenance.

## Standing (not a regression; defer to rev5+) `[f]`
**Edge writes are ungoverned in every rev** — edges are first-class records (§2.2), so "node update" never
covered them; edge creation alters E2 closure / E4 reachability and can summon the §4.2 mock service.

## Meta
- "Narrowing a blanket rule must re-enumerate the full operation matrix, or the complement of the new
  clauses is a hole." `[f]` (A5 lesson)
- The trust-gating-label meta-rule applies to **every** lossless channel, not just the digest — the
  obligation ledger is one too. `[f][s]`
- Trajectory still converging: fatal→apply-safety→coverage→**wording precision of the trust model**. All
  current residuals are fail-safe or human-gated except the mock-minted-MUST (A6-x3), now identified.

## rev4.1 A6′.4 targeted check (fable + sol, both NOT-CLOSED → one converged edit → CLOSED)
Both independently: the **recording half** of A6′.4 is closed (schema-deterministic — mock forced to
`assumption`, `modality: SHOULD`), but the **ingest half is toothless on the ledger** — the label exists only
on records the producer *already* downgraded, so a rogue/buggy `MUST` from a mock arrives **label-free** and
"re-run E2" passes it ("inspects only the records that don't need checking"). Closable because `source_node_id`
is a **required field on every obligation** + canon is queryable.
- **Converged mandatory edit = A6′.4b (rev4.2):** at ingest, **live-resolve every obligation's `source_node_id`
  against live canon**; `MUST`/`MUST_NOT` from a non-gate-eligible/unresolvable source **downgrades in place,
  fail-closed**; upgrades only by `supersession ≥ edit-draft` after source re-read (downgrade auto, upgrade
  manual). Add `obligation_ref` to `provenance_bindings`.
- Closes the rogue-producer path AND the mirror (a `MUST` minted while source `Active`, source later demoted).
- **Accepted trade-off (not a hole):** a strict agent still *sees* the labeled tentative assumption — correct,
  a C3 "never assume" agent must see the open question to gather the requirement; it carries no gate authority.
- **Meta-rule (final sharpening):** a trust label attached *conditionally on producer compliance* is not in the
  lossless set — it must ride, or be **live-derivable via a required field** (`source_node_id`), on **every**
  record class, especially the non-downgraded ones. "Sweep producers AND consumers" applies to the ledger too.
- **CONVERGENCE / STOP:** with rev4.2, both reviewers say the mock-minted-MUST path is **closed**; all remaining
  residuals are fail-safe / human-gated / documented (promotion staleness, digest double-omission, R2/R3/edge-
  writes). **This is the apply point.**
