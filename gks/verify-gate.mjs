// gks/verify-gate.mjs — Verify Gate v2 (atom: safety--verify-gate-v2)
//
// Pure-logic decision module for the Verify Gate (ADR-O-001 / SPEC--VERIFY-GATE).
// Decides, from a reviewer verdict, whether worker output PASSES the gate and how
// the task should advance — and which reviewer tier should adjudicate.
//
// Design rule (the reason v2 exists): PASS is decided by the ISSUE LIST, never by a
// model-claimed numeric `score`. A model can emit {"score":0.95} while listing a
// critical issue; trusting the number would let broken work through. So the gate
// looks at `review.issues[*].severity` and ignores `review.score` for the verdict.
//
// Zero dependencies. Node built-ins only.

const TIER_ORDER = ["local", "sonnet", "opus", "human"];

// Reviewer must OUT-TIER the worker (no self-review — SPEC §3.1).
//   local  → sonnet
//   sonnet → opus
//   opus   → opus (ceiling; a human can be pulled in for governance — see classifyVerdict)
// Unknown/aliased worker tiers (haiku, ollama, claude:*) collapse to a sane default.
export function reviewerTierFor(workerTier) {
  switch (normalizeTier(workerTier)) {
    case "local": return "sonnet";
    case "sonnet": return "opus";
    case "opus": return "opus";
    default: return "sonnet";
  }
}

// Map loose/legacy tier names onto the canonical ladder.
function normalizeTier(t) {
  const s = String(t || "").toLowerCase();
  if (s === "local" || s === "ollama" || s === "haiku") return "local";
  if (s.includes("opus")) return "opus";
  if (s.includes("sonnet")) return "sonnet";
  if (TIER_ORDER.includes(s)) return s;
  return "local";
}

// Count of blocking ("critical") issues in a reviewer verdict. Defensive against
// a missing/garbage issues field — anything that isn't a clean array means we
// cannot trust the verdict, which is itself a fail condition handled by the caller.
function criticalIssues(review) {
  const issues = review && Array.isArray(review.issues) ? review.issues : [];
  return issues.filter((i) => i && i.severity === "critical");
}

// classifyVerdict(review, ctx) -> { pass, advance, reviewerTier, reason }
//
//   review : the reviewer's structured verdict (SPEC §3.4) — { verdict, score, issues[], summary }.
//            Only `issues` is trusted for PASS; `verdict`/`score` are advisory.
//   ctx    : { reviewEnabled, atCap, offline, governance, workerTier, loadoutPinLocal }
//
// Returns:
//   pass         : true iff there are NO critical issues (issue-count rule, not score).
//   advance      : true iff the gate may auto-advance the task to `done` right now.
//   reviewerTier : which tier should (have) adjudicate(d): 'local'|'sonnet'|'opus'|'human'.
//   reason       : short human-readable explanation of the decision.
export function classifyVerdict(review, ctx = {}) {
  const {
    reviewEnabled = true,
    atCap = false,
    offline = false,
    governance = false,
    workerTier = "local",
    loadoutPinLocal = false,
  } = ctx;

  // --- Reviewer selection -------------------------------------------------
  // Claude (the out-tier model) is the DEFAULT reviewer. Route to the local
  // SLM/LLM-as-judge only when we cannot or must not reach Claude:
  //   offline, at the cost cap, or the loadout explicitly pins local.
  const claudeReviewer = reviewEnabled && !atCap && !offline;
  const forceLocal = offline || atCap || loadoutPinLocal;
  const reviewerTier = (!claudeReviewer || forceLocal)
    ? "local"
    : reviewerTierFor(workerTier);

  // --- PASS decision: issue list, never the score -------------------------
  const crit = criticalIssues(review);
  const hasReview = !!review && Array.isArray(review.issues);

  if (!hasReview) {
    // Fail-safe (SPEC §6): unparseable / missing verdict is NOT an auto-pass.
    return {
      pass: false,
      advance: false,
      reviewerTier,
      reason: "no parseable reviewer verdict (issues missing) — fail-safe, not auto-pass",
    };
  }

  if (crit.length > 0) {
    return {
      pass: false,
      advance: false,
      reviewerTier,
      reason: `${crit.length} critical issue(s) — needs-rework`,
    };
  }

  // No critical issues → PASS (regardless of any self-reported score).
  // Governance tasks (deploy/merge/irreversible) never auto-advance: a PASS
  // routes to a human confirm instead of going straight to `done`.
  if (governance) {
    return {
      pass: true,
      advance: false,
      reviewerTier: "human",
      reason: "pass (no critical issues) but governance task — human confirm required, no auto-done",
    };
  }

  return {
    pass: true,
    advance: true,
    reviewerTier,
    reason: "pass (no critical issues) — auto-advance",
  };
}
