# concern — ANCHON

- The GenesisBlock doc is an unconsolidated transcript; do not treat its section numbers as stable
  until it passes a consolidation pass. Re-verify quotes against the live file each session.
- Letter collisions across the two systems: "W" = write-authority (mine) vs fan-out (Rwang);
  "D" = Compaction Depth (Rwang §6), NOT resolution gradient. Guard against silent conflation.
- Anchoring risk: when handed the coordinator's conclusions, keep the `[POST]` discipline so future
  sessions can tell independent convergence from hindsight.
