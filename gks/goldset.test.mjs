// gks/goldset.test.mjs — acceptance for eval--goldset-harness. Run: node --test gks/goldset.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreTiering, scoreVerdicts, autonomyGate } from "./goldset.mjs";

const RUNG_TIER = { subtask: "H0", task: "H1", story: "H2", epic: "H3", phase: "H4", masterplan: "H5" };
const perfectAssign = (rung) => RUNG_TIER[rung];
const passIfNoCritical = (issues) =>
  issues.some((i) => i.severity === "critical") ? "fail"
  : issues.some((i) => i.severity === "major") ? "rework"
  : "pass";

test("a perfect tier-assigner scores 1.0", () => {
  assert.equal(scoreTiering(perfectAssign).accuracy, 1);
});

test("a degenerate tier-assigner scores low", () => {
  assert.ok(scoreTiering(() => "H0").accuracy < 0.5);
});

test("pass-if-no-critical verdict matches the gold-set", () => {
  assert.equal(scoreVerdicts(passIfNoCritical).accuracy, 1);
});

test("autonomy gate: OFF below threshold, ON when both pass", () => {
  const good = autonomyGate({ tiering: scoreTiering(perfectAssign), verdicts: scoreVerdicts(passIfNoCritical) });
  assert.equal(good.autoSpendEnabled, true);
  const bad = autonomyGate({ tiering: scoreTiering(() => "H0"), verdicts: scoreVerdicts(passIfNoCritical) });
  assert.equal(bad.autoSpendEnabled, false);
});
