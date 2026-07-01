// gks/goldset.test.mjs — acceptance for eval--goldset-harness. Run: node --test gks/goldset.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreTiering, scoreVerdicts, autonomyGate, scoreGoldset, autoSpendAllowed, loadGoldset, SAMPLE_GOLDSET } from "./goldset.mjs";

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

// ── scoreGoldset / autoSpendAllowed contract ─────────────────────────────────
const LABELS = loadGoldset(); // sample gold-set (goldset.data.json), runs out of the box
const predict = (l) => ({ id: l.id, tier: l.tier, verdict: l.verdict }); // ground-truth echo

test("perfect predictions → accuracy 1.0, pass true, autoSpendAllowed true", () => {
  const preds = LABELS.map(predict);
  const score = scoreGoldset(preds, LABELS);
  assert.equal(score.tierAccuracy, 1);
  assert.equal(score.verdictAccuracy, 1);
  assert.equal(score.n, LABELS.length);
  assert.equal(score.pass, true);
  assert.equal(autoSpendAllowed(score), true);
});

test("half-wrong predictions → below threshold, pass false, autoSpendAllowed false", () => {
  // corrupt every other label; assert the gate CLOSES (size-agnostic so the gold-set can grow)
  const preds = LABELS.map((l, i) =>
    i % 2 === 0 ? predict(l) : { id: l.id, tier: "H9-WRONG", verdict: "WRONG" });
  const score = scoreGoldset(preds, LABELS);
  assert.ok(score.verdictAccuracy < 0.8, `verdictAccuracy ${score.verdictAccuracy} should be below threshold`);
  assert.equal(score.pass, false);
  assert.equal(autoSpendAllowed(score), false);
});

test("loadGoldset falls back to a runnable sample", () => {
  assert.ok(Array.isArray(LABELS) && LABELS.length >= 1);
  assert.ok(Array.isArray(SAMPLE_GOLDSET) && SAMPLE_GOLDSET.length >= 1);
});

test("threshold is configurable and gates autoSpendAllowed", () => {
  const score = { tierAccuracy: 0.85, verdictAccuracy: 0.85 };
  assert.equal(autoSpendAllowed(score), true);            // default 0.8
  assert.equal(autoSpendAllowed(score, { threshold: 0.9 }), false);
});

test("in-memory array labels are accepted directly", () => {
  const labels = [{ id: "x", tier: "H0", verdict: "pass" }];
  const score = scoreGoldset([{ id: "x", tier: "H0", verdict: "pass" }], labels);
  assert.equal(score.pass, true);
  assert.equal(score.n, 1);
});
