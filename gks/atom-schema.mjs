// gks/atom-schema.mjs — canonical GenesisAtom schema + validators + projections (atom == entity--atom-schema).
// Single source of truth for: the atom shape, GKS-001/002/003 rules, the engine-backlog projection,
// and the Markdown round-trip. Imported by compile.mjs. Zero-dependency Node ESM.

// Core 5-dimension types (closed) + open extensions — see DESIGN §0.4
export const CORE_TYPES = ["cognitive", "algo", "runbook", "concept", "params"];
export const EXTENSION_TYPES = ["guard", "safety", "stack", "protocol", "mod", "spec", "entity", "adr", "framework", "persona", "feature", "module", "algorithm", "tech_stack", "config", "audit", "eval", "spike"];
export const TIERS = ["H0", "H1", "H2", "H3", "H4", "H5", "H6"];
export const STATUSES = ["todo", "ready", "claimed", "running", "reviewing", "done", "needs-rework", "failed"];

// Genesis atom-type -> engine task.type (a key in config.routing). Override per-atom with `engineType`.
export const TYPE_MAP = {
  module: "architecture", entity: "architecture", concept: "design",
  feature: "code", algo: "code", algorithm: "code", guard: "code", safety: "code", protocol: "code",
  runbook: "docs", audit: "config", params: "config", config: "config",
  tech_stack: "scaffold", eval: "test", spike: "spike",
};
// H-tier (context hops) -> injected context budget (tokens). See DESIGN §0.5.
export const TIER_BUDGET = { H0: 4000, H1: 6000, H2: 8000, H3: 10000, H4: 12000, H5: 16000, H6: 20000 };

const SLUG_RE = /^[a-z][a-z0-9_]*--[a-z0-9][a-z0-9_-]*$/; // canonical slug id (DESIGN §0.2.1)

// ---- per-atom shape validation ----
export function validateAtom(a) {
  const e = [];
  if (!a.id) e.push("missing id");
  else if (!SLUG_RE.test(a.id)) e.push(`id not a canonical slug (type--name): ${a.id}`);
  if (!a.type) e.push(`${a.id}: missing type`);
  if (!a.displayName) e.push(`${a.id}: missing displayName`);
  if (a.tier && !TIERS.includes(a.tier)) e.push(`${a.id}: bad tier ${a.tier}`);
  if (a.status && !STATUSES.includes(a.status)) e.push(`${a.id}: bad status ${a.status}`);
  return e;
}

// ---- set validation: GKS-001 (unique), referential, GKS-002 (acyclic), GKS-003 (>6 hops) ----
export function validateSet(atoms) {
  const errors = [], warnings = [];
  const ids = new Set();
  for (const a of atoms) {
    errors.push(...validateAtom(a));
    if (a.id) { if (ids.has(a.id)) errors.push(`GKS-001 duplicate id: ${a.id}`); else ids.add(a.id); }
  }
  for (const a of atoms) for (const d of a.deps || []) if (!ids.has(d)) errors.push(`unresolved dep: ${a.id} -> ${d}`);
  if (errors.length) return { errors, warnings, topo: [], level: new Map(), waves: [] };

  const byId = new Map(atoms.map((a) => [a.id, a]));
  const radj = new Map(atoms.map((a) => [a.id, []]));
  const ind = new Map(atoms.map((a) => [a.id, 0]));
  for (const a of atoms) for (const d of a.deps || []) { ind.set(a.id, ind.get(a.id) + 1); radj.get(d).push(a.id); }
  const q = atoms.filter((a) => ind.get(a.id) === 0).map((a) => a.id);
  const topo = [];
  while (q.length) { const id = q.shift(); topo.push(id); for (const n of radj.get(id)) { ind.set(n, ind.get(n) - 1); if (ind.get(n) === 0) q.push(n); } }
  if (topo.length !== atoms.length) {
    const stuck = atoms.filter((a) => !topo.includes(a.id)).map((a) => a.id);
    errors.push(`GKS-002 cycle among: ${stuck.join(", ")}`);
    return { errors, warnings, topo: [], level: new Map(), waves: [] };
  }
  const level = new Map();
  const calc = (id) => { if (level.has(id)) return level.get(id); const deps = byId.get(id).deps || []; const L = deps.length ? Math.max(...deps.map(calc)) + 1 : 0; level.set(id, L); return L; };
  for (const a of atoms) calc(a.id);
  for (const a of atoms) if (level.get(a.id) > 6) warnings.push(`GKS-003 COUPLING_RISK_WARN: ${a.id} at depth ${level.get(a.id)} (>6)`);
  const waves = [];
  for (const a of atoms) (waves[level.get(a.id)] ||= []).push(a.id);
  return { errors, warnings, topo, level, waves };
}

// ---- projection: atom -> engine backlog task ----
export function toBacklogTask(a) {
  const type = a.engineType || TYPE_MAP[a.type] || "code";
  const task = {
    id: a.id,
    title: a.displayName + (a.body ? " — " + a.body.split(". ")[0] : ""),
    type, phase: a.phase, deps: a.deps || [], est: a.est ?? 1,
    accept: a.accept || "",
    scope: { budgetTokens: TIER_BUDGET[a.tier] || 8000, needs: a.needs || [], excludes: a.excludes || [] },
  };
  if (a.requiresConfirm) task.requiresConfirm = true;
  if (a.moscow) task.moscow = a.moscow;
  if (a.rice) task.rice = a.rice;
  if (a.state) task.state = a.state; // exists | extend | new (re-grounded against the real codebase)
  return task;
}

// ---- projection: atom -> canonical Markdown (SPEC §1.2 header + spoke frontmatter) ----
export function renderAtomMarkdown(a, block) {
  const TYPE = String(a.type).toUpperCase();
  const links = (a.deps || []).map((d) => `[[${d}]]`).join(", ") || "(none)";
  return [
    `---`, `id: ${a.id}`, `block_id: ${block}`, `context_scaling_tier: ${a.tier}`,
    `role: ${a.role || "coder"}`, `status: ${a.status || "todo"}`, `---`, ``,
    `# ${TYPE}: ${a.displayName} [${a.layer || "L2-Feature"}] ${a.id}`, ``,
    `**Phase:** ${a.phase} · **Tier:** ${a.tier} · **Type:** ${a.type} · **Est:** ${a.est ?? 1}` +
      (a.moscow ? ` · **MoSCoW:** ${a.moscow}` : "") + (a.requiresConfirm ? ` · ⛔ requiresConfirm` : ""), ``,
    `### Description`, a.body || "(tbd)", ``,
    `### Acceptance (DoD)`, a.accept || "(tbd)", ``,
    `### Depends on`, links, ``,
  ].join("\n");
}

// ---- round-trip: parse canonical Markdown back to a (partial) atom — proves Markdown<->object ----
export function parseAtomMarkdown(md) {
  const fm = {};
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (m) for (const line of m[1].split("\n")) { const i = line.indexOf(":"); if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  const h = md.match(/^#\s([A-Z_]+):\s(.+)\s\[(L\d-[^\]]+)\]\s(\S+)\s*$/m);
  return {
    id: fm.id, type: h ? h[1].toLowerCase() : undefined, displayName: h ? h[2] : undefined,
    layer: h ? h[3] : undefined, tier: fm.context_scaling_tier, role: fm.role, status: fm.status,
    block_id: fm.block_id,
  };
}
