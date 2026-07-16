# Session sess-20260712-01 — fable loadout — GenesisBlock axis review (2-stage)

**Method:** anti-anchoring. Stage 1 cold (only the GenesisBlock doc). Stage 2 reveal (Rwang docs + the
coordinator's lens). Distilled findings promoted to `knowledge-block/genesisblock-axis-review.md`.

## Stage 1 (cold) — headline
- Single H0–H6 ladder conflates retrieval radius, content genre, task type; per-NODE tier = category error.
- Counter-design (independent): Radius (task) · Altitude (node) · Write-authority (separate) · Budget.
- #1 hole: write-back has no trust model; §4.2 permissive mock → context poisoning. Fix = quarantine.
- Caught 3 internal contradictions incl. schema H0–4 vs table H0–6.

## Stage 2 (reveal) — headline
- Convergence audit: cold "un-fuse H" = Rwang RFC 0.6.0. Altitude≈D, Radius≈R (Rwang deferred R).
- Missed cold: Rwang's C is the primary spine.
- Disagreements with coordinator: `default=C-derived` breaks for altitude-H; `H5–6←W` conflates static
  metric with task op; D mislabelled as "resolution gradient" (it is Compaction Depth, SPEC §6).
- Verdict: demux H → D/R/W; quarantine mock; graph substrate safe, write-back is the landmine.

Full transcript: Claude Code sub-agent run, agentId ab47a2919469c7ecd (session e584400f).
