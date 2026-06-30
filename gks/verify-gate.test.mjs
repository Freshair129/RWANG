// gks/verify-gate.test.mjs — unit tests for Verify Gate v2 (safety--verify-gate-v2).
// Run: node --test gks/verify-gate.test.mjs

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { classifyVerdict, reviewerTierFor } from "./verify-gate.mjs";

const clean = { verdict: "pass", score: 0.9, issues: [], summary: "ok" };
const critical = {
  verdict: "pass", // model lies: claims pass + high score while listing a critical issue
  score: 0.95,
  issues: [{ severity: "critical", area: "correctness", detail: "fake action", fix: "use real one" }],
  summary: "looks fine",
};

describe("classifyVerdict — PASS decided by issues, not score", () => {
  test("a review with a critical issue → pass:false (even if verdict=pass, score high)", () => {
    const r = classifyVerdict(critical, { workerTier: "local" });
    assert.equal(r.pass, false);
    assert.equal(r.advance, false);
  });

  test("clean review, non-governance → pass:true, advance:true", () => {
    const r = classifyVerdict(clean, { workerTier: "local" });
    assert.equal(r.pass, true);
    assert.equal(r.advance, true);
  });

  test("a low self-reported score with no critical issues still passes", () => {
    const r = classifyVerdict({ verdict: "fail", score: 0.1, issues: [{ severity: "minor", detail: "nit" }] }, {});
    assert.equal(r.pass, true);
    assert.equal(r.advance, true);
  });
});

describe("classifyVerdict — governance", () => {
  test("governance PASS → reviewerTier:'human', advance:false", () => {
    const r = classifyVerdict(clean, { governance: true, workerTier: "local" });
    assert.equal(r.pass, true);
    assert.equal(r.advance, false);
    assert.equal(r.reviewerTier, "human");
  });

  test("governance + critical issue → still pass:false (never reaches human confirm)", () => {
    const r = classifyVerdict(critical, { governance: true });
    assert.equal(r.pass, false);
    assert.equal(r.advance, false);
  });
});

describe("classifyVerdict — reviewer selection", () => {
  test("offline → reviewerTier:'local'", () => {
    const r = classifyVerdict(clean, { offline: true, workerTier: "sonnet" });
    assert.equal(r.reviewerTier, "local");
  });

  test("atCap → reviewerTier:'local'", () => {
    const r = classifyVerdict(clean, { atCap: true, workerTier: "sonnet" });
    assert.equal(r.reviewerTier, "local");
  });

  test("loadoutPinLocal → reviewerTier:'local'", () => {
    const r = classifyVerdict(clean, { loadoutPinLocal: true, workerTier: "sonnet" });
    assert.equal(r.reviewerTier, "local");
  });

  test("default (online, under cap, review enabled) → Claude out-tiers the worker", () => {
    assert.equal(classifyVerdict(clean, { workerTier: "local" }).reviewerTier, "sonnet");
    assert.equal(classifyVerdict(clean, { workerTier: "sonnet" }).reviewerTier, "opus");
    assert.equal(classifyVerdict(clean, { workerTier: "opus" }).reviewerTier, "opus");
  });
});

describe("classifyVerdict — fail-safe", () => {
  test("unparseable verdict (no issues array) → pass:false, advance:false (not auto-pass)", () => {
    const r = classifyVerdict({ verdict: "pass", score: 1 }, {});
    assert.equal(r.pass, false);
    assert.equal(r.advance, false);
  });

  test("null review → pass:false", () => {
    const r = classifyVerdict(null, {});
    assert.equal(r.pass, false);
  });
});

describe("reviewerTierFor — reviewer out-tiers worker", () => {
  test("local → sonnet", () => assert.equal(reviewerTierFor("local"), "sonnet"));
  test("sonnet → opus", () => assert.equal(reviewerTierFor("sonnet"), "opus"));
  test("opus → opus (ceiling)", () => assert.equal(reviewerTierFor("opus"), "opus"));
  test("legacy aliases map onto the ladder", () => {
    assert.equal(reviewerTierFor("ollama"), "sonnet");
    assert.equal(reviewerTierFor("haiku"), "sonnet");
    assert.equal(reviewerTierFor("claude:sonnet"), "opus");
    assert.equal(reviewerTierFor(undefined), "sonnet");
  });
});
