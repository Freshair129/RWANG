// gks/adaptive-decompose.mjs — ADaPT as-needed recursive decomposition (algo--adaptive-decompose).
//
// Break a task down ONLY until the assigned executor (judged by its model capability) can complete
// it with high-enough success probability — no finer. Over-decomposition has a planning-cost
// break-even, so we stop at the SHALLOWEST sufficient depth, not always-atomic.
//
//   depth = f(estimated complexity / executor capability), capped by maxDepth.
//
// Each leaf carries its OWN MINIMAL context (only what that leaf needs) so a small 8k-context SLM
// can execute it without the whole-task prompt. Zero-dependency Node ESM.
//
// Two call shapes share one core (both are "as-needed decomposition"):
//
//   1. ATOM contract (this task's interface):
//        decompose(atom, { executorCapability, assignTier? }) -> [leafAtom, ...]
//      Returns a FLAT array of LEAF sub-atoms, each { id, type, body, parent, context, est }.
//
//   2. TREE shape (back-compat, used by adaptive-decompose.test.mjs):
//        decompose({ id, complexity }, { capability, threshold?, maxDepth?, split }) -> treeNode
//      Returns the decomposition tree node { id, complexity, prob, depth, leaf, children[] }.
//
// The shape is chosen by opts: `executorCapability` selects the atom contract, `split` (a custom
// child generator) selects the tree shape.

/** Crude success-probability model: capability vs complexity, clamped to [0,1]. */
export function successProb(complexity, capability) {
  if (complexity <= 0) return 1;
  if (capability <= 0) return 0;
  return Math.max(0, Math.min(1, capability / complexity));
}

// ── capability normalization ───────────────────────────────────────────────
// executorCapability may be a 0..1 score or a coarse tier label. Map tiers to a
// complexity budget: a leaf is "doable" when its estimated complexity ≤ that budget.
const TIER_CAPABILITY = {
  "local-4b": 2,
  "local-7b": 3,
  "local-9b": 4,
  "local-12b": 5,
  local: 3,
  cloud: 9,
  frontier: 12,
};

/**
 * Resolve any executorCapability form into a numeric complexity budget (capability).
 * - number in (0,1]  → a fractional capability; scale onto the complexity axis (×12 frontier-equiv).
 * - number > 1       → already a complexity budget; use as-is.
 * - string tier      → looked up in TIER_CAPABILITY (default local-7b-ish).
 */
export function capabilityBudget(executorCapability) {
  if (typeof executorCapability === "number" && Number.isFinite(executorCapability)) {
    if (executorCapability <= 0) return 0;
    return executorCapability <= 1 ? executorCapability * 12 : executorCapability;
  }
  if (typeof executorCapability === "string") {
    const key = executorCapability.toLowerCase();
    return TIER_CAPABILITY[key] ?? 3;
  }
  return 3;
}

// ── complexity estimation for an atom ──────────────────────────────────────
// Use an explicit numeric estimate when the author gave one; otherwise infer a
// coarse complexity from the atom's body size and WBS rung noun.
const RUNG_COMPLEXITY = {
  subtask: 1, atom: 1,
  task: 2, code: 2, config: 2, test: 2, docs: 2, scaffold: 2,
  feature: 4, story: 4,
  epic: 8,
  initiative: 12, capability: 12,
  masterplan: 16, program: 16,
};

