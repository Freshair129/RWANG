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

// ── eval--goldset-harness public contract ─────────────────────────────────────
// A labeled gold-set + scorer that validates BOTH planner tier-assignment and
// Verify-Gate verdicts against ground-truth labels, BEFORE auto-spend is trusted.
// This is the gate on the "full autonomous" switch (autoSpendAllowed).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));

/** Tiny built-in sample so the harness runs out of the box (also mirrors goldset.data.json). */
export const SAMPLE_GOLDSET = [
  { id: "g-subtask",    rung: "subtask",    tier: "H0", issues: [],                          verdict: "pass" },
  { id: "g-task",       rung: "task",       tier: "H1", issues: [{ severity: "minor" }],     verdict: "pass" },
  { id: "g-story",      rung: "story",      tier: "H2", issues: [{ severity: "major" }],     verdict: "rework" },
  { id: "g-epic",       rung: "epic",       tier: "H3", issues: [{ severity: "critical" }],  verdict: "fail" },
  { id: "g-phase",      rung: "phase",      tier: "H4", issues: [],                          verdict: "pass" },
  { id: "g-masterplan", rung: "masterplan", tier: "H5", issues: [{ severity: "critical" }],  verdict: "fail" },
];

/**
 * Load a gold-set of labels. Accepts:
 *   - an in-memory array (returned as-is),
 *   - a path to a JSON file ({ labels: [...] } or a bare [...] array),
 *   - nothing → falls back to goldset.data.json next to this module, else SAMPLE_GOLDSET.
 */
export function loadGoldset(source) {
  if (Array.isArray(source)) return source;
  if (source && typeof source === "object" && Array.isArray(source.labels)) return source.labels;
  if (typeof source === "string") {
    const path = isAbsolute(source) ? source : join(__dir, source);
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? parsed : parsed.labels ?? [];
  }
  const dataFile = join(__dir, "goldset.data.json");
  if (existsSync(dataFile)) {
    try {
      const parsed = JSON.parse(readFileSync(dataFile, "utf8"));
      return Array.isArray(parsed) ? parsed : parsed.labels ?? SAMPLE_GOLDSET;
    } catch { /* fall through to sample */ }
  }
  return SAMPLE_GOLDSET;
}

const get = (o, ...keys) => { for (const k of keys) if (o != null && o[k] != null) return o[k]; return undefined; };

/**
 * Score predictions against ground-truth labels.
 *
 * @param {Array<{tier?:string, verdict?:string}>} predictions  per-item predictions (parallel to labels, or {id} keyed)
 * @param {Array<{tier?:string, verdict?:string}>} [labels]     ground truth; defaults to the loaded gold-set
 * @param {{threshold?:number}} [opts]
 * @returns {{tierAccuracy:number, verdictAccuracy:number, n:number, pass:boolean, threshold:number}}
 */
export function scoreGoldset(predictions, labels, { threshold = 0.8 } = {}) {
  const truth = Array.isArray(labels) ? labels : loadGoldset(labels);
  const preds = Array.isArray(predictions) ? predictions : [];
  const byId = new Map(preds.filter((p) => p && p.id != null).map((p) => [p.id, p]));

  let tierTotal = 0, tierHits = 0, verdictTotal = 0, verdictHits = 0;
  truth.forEach((label, i) => {
    const pred = byId.get(label.id) ?? preds[i] ?? {};
    const expTier = get(label, "tier", "expectedTier");
    if (expTier != null) { tierTotal++; if (get(pred, "tier", "expectedTier") === expTier) tierHits++; }
    const expVerdict = get(label, "verdict", "expectedVerdict");
    if (expVerdict != null) { verdictTotal++; if (get(pred, "verdict", "expectedVerdict") === expVerdict) verdictHits++; }
  });

  const tierAccuracy = tierTotal ? tierHits / tierTotal : 1;
  const verdictAccuracy = verdictTotal ? verdictHits / verdictTotal : 1;
  const pass = tierAccuracy >= threshold && verdictAccuracy >= threshold;
  return { tierAccuracy, verdictAccuracy, n: truth.length, pass, threshold };
}

/**
 * Gate on the "full autonomous" switch: false until the gold-set meets the threshold.
 * Auto-spend stays OFF unless BOTH tier and verdict accuracy clear the bar.
 */
export function autoSpendAllowed(score, { threshold = 0.8 } = {}) {
  if (!score || typeof score !== "object") return false;
  const t = Number(score.tierAccuracy ?? 0);
  const v = Number(score.verdictAccuracy ?? 0);
  return t >= threshold && v >= threshold;
}
