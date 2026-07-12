# Knowledge — handoff-digest is lossy; needs a lossless obligation ledger (ANCHON, sol loadout)

Adversarial review (gpt-5.6-sol) of the runtime handoff model `{frontier, digest}`. Verdict:
**ADOPT-WITH-FIX** — do not deploy digest-only.

## The flaw
Digest+frontier preserves **structure** (ids+edges survive) but a bounded lossy summary **can
irreversibly drop a normative premise** a later agent must honor — and the later agent never knows it
lost it. Not fixable by "summarize better": no fixed-size lossy summary can guarantee keeping a premise
whose future relevance the summarizer can't foresee.

## 5 silent chain-cut scenarios (all pass happy-path tests)
1. **Multi-tenancy** — `MUST` scope-every-query-by-tenantId → digest keeps "supports multi-tenancy"; class agent writes `findById` without tenantId. **Critical: cross-tenant exposure.**
2. **Delivery semantics** — at-least-once + idempotency key `(event_id, handler_version)` → digest keeps "async via queue"; handler double-charges on retry. **Critical: financial corruption.**
3. **Privacy** — MUST-NOT persist raw PII, jurisdiction-scoped retention → digest keeps "privacy required"; class agent logs full DTO / caches email. **Critical: regulatory breach.**
4. **Negative decision** — mutation only via command boundary, direct repo writes rejected → digest keeps "uses command architecture"; agent calls `save()` directly. **High: governance bypass.**
5. **Units/boundary** — API civil-time+IANA tz, domain UTC instant, reject DST ambiguity → digest keeps "timestamps UTC"; agent guesses DST offset. **High: intermittent billing/schedule errors.**

## The fix — add a lossless channel
```
handoff = { frontier, digest, active_obligations }
```
`active_obligations[]` (lossless), each:
```
{ id, kind: invariant|decision|assumption|open-question,
  modality: MUST|MUST_NOT|SHOULD, exact_statement, applicability_scope,
  source_node_id, source_version_or_hash, depends_on:[id], status: active|discharged|superseded }
```
Rules:
- Carry **losslessly** every obligation whose scope intersects the frontier's descendants.
- Never digest/paraphrase/drop an obligation because it "looks irrelevant."
- **Negative** decisions and **unresolved** assumptions carry the same as positive requirements.
- Discharge only on evidence (discharged/superseded).
- **Fail-closed on overflow**: if the ledger exceeds budget → split task / selective source re-read /
  request more budget. **Never silently compact obligations.**
- `digest` keeps only non-normative narrative/exploration/evidence.

## Rule extension (updates the earlier gradient rule)
Earlier: "content thins with distance, **structure** never." Now: content thins;
**structure AND normative obligations never.** Resolution thinning applies to content, **not** to
normative obligations. Three tiers of carry: FULL-thinnable content · never-thinned structure ·
never-thinned obligation ledger.

## Provenance bindings (added 2026-07-12 — rev4 A5+A6 review found the ledger is itself an unlabeled channel)

The lossless carry set is **three** families, not two: `structure` · `active_obligations` · **`provenance_bindings`**.
A digest is not trustworthy just because obligations+structure survive — a mock's normative claim can ride the
ledger unlabeled (a permissive agent reads a `DraftMock` "MUST use FEFO", records a `MUST`; it forces strict,
strict excludes the mock node, but the obligation persists → poisons strict agents via the most-trusted channel).

**`provenance_bindings[]`** (first-class lossless family; NOT an obligation kind — provenance has no modality
or discharge):
```
{ digest_item_ref,          // OR obligation_ref (mutually exclusive) — what this binds
  obligation_ref,           // binds an obligation record, not only a digest span
  source_node_id,
  source_version_or_hash,
  origin,                   // human | ai-draft | ai-mock | derived
  status }                  // Draft | DraftMock | Candidate | Active | Deprecated
```
Rules:
- **Carry predicate (one, exact):** any digest content sourced from a **non-gate-eligible** node
  (`status ∈ {Draft, DraftMock, Deprecated}`, or `origin ∈ {ai-draft, ai-mock} ∧ status ≠ Active`) must be
  **attributed in-band** to its `source_node_id` **or excluded from the digest entirely** (the fail-closed branch).
  Both mechanisms, not "either/or narrative": the binding travels lossless AND the digest span names its source.