/** Estimate an atom's complexity (a positive number on the same axis as capabilityBudget). */
export function estimateComplexity(atom = {}) {
  for (const k of ["complexity", "est", "estimate"]) {
    const v = atom[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  const rung = String(atom.wbs || atom.rung || atom.type || "task").toLowerCase();
  const base = RUNG_COMPLEXITY[rung] ?? 2;
  const body = typeof atom.body === "string" ? atom.body : "";
  // each ~600 chars of body adds a unit of complexity (an 8k-ctx SLM strains past a few hundred tokens)
  const bodyUnits = Math.floor(body.length / 600);
  return base + bodyUnits;
}

// ── minimal per-leaf context ───────────────────────────────────────────────
// A leaf inherits ONLY the context it needs: any author-attached context on the
// child, else a trimmed slice of the parent atom's context/body. Keeps the SLM
// prompt inside an 8k window.
function minimalContext(child, parentAtom) {
  if (child && child.context != null) return child.context;
  const inherited = parentAtom.context;
  if (typeof inherited === "string") return inherited;
  if (inherited != null) return inherited;
  // fall back to a short summary of the parent body so the leaf is self-contained
  const body = typeof parentAtom.body === "string" ? parentAtom.body : "";
  return body ? body.slice(0, 280) : "";
}

// ── default splitter for atoms (when none supplied) ────────────────────────
// Split an atom into N roughly-equal children whose complexity is a fraction of
// the parent's, so each step approaches the executor's budget. Children carry a
// scoped slice of the parent's context.
function defaultAtomSplit(atom, complexity) {
  const fanout = complexity >= 8 ? 3 : 2;
  const childComplexity = Math.max(1, Math.ceil(complexity / fanout));
  const out = [];
  for (let i = 0; i < fanout; i++) {
    out.push({
      id: `${atom.id}.${i + 1}`,
      type: atom.type || "task",
      body: `${atom.body || atom.title || atom.id} — part ${i + 1}/${fanout}`,
      complexity: childComplexity,
      context: minimalContext(null, atom),
    });
  }
  return out;
}

// ── atom contract: decompose(atom, { executorCapability, assignTier? }) -> [leaf] ──
function decomposeAtom(atom, opts) {
  const { executorCapability, threshold = 0.8, maxDepth = 4, split, assignTier } = opts;
  const capability = capabilityBudget(executorCapability);
  const leaves = [];

  const makeLeaf = (a, parent, depth) => ({
    id: a.id,
    type: a.type || atom.type || "task",
    body: a.body != null ? a.body : a.title != null ? a.title : a.id,
    parent,
    context: minimalContext(a, parent ? a : atom),
    est: estimateComplexity(a),
    // diagnostics (extra fields beyond the contract are harmless and aid the planner)
    depth,
    prob: successProb(estimateComplexity(a), capability),
    tier: typeof assignTier === "function" ? assignTier(a) : a.tier,
  });

  const walk = (a, parentAtom, depth) => {
    const complexity = estimateComplexity(a);
    const prob = successProb(complexity, capability);
    // STOP at the shallowest sufficient depth: executor can already do it, or depth cap hit.
    if (prob >= threshold || depth >= maxDepth) {
      leaves.push(makeLeaf(a, parentAtom ? parentAtom.id : (a.parent ?? null), depth));
      return;
    }
    const kids = (typeof split === "function" ? split(a, complexity) : defaultAtomSplit(a, complexity)) || [];
    if (kids.length === 0) {
      leaves.push(makeLeaf(a, parentAtom ? parentAtom.id : (a.parent ?? null), depth));
      return;
    }
    for (const k of kids) walk(k, a, depth + 1);
  };

  walk(atom, null, 0);
  // a task already simple enough returns [atom]: one leaf whose id is the atom's id.
  return leaves;
}

// ── tree shape: decompose({id,complexity}, { capability, split }) -> treeNode ──
function decomposeTree(task, opts) {
  const { capability, threshold = 0.8, maxDepth = 4, split } = opts;
  const walk = (t, depth) => {
    const prob = successProb(t.complexity, capability);
    if (prob >= threshold || depth >= maxDepth || typeof split !== "function") {
      return { id: t.id, complexity: t.complexity, prob, depth, leaf: true, children: [] };
    }
    const kids = split(t) || [];
    if (kids.length === 0) return { id: t.id, complexity: t.complexity, prob, depth, leaf: true, children: [] };
    return { id: t.id, complexity: t.complexity, prob, depth, leaf: false, children: kids.map((k) => walk(k, depth + 1)) };
  };
  return walk(task, 0);
}

/**
 * Decompose a task as-needed. Dispatches on opts shape:
 *   - opts.executorCapability present → ATOM contract, returns [leafAtom, ...]
 *   - else (legacy opts.capability)   → TREE node { ...leaf, children[] }
 */
export function decompose(atom, opts = {}) {
  if (Object.prototype.hasOwnProperty.call(opts, "executorCapability")) {
    return decomposeAtom(atom, opts);
  }
  return decomposeTree(atom, opts);
}

/** Flatten a decomposition TREE node to its executable leaves (tree shape only). */
export function leaves(node, out = []) {
  if (Array.isArray(node)) return node; // already-flat atom-contract result
  if (node.leaf) out.push(node);
  else for (const c of node.children) leaves(c, out);
  return out;
}

/** Count total nodes in a TREE (for measuring over-decomposition). */
export function size(node) {
  if (Array.isArray(node)) return node.length;
  return 1 + node.children.reduce((s, c) => s + size(c), 0);
}
