// store/knowledge.mjs — Rwang's binding to the GenesisBlockDB knowledge store.
//
// WHAT THIS IS
//   The Rwang-side half of `config.store.genesisdb`: it opens the external, embedded
//   GenesisBlockDB native engine (a NAPI graph+vector store) and turns free TEXT into
//   the `sim` signal the runner needs — by embedding the text with bge-m3 through
//   Ollama and running the engine's `hybridSearch`. GenesisBlockDB does NOT embed text
//   (it takes a pre-computed queryVector); the embedding is the model call, and per the
//   Rwang architecture the model call lives HERE in the JS runner, never in the Python
//   core (CLAUDE.md). This is the missing binding RFC--RESOLUTION-GRADIENT §D7 named as
//   the one hard dependency of the resolution gradient's `sim` term.
//
// CONTRACT (what its importers rely on)
//   engine.mjs      : getStore(CONFIG).{ recordOutcome, queryContext, groundContext }
//   orchestrator.mjs: writeNode(CONFIG, node), writeEdge(CONFIG, edge)
//   server.mjs      : writeNode, writeEdge, queryNodes(CONFIG, body)
//   run.js (Phase 1): the `query` CLI below -> [{id, sim, ...}] candidates for the
//                     resolution-gradient context brief.
//
// GRACEFUL DEGRADATION (RFC D7)
//   If store.knowledge !== "genesisdb", the native binary can't load, or the DB can't
//   open, every method degrades to a NO-OP (queryContext -> [], groundContext -> null,
//   searchSim -> []). Callers already treat the store as best-effort, so a missing store
//   never breaks execution — it just drops the run to hop-only scoring.
//
// CLI (mirrors how run.js shells out to the Python core)
//   node store/knowledge.mjs ingest [--atoms DIR] [--limit N] [--dry-run] [--force]
//       populate the store; idempotent via a content-hash manifest (unchanged atoms skip)
//   node store/knowledge.mjs query "<text>" [--k 12] [--alpha 0.5] [--json]
//   node store/knowledge.mjs embed "<text>"          # prints the vector dim (debug)
//   node store/knowledge.mjs status                  # open + statusSync
//   node store/knowledge.mjs smoke                    # self-contained round-trip test

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";
import { mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(HERE); // store/ -> G:/Rwang

// ---------------------------------------------------------------- config + native load

function loadConfig() {
  const p = join(REPO_ROOT, "config.json");
  return JSON.parse(readFileSync(p, "utf-8"));
}

function gks(CONFIG) {
  const store = (CONFIG && CONFIG.store) || {};
  return { kind: store.knowledge, cfg: store.genesisdb || {} };
}

// One native module + one open DB per resolved path (opening twice would double-lock).
let _native = null;
const _dbs = new Map(); // resolvedPath -> GenesisDatabase instance

function nativeModule(bindingPath) {
  if (_native) return _native;
  _native = require(bindingPath);
  return _native;
}

function resolveDbPath(cfg) {
  const p = cfg.path && cfg.path.trim();
  if (p) return isAbsolute(p) ? p : join(REPO_ROOT, p);
  return join(REPO_ROOT, ".knowledge"); // config path "" -> persistent default under the repo
}

// Returns the opened DB or null (degraded). NEVER throws — callers are best-effort.
function openDb(CONFIG) {
  const { kind, cfg } = gks(CONFIG);
  if (kind !== "genesisdb") return null;
  const bindingPath = cfg.bindingPath;
  if (!bindingPath || !existsSync(bindingPath)) return null;
  const dbPath = resolveDbPath(cfg);
  if (_dbs.has(dbPath)) return _dbs.get(dbPath);
  try {
    const { GenesisDatabase } = nativeModule(bindingPath);
    if (!existsSync(dbPath)) mkdirSync(dbPath, { recursive: true });
    const db = GenesisDatabase.open({ path: dbPath, vectorDim: cfg.vectorDim || 1024 });
    _dbs.set(dbPath, db);
    return db;
  } catch (e) {
    if (process.env.RWANG_STORE_DEBUG) console.error("[store] open failed:", e.message);
    _dbs.set(dbPath, null); // cache the failure so we don't retry-open every call
    return null;
  }
}

// ---------------------------------------------------------------- embeddings (the model call)

// L2-normalize so the default collection's L2 metric yields COSINE similarity. bge-m3
// via Ollama returns UNnormalized vectors (norm > 1); without this the hybridSearch
// score is a raw L2 distance (large negatives) instead of a [-1,1] cosine, and every
// `sim` would clamp to 0 — i.e. the store would silently behave like hop-only.
function l2normalize(v) {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return v.map((x) => x / n);
}

// Embed `text` with bge-m3 via Ollama. Returns an L2-normalized vector of length
// vectorDim, or null. Normalizing at this single point keeps store + query consistent.
export async function embed(CONFIG, text) {
  const { cfg } = gks(CONFIG);
  const host = cfg.ollamaHost || "http://127.0.0.1:11434";
  const model = cfg.embedModel || "bge-m3:latest";
  try {
    const r = await fetch(`${host}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt: String(text || "") }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const v = j.embedding || (Array.isArray(j.embeddings) ? j.embeddings[0] : null);
    if (!Array.isArray(v) || v.length === 0) return null;
    const want = cfg.vectorDim || 1024;
    if (v.length !== want && process.env.RWANG_STORE_DEBUG) {
      console.error(`[store] embed dim ${v.length} != vectorDim ${want}`);
    }
    return l2normalize(v);
  } catch (e) {
    if (process.env.RWANG_STORE_DEBUG) console.error("[store] embed failed:", e.message);
    return null;
  }
}

// A NeighborOutput.score is the blended relevance similarity*(1-alpha)+impact*alpha.
// Clamp it to [0,1] so it is safe to use directly as the RFC's `sim` term.
function asSim(score) {
  if (typeof score !== "number" || Number.isNaN(score)) return 0.0;
  return score < 0 ? 0.0 : score > 1 ? 1.0 : score;
}

function taskText(t) {
  if (typeof t === "string") return t;
  const parts = [t.title || t.id || "", t.type || "", t.description || t.desc || ""];
  return parts.filter(Boolean).join(" ").trim();
}

// ---------------------------------------------------------------- sim search (the point)

// searchSim: embed `text`, hybridSearch, and return ranked candidates carrying `sim`.
// This is what the resolution-gradient context brief consumes (id + sim per atom).
export async function searchSim(CONFIG, text, opts = {}) {
  const db = openDb(CONFIG);
  if (!db) return [];
  const { cfg } = gks(CONFIG);
  const qv = await embed(CONFIG, text);
  if (!qv) return [];
  const k = opts.k || 12;
  // RFC D2's `sim` is semantic similarity -> default to pure cosine (alpha 0). Callers
  // that want the FLIGHT §5.5 impact-blended relevance (alpha 0.5) pass it explicitly.
  const alpha = opts.alpha != null ? opts.alpha : (cfg.alpha != null ? cfg.alpha : 0.0);
  try {
    const args = { queryVector: qv, k, alpha };
    if (opts.collection) args.collection = opts.collection;
    const hits = await db.hybridSearch(args);
    return (hits || []).map((h) => ({
      id: h.node.id,
      sim: asSim(h.score),
      score: h.score,
      labels: h.node.labels || [],
      props: h.node.props || {},
    }));
  } catch (e) {
    if (process.env.RWANG_STORE_DEBUG) console.error("[store] hybridSearch failed:", e.message);
    return [];
  }
}

// ---------------------------------------------------------------- module-level graph writes

// writeNode/writeEdge/queryNodes back orchestrator.mjs + server.mjs. They auto-embed a
// node's text when no vector is supplied, so written knowledge is searchable by `sim`.
export async function writeNode(CONFIG, node) {
  const db = openDb(CONFIG);
  if (!db) throw new Error("knowledge store unavailable (store.knowledge != genesisdb or DB not open)");
  const args = { ...node };
  args.labels = args.labels || [];
  if (!args.embedding) {
    const text = node.text || (node.props && (node.props.summary || node.props.title)) || node.id;
    const v = await embed(CONFIG, text);
    if (v) args.embedding = v;
  }
  return db.addNode(args);
}

export async function writeEdge(CONFIG, edge) {
  const db = openDb(CONFIG);
  if (!db) throw new Error("knowledge store unavailable");
  return db.addEdge(edge);
}

// queryNodes: flexible read for the HTTP layer. Dispatches on the body shape.
export async function queryNodes(CONFIG, body = {}) {
  const db = openDb(CONFIG);
  if (!db) throw new Error("knowledge store unavailable");
  if (body.text) return searchSim(CONFIG, body.text, body);
  if (Array.isArray(body.queryVector)) {
    return db.hybridSearch({ queryVector: body.queryVector, k: body.k || 12, alpha: body.alpha ?? 0.5 });
  }
  if (body.seed) return db.neighbors(body.seed, body);
  if (body.hql) return db.executeHql(body.hql);
  throw new Error("queryNodes: body needs one of text | queryVector | seed | hql");
}

// ---------------------------------------------------------------- getStore facade (engine.mjs)

// getStore returns SYNCHRONOUSLY (engine calls getStore(CONFIG).method(...) inline). The
// DB opens lazily inside each async method; every method is best-effort and swallows.
export function getStore(CONFIG) {
  return {
    // L0: append an outcome node, embedded so future queryContext can retrieve it.
    async recordOutcome(o) {
      const db = openDb(CONFIG);
      if (!db) return null;
      const text = [o.taskTitle || o.taskId, o.summary,
        (o.issues || []).map((i) => `${i.area || ""} ${i.detail || ""}`).join(" ")]
        .filter(Boolean).join(" — ");
      const v = await embed(CONFIG, text);
      const node = {
        id: `outcome:${o.taskId}:${o.at || ""}`,
        labels: ["Outcome", o.status || "unknown"],
        props: o,
      };
      if (v) node.embedding = v;
      try { return await db.addNode(node); }
      catch (e) { if (process.env.RWANG_STORE_DEBUG) console.error("[store] recordOutcome:", e.message); return null; }
    },
    // L1: past mistakes similar to this task.
    async queryContext(t, opts = {}) {
      return searchSim(CONFIG, taskText(t), { k: opts.k || 3, alpha: opts.alpha ?? 0.0 });
    },
    // L2: grounded context for this task (FLIGHT §5.5 Probe = hybridSearch).
    async groundContext(t, opts = {}) {
      const hits = await searchSim(CONFIG, taskText(t), { k: opts.k || 3, alpha: opts.alpha ?? 0.5 });
      if (!hits.length) return null;
      return { nodes: hits, reasoningPath: "hybridSearch", budget: opts.budget || null };
    },
  };
}

// ---------------------------------------------------------------- CLI

async function cliQuery(argv) {
  const text = argv[0];
  if (!text) { console.error("usage: knowledge.mjs query \"<text>\" [--k N] [--alpha A] [--json] [--out FILE]"); return 2; }
  let k = 12, alpha = null, jsonOnly = false, out = null;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--k") k = parseInt(argv[++i], 10);
    else if (argv[i] === "--alpha") alpha = parseFloat(argv[++i]);
    else if (argv[i] === "--json") jsonOnly = true;
    else if (argv[i] === "--out") out = argv[++i];
  }
  const CONFIG = loadConfig();
  const opts = { k }; if (alpha != null) opts.alpha = alpha;
  const hits = await searchSim(CONFIG, text, opts);
  const payload = JSON.stringify(hits, null, jsonOnly ? 0 : 2) + "\n";
  // --out writes a CLEAN JSON file: the native engine prints a "Gossip: ..." line to
  // stdout on open, so piping stdout is unsafe for machine consumers — write a file.
  if (out) { writeFileSync(out, payload); process.stderr.write(`wrote ${hits.length} hit(s) -> ${out}\n`); }
  else process.stdout.write(payload);
  if (!jsonOnly || out) {
    process.stderr.write(hits.length
      ? `${hits.length} hit(s):\n` + hits.map((h) => `  sim ${h.sim.toFixed(4)}  ${h.id}`).join("\n") + "\n"
      : "no hits — store empty or degraded (hop-only fallback applies).\n");
  }
  return 0;
}

async function cliEmbed(argv) {
  const v = await embed(loadConfig(), argv[0] || "");
  process.stderr.write(v ? `embedding dim ${v.length}; first3 ${JSON.stringify(v.slice(0, 3))}\n`
                          : "embed failed (Ollama down or model missing)\n");
  return v ? 0 : 1;
}

async function cliStatus() {
  const CONFIG = loadConfig();
  const db = openDb(CONFIG);
  if (!db) { process.stderr.write("store DEGRADED — no DB (check store.knowledge / bindingPath / open)\n"); return 1; }
  const st = db.statusSync();
  const cols = db.listCollections();
  process.stderr.write(`store OK  open=${st.open} readOnly=${st.readOnly}  collections=${cols.length}\n`);
  process.stdout.write(JSON.stringify({ status: st, collections: cols }, null, 2) + "\n");
  return 0;
}

// smoke: a self-contained round trip proving embed + store + search all work end-to-end.
async function cliSmoke() {
  const CONFIG = loadConfig();
  const { cfg } = gks(CONFIG);
  const bindingPath = cfg.bindingPath;
  if (!bindingPath || !existsSync(bindingPath)) { process.stderr.write("smoke: native binding missing\n"); return 1; }
  const { GenesisDatabase } = nativeModule(bindingPath);
  const dim = cfg.vectorDim || 1024;
  const dir = mkdtempSync(join(tmpdir(), "rwang-store-smoke-"));
  try {
    const db = GenesisDatabase.open({ path: dir, vectorDim: dim });
    const docs = {
      "doc:tropical": "banana mango pineapple tropical fruit",
      "doc:temperate": "apple pear cherry orchard fruit",
      "doc:rust": "rust borrow checker lifetime compile error",
    };
    for (const [id, text] of Object.entries(docs)) {
      const v = await embed(CONFIG, text);
      if (!v) { process.stderr.write("smoke: embed failed (Ollama/bge-m3 down)\n"); return 1; }
      await db.addNode({ id, labels: ["Doc"], embedding: v });
    }
    await db.flushIndex();
    const qv = await embed(CONFIG, "sweet tropical fruit like mango");
    const hits = await db.hybridSearch({ queryVector: qv, k: 3, alpha: 0.0 });
    const ranked = (hits || []).map((h) => `${h.node.id}(${asSim(h.score).toFixed(3)})`);
    const top = hits && hits[0] && hits[0].node.id;
    const ok = hits && hits.length >= 2 && top !== "doc:rust";
    process.stderr.write(`smoke: ranked ${ranked.join(" > ")}\n`);
    process.stderr.write(ok ? "smoke PASS — embed + store + hybridSearch round-trip works.\n"
                            : "smoke FAIL — unexpected ranking.\n");
    return ok ? 0 : 1;
  } catch (e) {
    process.stderr.write(`smoke FAIL — ${e.message}\n`);
    return 1;
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp cleanup best-effort */ }
  }
}

// ---------------------------------------------------------------- atom ingestion

const ATOM_DIR_DEFAULTS = ["D:/rwang/RWANG/gks/atoms", join(REPO_ROOT, "gks", "atoms")];

function resolveAtomDir(CONFIG, flagDir) {
  const { cfg } = gks(CONFIG);
  const cands = [flagDir, cfg.atomsDir, ...ATOM_DIR_DEFAULTS].filter(Boolean);
  return cands.find((d) => existsSync(d)) || null;
}

// Parse one atom .md into {id, type, text, title, props, deps[]}. Mirrors hop_metrics.py's
// read_atoms: id = filename stem, deps = `[[...]]` under a `### Depends on` section.
function parseAtom(path, fname) {
  const raw = readFileSync(path, "utf-8");
  const id = fname.replace(/\.md$/, "");
  const type = id.includes("--") ? id.split("--")[0] : "atom";
  const body = raw.replace(/^﻿?---\n[\s\S]*?\n---\n/, "");     // strip frontmatter for embedding
  const fm = (raw.match(/^﻿?---\n([\s\S]*?)\n---/) || [])[1] || "";
  const fmGet = (k) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, "m")) || [])[1]?.trim();
  const title = (body.match(/^#\s+(.+)$/m) || [])[1]?.trim() || id;
  const depBlock = (body.match(/###\s*Depends on\s*\n([\s\S]*?)(?:\n#|$)/) || [])[1] || "";
  const deps = [...depBlock.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim());
  return {
    id, type, title, deps,
    text: `${title}\n${body}`.slice(0, 6000),          // title + body, capped for a fast embed
    props: { title, path, tier: fmGet("context_scaling_tier"), role: fmGet("role"), status: fmGet("status") },
  };
}

function ingestManifestPath(CONFIG) {
  return join(resolveDbPath(gks(CONFIG).cfg), "ingest-manifest.json");
}
function loadManifest(CONFIG) {
  const p = ingestManifestPath(CONFIG);
  try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : {}; }
  catch { return {}; }
}
function atomHash(a) {
  // Content identity for idempotency: text + deps. Unchanged hash => skip re-ingest.
  return createHash("sha1").update(a.text + "\n" + a.deps.join(",")).digest("hex").slice(0, 16);
}

// IDEMPOTENCY (why the manifest exists): GenesisDB `addNode` on an existing id APPENDS a
// new vector version (it does not upsert-in-place) — so a naive re-ingest doubles the
// collection's vector count every run, bloating storage and polluting the HNSW index with
// stale duplicates. hybridSearch dedupes by node id so QUERY results stay correct, but the
// growth is unbounded. The manifest records each atom's content hash; an unchanged atom is
// SKIPPED, making a repeat ingest a true no-op. `--force` bypasses it (full re-add).
async function cliIngest(argv) {
  let atomsFlag = null, limit = Infinity, dryRun = false, force = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--atoms") atomsFlag = argv[++i];
    else if (argv[i] === "--limit") limit = parseInt(argv[++i], 10);
    else if (argv[i] === "--dry-run") dryRun = true;
    else if (argv[i] === "--force") force = true;
  }
  const CONFIG = loadConfig();
  const dir = resolveAtomDir(CONFIG, atomsFlag);
  if (!dir) { process.stderr.write("ingest: no atom dir found (pass --atoms DIR)\n"); return 2; }
  const files = readdirSync(dir).filter((f) => f.endsWith(".md")).slice(0, limit);

  const parsed = files.map((f) => parseAtom(join(dir, f), f));
  const manifest = force ? {} : loadManifest(CONFIG);
  const atoms = parsed.filter((a) => manifest[a.id] !== atomHash(a));   // new or changed only
  const skipped = parsed.length - atoms.length;
  process.stderr.write(`ingest: ${parsed.length} atom(s) from ${dir}` +
    `${dryRun ? "  [DRY RUN]" : ""}${force ? "  [FORCE]" : ""}  ` +
    `(${atoms.length} new/changed, ${skipped} unchanged -> skipped)\n`);

  if (dryRun) {
    const edges = atoms.reduce((s, a) => s + a.deps.length, 0);
    process.stderr.write(`ingest DRY: would write ${atoms.length} nodes, up to ${edges} edges. ` +
      `sample: ${atoms.slice(0, 3).map((a) => `${a.id}[${a.type}]→${a.deps.length}`).join(", ") || "(none)"}\n`);
    return 0;
  }
  if (atoms.length === 0) {
    process.stderr.write("ingest: nothing to do — store already up to date (idempotent no-op).\n");
    process.stdout.write(JSON.stringify({ nodes: 0, skipped, edges: 0, dir, up_to_date: true }, null, 2) + "\n");
    return 0;
  }
  if (!openDb(CONFIG)) { process.stderr.write("ingest: store unavailable (check bindingPath/Ollama)\n"); return 1; }

  // Pass 1: nodes (each embedded via writeNode's auto-embed of node.text).
  const ingested = new Set();
  let nodeFail = 0;
  for (const a of atoms) {
    try {
      await writeNode(CONFIG, { id: a.id, labels: ["Atom", a.type], text: a.text, props: a.props });
      ingested.add(a.id);
      manifest[a.id] = atomHash(a);                 // record only on success
    } catch (e) {
      nodeFail++;
      if (process.env.RWANG_STORE_DEBUG) console.error(`[ingest] node ${a.id}:`, e.message);
    }
  }
  // Pass 2: dependency edges. Endpoints may live in a prior ingest, so accept a target
  // that is either freshly ingested OR already recorded in the manifest.
  const known = (id) => ingested.has(id) || manifest[id] !== undefined;
  let edgeOk = 0, edgeSkip = 0;
  for (const a of atoms) {
    if (!ingested.has(a.id)) continue;
    for (const dep of a.deps) {
      if (!known(dep)) { edgeSkip++; continue; }
      try { await writeEdge(CONFIG, { from: a.id, to: dep, rel: "depends_on" }); edgeOk++; }
      catch { edgeSkip++; }
    }
  }
  try { await openDb(CONFIG).flushIndex(); } catch { /* index catches up async */ }
  try { writeFileSync(ingestManifestPath(CONFIG), JSON.stringify(manifest, null, 0)); }
  catch (e) { if (process.env.RWANG_STORE_DEBUG) console.error("[ingest] manifest write:", e.message); }

  process.stderr.write(`ingest DONE: ${ingested.size} node(s) written (${nodeFail} failed, ${skipped} skipped), ` +
    `${edgeOk} edge(s) (${edgeSkip} skipped). Store searchable — try:\n` +
    `  node store/knowledge.mjs query "<text>" --json --out hits.json\n`);
  process.stdout.write(JSON.stringify({ nodes: ingested.size, node_failures: nodeFail,
    skipped, edges: edgeOk, edges_skipped: edgeSkip, dir }, null, 2) + "\n");
  return nodeFail === atoms.length ? 1 : 0;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "query": return cliQuery(rest);
    case "embed": return cliEmbed(rest);
    case "status": return cliStatus();
    case "smoke": return cliSmoke();
    case "ingest": return cliIngest(rest);
    default:
      process.stderr.write("usage: knowledge.mjs <query|embed|status|smoke|ingest> ...\n");
      return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}` ||
    fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code)).catch((e) => { console.error(e); process.exit(1); });
}
