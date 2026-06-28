// gks/autoloop.mjs — autonomous build->test->benchmark->refine loop (algo--autoloop).
// The "Autonomas" engine. Pluggable hooks keep it standalone + unit-testable; the real wiring
// binds plan->planner-tiering, build->dispatch wave, test->verify-gate-v2, benchmark->goldset,
// judge->LLM-panel, refine->RCA. Governed BY CONSTRUCTION: a costRemaining() guard plus
// round-cap and plateau detection make autonomy safe (vs OpenHands/Devin runaway cost).
// Zero-dependency Node ESM.

export function runAutoLoop(goal, hooks = {}, opts = {}) {
  const { plan, build, test, benchmark, judge, refine } = hooks;
  const { target = 1.0, maxRounds = 10, plateauRounds = 2, costRemaining = () => Infinity } = opts;

  const history = [];
  let spec = goal;
  let best = -Infinity;
  let plateau = 0;

  for (let round = 1; round <= maxRounds; round++) {
    if (costRemaining() <= 0) return finish("cost-cap", round - 1, best, history);

    const planned = plan ? plan(spec, round) : spec;
    const built = build ? build(planned, round) : planned;

    const t = test ? test(built, round) : { ok: true };
    if (!t.ok) {
      history.push({ round, phase: "test", ok: false, score: 0 });
      spec = refine ? refine(spec, { test: t, round }) : spec;
      continue; // failed tests -> refine, don't count as progress
    }

    const score = benchmark ? benchmark(built, round) : 1;
    const verdict = judge ? judge(built, round) : { ok: true };
    history.push({ round, ok: true, score, judge: verdict.ok });

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
