// gks/adaptive-decompose.test.mjs — acceptance for algo--adaptive-decompose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decompose, leaves, successProb, estimateComplexity } from "./adaptive-decompose.mjs";

// split a task into two halves of the complexity
const halve = (t) => [
  { id: t.id + ".1", complexity: Math.ceil(t.complexity / 2) },
  { id: t.id + ".2", complexity: Math.floor(t.complexity / 2) },
];

test("a task the executor can already do stays one leaf (no over-decomposition)", () => {
  const tree = decompose({ id: "t", complexity: 2 }, { capability: 10, split: halve });
  assert.equal(tree.leaf, true);
  assert.equal(leaves(tree).length, 1);
});

test("a hard task for a weak executor is decomposed until leaves are doable", () => {
  const tree = decompose({ id: "t", complexity: 16 }, { capability: 2, threshold: 0.8, maxDepth: 6, split: halve });
  assert.equal(tree.leaf, false);
  const ls = leaves(tree);
  assert.ok(ls.length > 1);
  for (const l of ls) assert.ok(successProb(l.complexity, 2) >= 0.8 || l.depth >= 6);
});

test("decomposition never exceeds maxDepth (stop heuristic)", () => {
  const tree = decompose({ id: "t", complexity: 1000 }, { capability: 1, maxDepth: 3, split: halve });
  const maxD = Math.max(...leaves(tree).map((l) => l.depth));
  assert.ok(maxD <= 3);
});

// ── ATOM contract: decompose(atom, { executorCapability, assignTier? }) -> [leafAtom, ...] ──

test("atom contract returns a FLAT array of leaves with the contract shape", () => {
  const out = decompose(
    { id: "A", type: "code", body: "build the thing", complexity: 12 },
    { executorCapability: "local-4b" },
  );
  assert.ok(Array.isArray(out), "returns an array, not a tree");
  for (const l of out) {
    for (const k of ["id", "type", "body", "parent", "context", "est"]) {
      assert.ok(Object.prototype.hasOwnProperty.call(l, k), `leaf is missing '${k}'`);
    }
    assert.notEqual(l.context, undefined, "each leaf carries its own context");
  }
});

test("a too-hard atom for a low-capability executor decomposes into >=2 leaves", () => {
  const out = decompose(
    { id: "A", type: "code", body: "x", complexity: 16 },
    { executorCapability: "local-4b" }, // budget ~2 ⇒ far below complexity 16
  );
  assert.ok(out.length >= 2, `expected >=2 leaves, got ${out.length}`);
});

test("a simple-enough atom returns [atom] (no decomposition)", () => {
  const atom = { id: "A", type: "config", body: "set a flag", complexity: 1 };
  const out = decompose(atom, { executorCapability: "frontier" });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "A", "the single leaf is the atom itself");
});

test("stops at the SHALLOWEST sufficient depth, not always-atomic", () => {
  // capability budget 4 (local-9b); complexity 8 needs exactly ONE split to reach doable (~3-4),
  // it must NOT keep splitting to atomic. So leaves stay at depth 1 and complexity > 1.
  const atom = { id: "A", type: "code", body: "y", complexity: 8 };
  const out = decompose(atom, { executorCapability: "local-9b", maxDepth: 6 });
  assert.ok(out.length >= 2, "a complexity-8 task does get split for a 9b executor");
  const maxDepth = Math.max(...out.map((l) => l.depth));
  assert.ok(maxDepth <= 2, `should stop shallow, got depth ${maxDepth}`);
  // not over-decomposed: at least one leaf is coarser than a complexity-1 atom
  assert.ok(out.some((l) => estimateComplexity(l) > 1), "must not shred to all-atomic");
});

test("each leaf carries its OWN minimal context (8k-SLM goal)", () => {
  const out = decompose(
    { id: "A", type: "code", body: "render the report", complexity: 16, context: "ctx-from-parent" },
    { executorCapability: "local-4b" },
  );
  for (const l of out) {
    assert.equal(typeof l.context, "string");
    assert.ok(l.context.length > 0, "leaf context is non-empty");
  }
});

test("assignTier hook is applied to leaves when provided", () => {
  const out = decompose(
    { id: "A", type: "code", body: "z", complexity: 16 },
    { executorCapability: "local-4b", assignTier: () => "H0" },
  );
  assert.ok(out.every((l) => l.tier === "H0"));
});
