// gks/refine.test.mjs — RCA refine hook (P0 follow-up #3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFailureReasons, makeRcaRefine } from "./refine.mjs";
import { autonomasAsync } from "./autoloop.mjs";

test("extractFailureReasons pulls reasons from failed-test verdicts (deduped, capped)", () => {
  const ctx = { test: { verdicts: [
    { pass: false, reason: "missing null check" },
    { pass: true, reason: "ok" },
    { pass: false, reason: "missing null check" }, // dup
    { pass: false, reason: "no test" },
  ] }, round: 2 };
  assert.deepEqual(extractFailureReasons(ctx), ["missing null check", "no test"]);
  assert.equal(extractFailureReasons(ctx, { max: 1 }).length, 1);
});

test("extractFailureReasons handles plateau ctx (verdict + low score)", () => {
  const r = extractFailureReasons({ verdict: { ok: false, reason: "flaky" }, score: 0.6, round: 3 });
  assert.ok(r.includes("flaky"));
  assert.ok(r.some((x) => /below target/.test(x)));
});

test("makeRcaRefine accumulates priorIssues on an object spec and fires onFailure", () => {
  const seen = [];
  const refine = makeRcaRefine({ onFailure: (reasons, round) => seen.push({ reasons, round }) });
  const spec = { id: "goal", priorIssues: ["old issue"] };
  const out = refine(spec, { test: { verdicts: [{ pass: false, reason: "new issue" }] }, round: 1 });
  assert.deepEqual(out.priorIssues, ["old issue", "new issue"]);
  assert.equal(out.lastRefinedRound, 1);
  assert.equal(seen[0].reasons[0], "new issue");
  assert.equal(seen[0].round, 1);
});

test("makeRcaRefine leaves a primitive spec unchanged but still surfaces reasons", () => {
  const seen = [];
  const refine = makeRcaRefine({ onFailure: (r) => seen.push(r) });
  const out = refine("goal-id-string", { test: { verdicts: [{ pass: false, reason: "boom" }] }, round: 1 });
  assert.equal(out, "goal-id-string"); // type preserved (decompose expects the atom)
  assert.deepEqual(seen[0], ["boom"]);
});

test("no failure reasons -> spec returned unchanged, onFailure not called", () => {
  let called = false;
  const refine = makeRcaRefine({ onFailure: () => (called = true) });
  const spec = { id: "g" };
  assert.equal(refine(spec, { test: { verdicts: [{ pass: true }] } }), spec);
  assert.equal(called, false);
});

test("autonomasAsync fires the injected refine on failing rounds (anti-error-loop wired)", async () => {
  const fires = [];
  const refine = makeRcaRefine({ onFailure: (reasons, round) => fires.push({ reasons, round }) });
  const res = await autonomasAsync({ id: "goal-f" }, {
    decompose: () => [{ id: "L1" }],
    dispatchWave: async () => [{ review: { issues: [{ severity: "critical" }] } }],
    classifyVerdict: (review) => ({
      pass: !(review.issues || []).some((i) => i.severity === "critical"),
      reason: "critical issue in leaf",
    }),
    refine,
  }, { target: 1.0, maxRounds: 3, plateauRounds: 9 });
  assert.equal(res.done, false);          // never passes (critical every round)
  assert.ok(fires.length >= 1, "refine fired on failed rounds");
  assert.equal(fires[0].reasons[0], "critical issue in leaf");
});
