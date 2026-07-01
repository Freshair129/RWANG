// gks/refine.mjs — RCA-driven refine hook for the autoloop (closes P0 follow-up #3).
//
// The autoloop's `refine(spec, ctx)` runs after a failed/plateau round. This turns the old
// pass-through into an anti-error-loop step: extract WHY the round failed and accumulate it onto the
// spec as `priorIssues`, so the next round carries "what went wrong" (the G1 signal from
// docs/guides/small-model-prompting.md). It complements — does not replace — the engine's
// knowledge-store L1 injection: onRound already records the failed round, and the engine's
// queryPastMistakes injects similar past failures at the next dispatch. This adds an in-loop,
// dispatch-agnostic accumulator + an onFailure hook for logging/telemetry.
// Zero-dependency Node ESM.

// Pull the failure reasons out of a round context. Two shapes:
//   failed-test → ctx.test.verdicts = classifyVerdict outputs ({ pass, reason, ... })
//   plateau     → ctx.verdict (single) + ctx.score
export function extractFailureReasons(ctx = {}, { max = 8 } = {}) {
  const out = [];
  for (const v of ctx.test?.verdicts || []) {
    if (v && v.pass === false && v.reason) out.push(String(v.reason));
  }
  if (ctx.verdict && ctx.verdict.ok === false && ctx.verdict.reason) out.push(String(ctx.verdict.reason));
  if (typeof ctx.score === "number" && ctx.score < 1) {
    out.push(`score ${Number(ctx.score).toFixed(2)} below target (round ${ctx.round ?? "?"})`);
  }
  return [...new Set(out)].slice(0, max);
}

// Build a refine(spec, ctx) that accumulates failure reasons onto spec.priorIssues (capped) and
// fires onFailure(reasons, round) for logging. Primitive specs (a bare goalId string) are returned
// unchanged — we never change the spec's type mid-loop (decompose expects the atom object) — but
// onFailure still fires so the signal isn't lost.
export function makeRcaRefine({ max = 8, onFailure = null } = {}) {
  return function refine(spec, ctx = {}) {
    const reasons = extractFailureReasons(ctx, { max });
    if (reasons.length && onFailure) { try { onFailure(reasons, ctx.round); } catch { /* best-effort */ } }
    if (!reasons.length || !spec || typeof spec !== "object") return spec;
    const priorIssues = [...new Set([...(spec.priorIssues || []), ...reasons])].slice(-max);
    return { ...spec, priorIssues, lastRefinedRound: ctx.round };
  };
}