- **Derived content preserves all qualifying upstream bindings** (a `derived` node inherits its sources' labels).
- **Overflow class:** a provenance binding may be dropped **iff** all digest content it binds is dropped with it;
  a label alone is **never** dropped (else the poisoning hole reopens). Bindings may be **deduplicated by source**,
  never discarded. Fail-closed overflow applies to the **combined** set (structure + obligations + provenance).
- **Ledger ingest rule (the killer fix) — recording half:** an obligation whose **source node is
  non-gate-eligible may NOT be recorded as `MUST`/`MUST_NOT`** — at most `kind: assumption`/`open-question`,
  carrying the source's `{origin, status}`.
- **Ledger ingest rule — ingest half (A6′.4b; the fix fable+sol converged on).** Do NOT trust the producer's
  label — it exists only on records the producer already downgraded, so "re-run E2" alone inspects only the
  records that don't need checking; a rogue/buggy `MUST` minted from a mock arrives **label-free** and passes.
  Instead, **at ingestion the receiver live-resolves every active obligation's `source_node_id` (a required
  field on every record) + `source_version_or_hash` against live canon**: any `MUST`/`MUST_NOT` whose source is
  currently **non-gate-eligible OR unresolvable is downgraded in place** to `assumption` carrying live
  `{origin, status}` (**fail-closed**). **Upgrades are never automatic** (`assumption → MUST` only by
  `supersession ≥ edit-draft` after re-reading the source — "discharge only on evidence"). Every obligation must
  have a resolvable binding before it becomes visible; missing/mismatched/ineligible ⇒ quarantine. This
  asymmetry (downgrade auto, upgrade manual) closes both the rogue-producer path and the mirror case (a `MUST`
  legally minted while the source was `Active`, then the source demoted/deprecated → would otherwise ride
  label-free forever).
- **Ingest content re-check (D1):** on ingest the receiver also re-applies E2 to **bound digest content** —
  a strict receiver excludes disallowed in-band-attributed content; gates never consume non-gate-eligible
  bound content. (Obligation half = live-resolve above; this is the content half.)
- **Conflict (D2):** a `MUST` vs `MUST_NOT` obligation on one scope is a **hard stop surfaced to a human**,
  never auto-resolved.
- **Accepted trade-off (not a hole):** a strict agent still *sees* a labeled tentative assumption
  ("assumption(ai-mock/DraftMock): …") and may voluntarily act on it — correct, because a C3 "never assume"
  agent must *see* the open question to gather the real requirement; the claim carries no authority any gate or
  E2 rule honors. Excluding it would recreate the silent chain-cut the ledger exists to prevent.
- **Known residuals (fail-safe / documented):** promotion staleness (a promoted mock's old assumption is
  over-strict/frozen until superseded — fail-safe); digest double-omission by a non-compliant producer
  (undetectable without source re-read — inherent in every rev); derived-node label carrier is
  `digest_item_ref`-keyed only (node-level derived laundering behind a human `commit-canonical` promotion —
  R2/R3, rev5).
- **Edge bindings (rev5.1) — provenance covers relationships, not only content.** `provenance_bindings`
  gains a third ref kind:
  `{ source_kind: "edge", edge_id, from_node_id, to_node_id, relation_type, source_version_or_hash, origin,
  status, binds: digest_item_ref | obligation_ref }`. A digest claim or obligation whose applicability
  depends on a **non-gate-eligible edge** must be attributed in-band to the edge **and** carried in a lossless
  `edge_ref` binding, or excluded — edges otherwise ride the **structure** family, which is lossless but has
  no binding slot (label-strip). **Edge live-resolve at ingest (extends the obligation live-resolve):** resolve
  each `edge_ref` against live canon (identity, endpoints, relation, version, eligibility); unresolvable /
  mismatched / non-gate-eligible ⇒ quarantine the bound relationship content and **downgrade any obligation
  whose applicability depends on that edge to labeled-tentative, fail-closed**; upgrade only by
  `supersession ≥ edit-draft`. A non-gate-eligible edge is a **quarantine boundary** in the strict-path
  closure (rev5.2): it flags the traversal strict and reads its endpoint **metadata-only** (status + obligation
  modality, engine-side) — importing no endpoint content/obligation-body/descendant into the strict set — and
  does not expand the closure/`frontier.descendants`/obligation-applicability through it. **The closure is
  marked `incomplete` at every boundary; an incomplete closure MUST NOT satisfy any closure-dependent
  gate/promotion/deployment** until the edge is promoted or rejected (truncate-and-go-strict alone is
  fail-**open**). **Bounded scan:** cap boundary endpoints; on overflow emit one fail-closed
  `closure incomplete / boundary overflow` (visible halt, not silent balloon).
- **Meta-rule (generalized):** a label that gates trust must live in the lossless-carry set of **every** channel
  it can traverse (digest, structure, obligation ledger, AND edges) — not just the one first noticed.

_Related: [RCA-20260712-01](../rca/RCA-20260712-01.md) (runtime axes) · [axis-triangulation-4way](axis-triangulation-4way.md) · [patch-01-rev4-A5A6-review](patch-01-rev4-A5A6-review.md)._
