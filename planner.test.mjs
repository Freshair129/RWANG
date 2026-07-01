import { test } from "node:test";
import assert from "node:assert/strict";
import { assignTier, tierTools } from "./planner.mjs";

test("subtask atom → H0", () => {
  assert.equal(assignTier({ type: "subtask" }), "H0");
});

test("a code/task atom → H1", () => {
  assert.equal(assignTier({ type: "code" }), "H1");
});

test("explicit atom.tier overrides the rung heuristic", () => {
  assert.equal(assignTier({ type: "subtask", tier: "H3" }), "H3");
  assert.equal(assignTier({ type: "masterplan", tier: "h0" }), "H0");
});

test("nearCap downgrades one tier", () => {
  assert.equal(assignTier({ type: "feature" }), "H2");
  assert.equal(assignTier({ type: "feature" }, { nearCap: true }), "H1");
});

test("nearCap floors at H0 and does not override explicit tier", () => {
  assert.equal(assignTier({ type: "subtask" }, { nearCap: true }), "H0");
  assert.equal(assignTier({ type: "subtask", tier: "H3" }, { nearCap: true }), "H3");
});

test("H0 forbids glob", () => {
  assert.equal(tierTools("H0").glob, false);
});

test("higher tiers progressively allow more", () => {
  assert.equal(tierTools("H1").glob, true);
  assert.equal(tierTools("H2").multiFile, true);
  assert.equal(tierTools("H3").shell, true);
  assert.equal(tierTools("H0").read, true);
});

test("assignTier always returns a valid H-tier", () => {
  const r = assignTier({ type: "nonsense-rung" });
  assert.ok(["H0", "H1", "H2", "H3", "H4", "H5"].includes(r));
});
