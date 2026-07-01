// gks/engine-dispatch.test.mjs — engine binding for autonomas' dispatchWave.
import { test } from "node:test";
import assert from "node:assert/strict";
import { statusToReview, engineCostRemaining, makeEngineDispatch } from "./engine-dispatch.mjs";

test("statusToReview maps engine status -> gate review shape", () => {
  assert.deepEqual(statusToReview("done").issues, []);
  assert.equal(statusToReview("done").verdict, "pass");
  assert.equal(statusToReview("needs-rework").issues[0].severity, "critical");
  assert.equal(statusToReview("failed").issues[0].severity, "critical");
  assert.equal(statusToReview("reviewing").issues[0].severity, "major");
});

test("engineCostRemaining = cap - session cost; Infinity when no cap or on error", () => {
  const engine = { snapshot: () => ({ usageLimits: { sessionUsd: 20 }, usage: { session: { cost: 5 } } }) };
  assert.equal(engineCostRemaining(engine), 15);
  assert.equal(engineCostRemaining({ snapshot: () => ({ usageLimits: {}, usage: {} }) }), Infinity);
  assert.equal(engineCostRemaining({ snapshot: () => { throw new Error("boom"); } }), Infinity);
});

function stubEngine(execImpl) {
  const calls = { exec: [], claimed: [] };
  const engine = {
    byId: (id) => ({ L1: { id: "L1", title: "leaf one" }, L2: { id: "L2", title: "no model" } }[id] || null),
    modelFor: (t) => (t.id === "L2" ? null : "claude:sonnet"),
    loadState: () => ({}),
    claim: (id, w) => { calls.claimed.push({ id, w }); return { ok: true }; },
    executeWithReview: async (t, m, w) => { calls.exec.push({ id: t.id, m, w }); return execImpl(t); },
    snapshot: () => ({ usageLimits: { sessionUsd: 20 }, usage: { session: { cost: 0 } } }),
  };
  return { engine, calls };
}

test("makeEngineDispatch dispatches real leaves and skips non-atoms / manual", async () => {
  const { engine, calls } = stubEngine(() => "done");
  const dispatchWave = makeEngineDispatch({ engine, worker: "auto-loop" });
  const res = await dispatchWave([{ id: "L1" }, { id: "L2" }, { id: "ghost" }], 3);
  assert.equal(res.length, 3);
  // L1 = real atom -> dispatched, passed
  assert.equal(res[0].ok, true);
  assert.equal(res[0].status, "done");
  assert.deepEqual(res[0].review.issues, []);
  assert.equal(calls.exec[0].id, "L1");
  assert.equal(calls.exec[0].w, "auto-loop-r3"); // worker carries the round
  // L2 = no model (manual) -> skipped, not dispatched
  assert.equal(res[1].skipped, true);
  // ghost = not a backlog atom -> skipped
  assert.equal(res[2].skipped, true);
  assert.equal(calls.exec.length, 1, "only the real, model-bearing atom was dispatched");
});

test("makeEngineDispatch surfaces a rejected leaf as a failing (critical) review", async () => {
  const { engine } = stubEngine(() => "needs-rework");
  const dispatchWave = makeEngineDispatch({ engine });
  const [r] = await dispatchWave([{ id: "L1" }], 1);
  assert.equal(r.ok, false);
  assert.equal(r.review.issues[0].severity, "critical");
});

test("makeEngineDispatch catches a dispatch throw as a critical issue (never crashes the loop)", async () => {
  const { engine } = stubEngine(() => { throw new Error("provider exploded"); });
  const dispatchWave = makeEngineDispatch({ engine });
  const [r] = await dispatchWave([{ id: "L1" }], 1);
  assert.equal(r.ok, false);
  assert.match(r.review.issues[0].detail, /provider exploded/);
});
