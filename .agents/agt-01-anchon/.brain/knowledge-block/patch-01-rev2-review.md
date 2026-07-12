# Knowledge — PATCH-01 rev2 re-review (fable + gpt55, both: apply-with-changes)

Two independent re-reviews of rev2 vs the live doc + rev1 findings. Both: **apply-with-changes, not
green as-is.** Convergence signal: rev1 had *logic* bugs; rev2's are *apply-safety / sweep* — bounded,
and worst-case failure is now **over-quarantine (fail-safe), not poisoning**. `[f]`=fable (vs live doc),
`[g]`=gpt55, `[both]`.

## What rev2 closed clean (verified)
`#3` D0..D6=7 · `#6` split filter · `#9` deferred axes · `#12` obligation ledger ops · `#13` isolation
not stored. Direction (un-fuse) unchanged and sound.

## Must-fix before apply (rev2.1 / rev3)
- **N1 (HIGH, blocks apply) `[both]`** — E1 diff is malformed: it deletes only `ai_governance` and **adds
  a new `metadata{status}` block**, but the live doc already has `metadata.status: [Active,Draft,Deprecated]`
  at line 43. Mechanical apply → **two status blocks = the rev1 fatal resurrected.** Rewrite as an in-place
  edit of line 43's enum (add `Draft`→keep, `+DraftMock, +Candidate`).
- **N2 (HIGH) `[both]`** — quarantine scope contradiction: checklist row 8 says "**strict** excludes ai-*",
  E2 body excludes them **unconditionally**. If unconditional, permissive mode has no consumer and the
  whole C-derived isolation table is decorative on the read path ("solving the landmine by paving the
  garden"). State explicitly: does permissive license mock **consumption** (labeled) or only **generation**?
- **N3 (MED) `[f]`** — "a permissive `C0/C1` **node**" (E2 escalation line) re-attributes C to a node,
  which rev2 abolished. It is rev1-review phrasing transplanted untranslated. Restate in traversal terms
  ("a node vetted only under permissive traversals") or delete (origin+status already covers it).
- **N4 (MED) `[both]`** — "effective C = max(task.C, **C of every strict obligation**)" is uncomputable:
  the obligation record has **no C field** and "strict obligation" is undefined. Fix: obligations carry
  `required_min_C`/`strictness`, OR derive strictness from `task.C` + modality (MUST/MUST_NOT) only.
- **N5 (MED) `[f]`** — E2's strict-closure edge list (`depends_on, implements, contains, requires`) **omits
  `uses`**, though E3 defines `uses` as a runtime dependency and the doc's own example (line 184) hangs
  FEAT→ALGO on `uses`. A `uses`-only node escapes the strict path. Internal E2↔E3 inconsistency.
- **Sweep the write side `[both]` (#10/#11)** — §G states "views submit patches, never direct mutation"
  but no edit touches the doc's actual write paths: §3.2 (line 90 "UPDATE … immediately"), trailing
  write-back (lines 211–218), §4.1 (textbox creates nodes immediately). Post-apply the doc self-contradicts.
  One edit instruction per write path.
- **`Feature` undefined `[both]`** — E4 keys on a `Feature` node type not in the §2.1 enum
  (`Axiom,Ecosystem,Master,Genesis,Contract,Atom`). Key on `Genesis` or define `Feature`.
- **Edge direction `[both]`** — `requires`/`implements` reachability at radius 1 must state direction
  (outgoing/incoming); edges are directional.
- **DraftMock promotion gap `[f]`** — E4 "may not leave Draft" doesn't cover DraftMock→Candidate. Say
  "may not reach Candidate/Active".

## Recommended same-pass
- W4-gate-at-4 vs spaghetti-at->6: degrees 5–6 undefined — are W3/W4 bands or raw degrees? `[f]`
- Add a compact C0–C3 table or a normative Rwang reference (operators can't assign task.C otherwise). `[g]`
- Define `origin: derived`. `[g]`
- Insertion anchors: header claims §3.1/§5 patched but no E-item instructs a concrete edit; the original
  has duplicate "## 3" section numbers — an applier must improvise. Give explicit anchors. `[f]`

## Two meta-rules extracted (carry forward)
1. **Re-translate carried sentences on a model change `[f]`.** rev2 embedded fable's own rev1 phrasing
   ("permissive C0/C1 node") verbatim *after* abolishing node-C → 3rd-generation recurrence of the same
   defect class, new mechanism. When a fix changes the model, every carried-over sentence — including a
   reviewer's own words — must be re-expressed in the new model.
2. **Sweep both consumers AND producers `[f]`.** rev1 taught "an axis rename must sweep all read-side
   consumers"; rev2 taught the dual — "a write-authority rule must sweep all writers (§3.2/§4.1)". An
   invariant patch must enumerate both sites in the target doc.

## Verdict
Both: **apply-with-changes.** Fix N1–N5 + write-side sweep + Feature/edge-direction (all 1–3 sentence
edits, none reverses direction), then apply. Do **not** mechanically apply the E1 diff.
