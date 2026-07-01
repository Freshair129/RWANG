// gks/autoloop.test.mjs — acceptance for algo--autoloop.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAutoLoop, autonomas, loadCheckpoint } from "./autoloop.mjs";

test("a goal that immediately meets target finishes in 1 round", () => {
  const r = runAutoLoop("g", { benchmark: () => 1.0 }, { target: 1.0 });
  assert.equal(r.done, true);
  assert.equal(r.stopReason, "target-met");
  assert.equal(r.rounds, 1);
});

test("the loop improves over rounds until it hits target", () => {
  let s = 0.5;
  const r = runAutoLoop("g", { benchmark: () => (s += 0.2), refine: (x) => x }, { target: 0.9, maxRounds: 10 });
  assert.equal(r.done, true);
  assert.ok(r.rounds >= 2);
});

test("a plateau (no improvement) stops the loop without runaway", () => {
  const r = runAutoLoop("g", { benchmark: () => 0.5 }, { target: 0.9, plateauRounds: 2, maxRounds: 50 });
  assert.equal(r.done, false);
  assert.equal(r.stopReason, "plateau");
  assert.ok(r.rounds < 50);
});

test("the cost guard stops the loop (governed by construction)", () => {
  let budget = 1;
  const r = runAutoLoop("g", { benchmark: () => 0.1 }, { costRemaining: () => budget--, maxRounds: 100 });
  assert.equal(r.stopReason, "cost-cap");
});

test("a failing test triggers refine instead of counting as success", () => {
  let n = 0;
  const r = runAutoLoop("g", {
    test: () => ({ ok: n++ > 0 }), // round 1 fails, then passes
    benchmark: () => 1.0,
    refine: (x) => x,
  }, { target: 1.0, maxRounds: 5 });
  assert.equal(r.done, true);
  assert.ok(r.rounds >= 2);
});

test("round-cap stops an improving-but-never-target loop", () => {
  let s = 0;
  const r = runAutoLoop("g", { benchmark: () => (s += 0.001) }, { target: 1.0, maxRounds: 3, plateauRounds: 99 });
  assert.equal(r.stopReason, "round-cap");
  assert.equal(r.rounds, 3);
});

// ── autonomas() composer — wires the 5 real components + traceability + resume ──

test("autonomas wires plan/build/test/benchmark, hits target, records each round", () => {
  const calls = { record: 0, link: 0 };
  const store = { recordOutcome: () => calls.record++, linkTrace: () => calls.link++ };
  const r = autonomas({ id: "goal-x" }, {
    decompose: () => [{ id: "L1" }, { id: "L2" }],
    dispatchWave: () => [{ review: { issues: [] } }, { review: { issues: [] } }],
    classifyVerdict: (review) => ({ pass: !(review.issues || []).some((i) => i.severity === "critical") }),
    store,
  }, { target: 1.0, maxRounds: 3 });
  assert.equal(r.done, true);
  assert.equal(r.stopReason, "target-met");
  assert.ok(calls.record >= 1 && calls.link >= 1, "round recorded + trace-linked");
});

test("a critical issue from a leaf fails the gate (no false success)", () => {
  const r = autonomas("goal-y", {
    decompose: () => [{ id: "L1" }],
    dispatchWave: () => [{ review: { issues: [{ severity: "critical" }] } }],
    classifyVerdict: (review) => ({ pass: !(review.issues || []).some((i) => i.severity === "critical") }),
  }, { target: 1.0, maxRounds: 2, plateauRounds: 5 });
  assert.equal(r.done, false);
});

test("a mid-loop crash resumes from the last checkpoint", () => {
  const runDir = mkdtempSync(join(tmpdir(), "autoloop-"));
  const deps = {
    decompose: () => [{ id: "L1" }],
    dispatchWave: () => [{ review: { issues: [] } }],
    classifyVerdict: () => ({ pass: true }),
    runDir,
  };
  // target 2.0 is unreachable (quality maxes at 1.0) -> round-caps with a checkpoint
  const r1 = autonomas("goal-z", deps, { target: 2.0, maxRounds: 1, plateauRounds: 9 });
  assert.equal(r1.stopReason, "round-cap");
  const ck = loadCheckpoint(runDir);
  assert.equal(ck.nextRound, 2, "checkpoint advanced to round 2");
  assert.equal(ck.history.length, 1);
  // resume: same runDir -> continues from round 2, history carried over (no restart)
  const r2 = autonomas("goal-z", deps, { target: 2.0, maxRounds: 3, plateauRounds: 9 });
  assert.ok(r2.history.length >= 2, "resumed past round 1");
  assert.equal(r2.history[0].round, 1);
});
