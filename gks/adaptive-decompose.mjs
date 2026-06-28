// gks/adaptive-decompose.mjs — ADaPT as-needed recursive decomposition (algo--adaptive-decompose).
// Break a task down only until the assigned executor (by model capability) can complete it with
// high enough success probability — no finer (over-decomposition has a planning-cost break-even).
// depth = f(complexity / capability), capped by maxDepth. Zero-dependency Node ESM.

/** Crude success-probability model: capability vs complexity, clamped to [0,1]. */
export function successProb(complexity, capability) {
  if (complexity <= 0) return 1;
  return Math.max(0, Math.min(1, capability / complexity));
}

/**
 * Decompose a task as-needed.
 * @param task {{ id, complexity }}
 * @param opts {{ capability, threshold=0.8, maxDepth=4, split }}
 *   split(task) -> child tasks with lower complexity (required for non-leaf work).
 * @returns node { id, complexity, prob, depth, leaf, children[] }
 */
export function decompose(task, opts) {
  const { capability, threshold = 0.8, maxDepth = 4, split } = opts;
  const walk = (t, depth) => {
    const prob = successProb(t.complexity, capability);
    // leaf when the executor can already do it, the depth cap is hit, or no splitter is given
    if (prob >= threshold || depth >= maxDepth || typeof split !== "function") {
      return { id: t.id, complexity: t.complexity, prob, depth, leaf: true, children: [] };
    }
    const kids = split(t) || [];
    if (kids.length === 0) return { id: t.id, complexity: t.complexity, prob, depth, leaf: true, children: [] };
    return { id: t.id, complexity: t.complexity, prob, depth, leaf: false, children: kids.map((k) => walk(k, depth + 1)) };
  };
  return walk(task, 0);
}

/** Flatten a decomposition tree to its executable leaves. */
export function leaves(node, out = []) {
  if (node.leaf) out.push(node);
  else for (const c of node.children) leaves(c, out);
  return out;
}

/** Count total nodes (for measuring over-decomposition). */
export function size(node) {
  return 1 + node.children.reduce((s, c) => s + size(c), 0);
}
