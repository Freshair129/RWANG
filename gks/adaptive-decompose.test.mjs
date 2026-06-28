// gks/adaptive-decompose.test.mjs — acceptance for algo--adaptive-decompose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decompose, leaves, successProb } from "./adaptive-decompose.mjs";

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
