// gks/autoloop.test.mjs — acceptance for algo--autoloop.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runAutoLoop } from "./autoloop.mjs";

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
