// gks/goldset.mjs — labeled gold-set + scorer (eval--goldset-harness).
// Validates planner-tiering + Verify-Gate decisions against labels BEFORE auto-spend is
// trusted; gates the "full autonomous" switch (algo--autoloop reads autonomyGate()).
// Zero-dependency Node ESM.

export const DEFAULT_TIER_GOLDSET = [
  { id: "g-subtask", rung: "subtask", expectedTier: "H0" },
  { id: "g-task", rung: "task", expectedTier: "H1" },
  { id: "g-story", rung: "story", expectedTier: "H2" },
  { id: "g-epic", rung: "epic", expectedTier: "H3" },
  { id: "g-phase", rung: "phase", expectedTier: "H4" },
  { id: "g-masterplan", rung: "masterplan", expectedTier: "H5" },
];

// verdict gold-set: "pass" if no critical, "rework" on major, "fail" on critical.
export const DEFAULT_VERDICT_GOLDSET = [
  { id: "v-clean", issues: [], expectedVerdict: "pass" },
  { id: "v-minor", issues: [{ severity: "minor" }], expectedVerdict: "pass" },
  { id: "v-major", issues: [{ severity: "major" }], expectedVerdict: "rework" },
  { id: "v-critical", issues: [{ severity: "critical" }], expectedVerdict: "fail" },
];

/** Score a tier-assignment fn (rung, case) -> tier against a gold-set. */
export function scoreTiering(assignFn, goldset = DEFAULT_TIER_GOLDSET) {
  const results = goldset.map((c) => {
    const got = assignFn(c.rung, c);
    return { id: c.id, expected: c.expectedTier, got, hit: got === c.expectedTier };
  });
  const hits = results.filter((r) => r.hit).length;
  return { accuracy: goldset.length ? hits / goldset.length : 1, hits, total: goldset.length, results };
}

/** Score a verdict fn (issues, case) -> "pass"|"rework"|"fail" against a gold-set. */
export function scoreVerdicts(verdictFn, goldset = DEFAULT_VERDICT_GOLDSET) {
  const results = goldset.map((c) => {
    const got = verdictFn(c.issues, c);
    return { id: c.id, expected: c.expectedVerdict, got, hit: got === c.expectedVerdict };
  });
  const hits = results.filter((r) => r.hit).length;
  return { accuracy: goldset.length ? hits / goldset.length : 1, hits, total: goldset.length, results };
}

/** The autonomy gate: auto-spend stays OFF until BOTH scores meet the threshold. */
export function autonomyGate({ tiering, verdicts } = {}, threshold = 0.9) {
  const t = tiering?.accuracy ?? 0;
  const v = verdicts?.accuracy ?? 0;
  const autoSpendEnabled = t >= threshold && v >= threshold;
  return {
    autoSpendEnabled,
    threshold,
    tieringAccuracy: t,
    verdictsAccuracy: v,
    reason: autoSpendEnabled ? "gold-set passed — auto-spend enabled" : "below threshold — auto-spend disabled",
  };
}
