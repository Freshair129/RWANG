// gks/autoloop.mjs — autonomous build->test->benchmark->refine loop (algo--autoloop).
// The "Autonomas" engine. Pluggable hooks keep it standalone + unit-testable; `autonomas()`
// binds the real components: plan->planner-tiering + adaptive-decompose, build->dispatch wave,
// test->verify-gate-v2, benchmark->goldset, and records every round to the traceability graph
// (knowledge adapter) with a per-round checkpoint so a mid-loop crash resumes. Governed BY
// CONSTRUCTION: a costRemaining() guard plus round-cap and plateau detection make autonomy safe.
// Zero-dependency Node ESM.

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function runAutoLoop(goal, hooks = {}, opts = {}) {
  const { plan, build, test, benchmark, judge, refine } = hooks;
  const {
    target = 1.0, maxRounds = 10, plateauRounds = 2,
    costRemaining = () => Infinity, onRound = () => {}, resume = null,
  } = opts;

  const history = resume?.history ? [...resume.history] : [];
  let spec = resume?.spec ?? goal;
  let best = resume?.best ?? -Infinity;
  let plateau = resume?.plateau ?? 0;
  const startRound = resume?.nextRound ?? 1;

  for (let round = startRound; round <= maxRounds; round++) {
    if (costRemaining() <= 0) return finish("cost-cap", round - 1, best, history);

    const planned = plan ? plan(spec, round) : spec;
    const built = build ? build(planned, round) : planned;

    const t = test ? test(built, round) : { ok: true };
    if (!t.ok) {
      const entry = { round, phase: "test", ok: false, score: 0 };
      history.push(entry);
      spec = refine ? refine(spec, { test: t, round }) : spec;
      onRound(entry, { round, best, plateau, spec, history }); // checkpoint a failed round too
      continue; // failed tests -> refine, don't count as progress
    }

    const score = benchmark ? benchmark(built, round) : 1;
    const verdict = judge ? judge(built, round) : { ok: true };
    const entry = { round, ok: true, score, judge: verdict.ok };
    history.push(entry);
    onRound(entry, { round, best, plateau, spec, history });

    if (score >= target && verdict.ok) return finish("target-met", round, score, history);

    if (score > best) { best = score; plateau = 0; } else { plateau++; }
    if (plateau >= plateauRounds) return finish("plateau", round, best, history);

    spec = refine ? refine(spec, { score, verdict, round }) : spec;
  }
  return finish("round-cap", maxRounds, best, history);
}

function finish(stopReason, rounds, score, history) {
  return { done: stopReason === "target-met", stopReason, rounds, score, history };
}

// ── checkpoint / resume ─────────────────────────────────────────────────────
// A mid-loop crash resumes from the last round: state is written to
// <runDir>/autoloop.checkpoint.json after every round.
function ckptPath(runDir) { return join(runDir, "autoloop.checkpoint.json"); }

export function saveCheckpoint(runDir, state) {
  if (!existsSync(runDir)) mkdirSync(runDir, { recursive: true });
  writeFileSync(ckptPath(runDir), JSON.stringify(state, null, 2));
}

export function loadCheckpoint(runDir) {
  try { return JSON.parse(readFileSync(ckptPath(runDir), "utf8")); }
  catch { return null; }
}

function goalId(g) { return typeof g === "string" ? g : (g?.id || "goal"); }
function isCritical(review) {
  return Array.isArray(review?.issues) && review.issues.some((i) => i.severity === "critical");
}

// ── autonomas() — wire the real RWANG components into the loop ────────────────
// deps:
//   assignTier        planner-tiering    (planner.mjs)
//   decompose         adaptive-decompose (gks/adaptive-decompose.mjs)
//   classifyVerdict   verify-gate-v2     (gks/verify-gate.mjs)
//   scoreGoldset      goldset-harness    (gks/goldset.mjs) [autonomy-trust cross-check]
//   dispatchWave      INJECTED engine dispatch: (leaves, round) -> [{leaf, review, ok, prediction?}]
//   store             knowledge adapter  (store/knowledge.mjs) for recordOutcome/linkTrace
//   labels            gold-set labels for the benchmark cross-check
//   executorCapability capability of the build executor (drives adaptive-decompose depth)
//   runDir            where to write the checkpoint (enables crash-resume)
//   gateCtx           { reviewEnabled, atCap, offline, governance, workerTier, ... } for the gate
export function autonomas(goal, deps = {}, opts = {}) {
  const {
    assignTier, decompose, classifyVerdict, scoreGoldset, dispatchWave,
    store = null, labels = [], executorCapability = "frontier", runDir = null, gateCtx = {},
  } = deps;
  const gid = goalId(goal);

  const hooks = {
    plan(spec) {
      const leaves = decompose
        ? decompose(spec, { executorCapability, assignTier })
        : (Array.isArray(spec?.leaves) ? spec.leaves : [spec]);
      return { spec, leaves };
    },
    build(planned, round) {
      const results = dispatchWave
        ? dispatchWave(planned.leaves, round)
        : planned.leaves.map((l) => ({ leaf: l, review: { issues: [] }, ok: true }));
      return { ...planned, results };
    },
    test(planned) {
      const results = planned.results || [];
      const verdicts = results.map((r) =>
        classifyVerdict ? classifyVerdict(r.review, gateCtx) : { pass: r.ok !== false });
      return { ok: verdicts.length > 0 && verdicts.every((v) => v.pass), verdicts };
    },
    benchmark(planned) {
      const results = planned.results || [];
      const passed = results.filter((r) => !isCritical(r.review)).length;
      const quality = results.length ? passed / results.length : 0;
      // gold-set cross-check feeds the autonomy-trust gate; does not replace build quality
      if (scoreGoldset && labels.length) {
        const preds = results.map((r) => r.prediction).filter(Boolean);
        if (preds.length) scoreGoldset(preds, labels);
      }
      return quality;
    },
    refine: (spec) => spec, // hook point for RCA-driven refinement
  };

  const onRound = (entry, st) => {
    const roundId = `${gid}#r${entry.round}`;
    if (store?.recordOutcome) {
      store.recordOutcome({
        id: roundId, status: entry.ok ? "passed" : "needs-rework",
        score: entry.score, round: entry.round, goal: gid,
      });
    }
    if (store?.linkTrace) store.linkTrace(gid, roundId, { rel: "refined_in_round", score: entry.score });
    if (runDir) {
      saveCheckpoint(runDir, {
        goal, spec: st.spec, best: st.best, plateau: st.plateau,
        history: st.history, nextRound: entry.round + 1,
      });
    }
  };

  const resume = runDir ? loadCheckpoint(runDir) : null;
  return runAutoLoop(goal, hooks, { ...opts, onRound, resume });
}
