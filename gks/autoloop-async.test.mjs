// gks/autoloop-async.test.mjs — the async twin (runAutoLoopAsync / autonomasAsync) must keep the
// SAME governed semantics as the sync loop, while awaiting hooks (so build can be real async dispatch).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAutoLoopAsync, autonomasAsync, loadCheckpoint } from "./autoloop.mjs";

const delay = (v) => new Promise((r) => setTimeout(() => r(v), 1));

test("async: a goal that meets target finishes in 1 round (awaited benchmark)", async () => {
  const r = await runAutoLoopAsync("g", { benchmark: () => delay(1.0) }, { target: 1.0 });
  assert.equal(r.done, true);
  assert.equal(r.stopReason, "target-met");
  assert.equal(r.rounds, 1);
});

test("async: plateau stops without runaway", async () => {
  const r = await runAutoLoopAsync("g", { benchmark: async () => 0.5 }, { target: 0.9, plateauRounds: 2, maxRounds: 50 });
  assert.equal(r.stopReason, "plateau");
  assert.ok(r.rounds < 50);
});

test("async: cost guard stops the loop (awaited costRemaining)", async () => {
  let budget = 1;
  const r = await runAutoLoopAsync("g", { benchmark: async () => 0.1 },
    { costRemaining: async () => budget--, maxRounds: 100 });
  assert.equal(r.stopReason, "cost-cap");
});

test("autonomasAsync wires an ASYNC dispatchWave, hits target, records each round", async () => {
  const calls = { record: 0, link: 0 };
  const store = { recordOutcome: () => calls.record++, linkTrace: () => calls.link++ };
  const r = await autonomasAsync({ id: "goal-x" }, {
    decompose: () => [{ id: "L1" }, { id: "L2" }],
    dispatchWave: async () => delay([{ review: { issues: [] } }, { review: { issues: [] } }]),
    classifyVerdict: (review) => ({ pass: !(review.issues || []).some((i) => i.severity === "critical") }),
    store,
  }, { target: 1.0, maxRounds: 3 });
  assert.equal(r.done, true);
  assert.equal(r.stopReason, "target-met");
  assert.ok(calls.record >= 1 && calls.link >= 1);
});

test("autonomasAsync: a critical issue from a leaf fails the gate", async () => {
  const r = await autonomasAsync("goal-y", {
    decompose: () => [{ id: "L1" }],
    dispatchWave: async () => [{ review: { issues: [{ severity: "critical" }] } }],
    classifyVerdict: (review) => ({ pass: !(review.issues || []).some((i) => i.severity === "critical") }),
  }, { target: 1.0, maxRounds: 2, plateauRounds: 5 });
  assert.equal(r.done, false);
});

test("autonomasAsync: a mid-loop crash resumes from checkpoint", async () => {
  const runDir = mkdtempSync(join(tmpdir(), "autoloop-a-"));
  const deps = {
    decompose: () => [{ id: "L1" }],
    dispatchWave: async () => [{ review: { issues: [] } }],
    classifyVerdict: () => ({ pass: true }),
    runDir,
  };
  const r1 = await autonomasAsync("goal-z", deps, { target: 2.0, maxRounds: 1, plateauRounds: 9 });
  assert.equal(r1.stopReason, "round-cap");
  assert.equal(loadCheckpoint(runDir).nextRound, 2);
  const r2 = await autonomasAsync("goal-z", deps, { target: 2.0, maxRounds: 3, plateauRounds: 9 });
  assert.ok(r2.history.length >= 2, "resumed past round 1");
});
