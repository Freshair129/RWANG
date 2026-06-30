/**
 * Knowledge Adapter (algo--knowledge-adapter)
 *
 * Contract — same 4-method API in BOTH modes:
 *   recordOutcome(rec)              store decision/outcome
 *   queryContext(task, opts)        semantic (genesisdb) or lexical (file) — always returns []...[k]
 *   asOf(timestamp)                 returns a read-only time-scoped view of this store
 *   linkTrace(from, to, meta)       record causal link between two node IDs
 *
 * Modes:
 *   "file"      = zero-dep JSONL (mandatory fallback; always works)
 *   "genesisdb" = GenesisDB N-API (win32-only); degrades to file if binary missing
 *
 * Auto-degrade rules (evaluated in getStore, in order):
 *   1. Non-Windows platform       → always file (N-API binary is win32-only)
 *   2. CONFIG.store.knowledge !== "genesisdb"  → file
 *   3. GenesisDB binary missing/error          → file (warn)
 *   4. Ollama embeddings down during query     → queryContext falls back to lexical
 *
 * Write contract: recordOutcome / linkTrace are best-effort, never throw to caller.
 */
import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BRAIN = join(__dir, "..", "brain");
const DEFAULT_BINDING = "G:/GenesisBlock_Dev/GenesisBlock/index.js";

// ── File-path helpers ─────────────────────────────────────────────────────────
function brainPaths(brainDir) {
  return {
    dir: brainDir,
    fail: join(brainDir, "failures.jsonl"),
    trace: join(brainDir, "traces.jsonl"),
  };
}
function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }
function appendLine(file, rec) { appendFileSync(file, JSON.stringify(rec) + "\n"); }

// ── Shared: split one outcome record into per-issue failure rows ──────────────
function failureRows(rec) {
  const issues = rec.issues?.length
    ? rec.issues
    : [{ severity: rec.status === "failed" ? "blocked" : "major", area: "produce", detail: rec.summary || rec.status, fix: "" }];
  return issues.map((is) => ({
    taskId: rec.taskId, title: rec.taskTitle, type: rec.type, status: rec.status,
    model: rec.model, worker: rec.worker, at: rec.at,
    issue: is.detail || "", fix: is.fix || "", severity: is.severity || "", area: is.area || "",
  }));
}

// ── Shared: lexical search over failures.jsonl ────────────────────────────────
const STOP = new Set(["the", "a", "ของ", "ใน", "และ", "ที่", "ให้", "build", "task"]);
const tokenize = (s) => (s || "").toLowerCase().split(/[\s,/:.|()\[\]{}'"`-]+/).filter((w) => w.length > 1 && !STOP.has(w));
const overlap = (a, b) => { const sb = new Set(b); return a.filter((w) => sb.has(w)).length; };
const toMistake = (r) => ({ issue: r.issue || r.detail || "", fix: r.fix || "", task: r.taskId || r.task || "", severity: r.severity || "" });
const dedupe = (rows) => {
  const seen = new Set();
  return rows.filter((r) => { const k = (r.issue || r.detail || "").slice(0, 80); if (!k || seen.has(k)) return false; seen.add(k); return true; });
};

/**
 * Lexical (token-overlap) search over failures.jsonl.
 * Shared by file mode and used as genesisdb fallback when Ollama is unavailable.
 */
function lexicalQuery(failFile, task, { k = 3, asOfTs = null } = {}) {
  if (!existsSync(failFile)) return [];
  const terms = tokenize(`${task.title} ${task.type || ""}`);
  let rows = readFileSync(failFile, "utf8").split("\n").filter(Boolean)
    .map((j) => { try { return JSON.parse(j); } catch { return null; } }).filter(Boolean);
  if (asOfTs != null) rows = rows.filter((r) => !r.at || r.at <= asOfTs);
  const scored = rows
    .map((r) => ({ r, s: overlap(terms, tokenize(`${r.title} ${r.issue} ${r.type}`)) }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return dedupe(scored.map((x) => x.r)).slice(0, k).map(toMistake);
}

// ── File store (zero-dep, mandatory fallback) ─────────────────────────────────
export function _createFileStore({ asOfTs = null, brainDir = DEFAULT_BRAIN } = {}) {
  const P = brainPaths(brainDir);

  const store = {
    kind: "file",

    async recordOutcome(rec) {
      ensureDir(P.dir);
      for (const row of failureRows(rec)) appendLine(P.fail, row);
    },

    async queryContext(task, { k = 3 } = {}) {
      return lexicalQuery(P.fail, task, { k, asOfTs });
    },

    // L2 grounded context — file mode has no GRL; returns null so callers degrade gracefully
    async groundContext() { return null; },

    /**
     * Return a read-only time-scoped view.
     * All reads surface only records with `at <= timestamp`.
     * @param {number} timestamp  epoch ms
     */
    asOf(timestamp) {
      return _createFileStore({ asOfTs: timestamp, brainDir });
    },

    /**
     * Append a causal link to brain/traces.jsonl.
     * @param {string} from   source node / task id
     * @param {string} to     target node / task id
     * @param {object} [meta] { rel?, at?, ...extra }
     */
    async linkTrace(from, to, meta = {}) {
      ensureDir(P.dir);
      appendLine(P.trace, { from, to, rel: meta.rel || "traces", ...meta, at: meta.at ?? Date.now() });
    },

    async close() {},
  };
  return store;
}

// ── GenesisDB store (N-API, win32 only) ──────────────────────────────────────
export function _createGenesisStore(g = {}) {
  const _req = createRequire(import.meta.url);
  const OLLAMA = g.ollamaHost || "http://127.0.0.1:11434";
  const EMBED = g.embedModel || "bge-m3:latest";
  const DIM = g.vectorDim || 1024;
  const brainDir = g.brainDir || DEFAULT_BRAIN;
  const P = brainPaths(brainDir);
  let db = null;
  const seenTasks = new Set();

  async function embed(text) {
    const r = await fetch(`${OLLAMA}/api/embeddings`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: EMBED, prompt: text }),
    });
    if (!r.ok) throw new Error(`Ollama embed HTTP ${r.status}`);
    const j = await r.json();
    const v = j.embedding ?? (Array.isArray(j.embeddings) ? j.embeddings[0] : null);
    if (!Array.isArray(v)) throw new Error("embed shape unknown");
    return v;
  }

  function open() {
    if (db) return db;
    const { GenesisDatabase } = _req(g.bindingPath || DEFAULT_BINDING);
    ensureDir(brainDir);
    db = GenesisDatabase.open({
      path: g.path || join(brainDir, "orch.gdb"),
      pageCacheMb: g.pageCacheMb || 64,
      readOnly: false,
      vectorDim: DIM,
    });
    return db;
  }

  const store = {
    kind: "genesisdb",

    async recordOutcome(rec) {
      const rows = failureRows(rec);
      // JSONL written first — durable fallback regardless of GenesisDB state
      ensureDir(P.dir);
      for (const row of rows) appendLine(P.fail, row);
      const d = open();
      const taskNodeId = `task:${rec.taskId}`;
      if (!seenTasks.has(taskNodeId)) {
        try {
          await d.addNode({ id: taskNodeId, labels: ["task"], lang: "th",
            props: { id: rec.taskId, title: rec.taskTitle, type: rec.type },
            embedding: await embed(`${rec.taskTitle} ${rec.type}`) });
        } catch { /* node may already exist */ }
        seenTasks.add(taskNodeId);
      }
      for (const row of rows) {
        const fn = await d.addNode({ labels: ["failure"], lang: "th", causedBy: "verify-gate",
          props: row, embedding: await embed(`${row.title} :: ${row.issue}`) });
        try { await d.addEdge({ from: taskNodeId, to: fn.id, rel: "failed_with" }); } catch { /* */ }
      }
    },

    /**
     * Semantic hybrid search with AUTOMATIC LEXICAL FALLBACK when Ollama is unavailable
     * or when hybridSearch returns empty results.
     */
    async queryContext(task, { k = 3, alpha = 0.5, asOfTs = null } = {}) {
      let semantic = null;
      try {
        const d = open();
        const vec = await embed(`${task.title} :: ${task.accept || ""}`);
        const hits = await d.hybridSearch({ queryVector: vec, k: k + 2, alpha, lang: "th" });
        let rows = (hits || []).map((h) => h.node?.props).filter((p) => p && p.issue);
        if (asOfTs != null) rows = rows.filter((r) => !r.at || r.at <= asOfTs);
        semantic = dedupe(rows).slice(0, k).map(toMistake);
      } catch { /* embeddings or DB unavailable — fall through to lexical */ }

      if (semantic?.length) return semantic;
      // Fallback: lexical search over failures.jsonl (always works, zero-dep)
      return lexicalQuery(P.fail, task, { k, asOfTs });
    },

    // L2 grounded context: GRL tiered retrieval (optional — null on any error)
    async groundContext(task, { tier = "H1", budget = 4000, asOfTs = null } = {}) {
      try {
        const d = open();
        const hits = await d.hybridSearch({
          queryVector: await embed(`${task.title} :: ${task.accept || ""}`), k: 5, alpha: 0.5, lang: "th",
        });
        let filtered = hits || [];
        if (asOfTs != null) filtered = filtered.filter((h) => !h.node?.props?.at || h.node.props.at <= asOfTs);
        const titles = [...new Set(filtered.map((h) => h.node?.props?.title).filter(Boolean).filter((tt) => tt !== task.title))];
        if (!titles.length) return null;
        let tokenEstimate, reasoningPath;
        try {
          const ctx = await d.retrieveContext(filtered[0].node.id, tier, budget, true);
          tokenEstimate = ctx.tokenEstimate; reasoningPath = ctx.reasoningPath;
        } catch { /* GRL optional */ }
        return { tokenEstimate, reasoningPath, lines: titles.slice(0, 6) };
      } catch { return null; }
    },

    /**
     * Return a read-only time-scoped view.
     * Reads filter to `at <= timestamp`. Mutations throw.
     * @param {number} timestamp  epoch ms
     */
    asOf(timestamp) {
      return {
        kind: "genesisdb:snapshot",
        async queryContext(task, opts = {}) { return store.queryContext(task, { ...opts, asOfTs: timestamp }); },
        async groundContext(task, opts = {}) { return store.groundContext(task, { ...opts, asOfTs: timestamp }); },
        async recordOutcome() { throw new Error("knowledge-adapter: asOf() view is read-only"); },
        async linkTrace() { throw new Error("knowledge-adapter: asOf() view is read-only"); },
        asOf(ts) { return store.asOf(ts); },
        async close() {},
      };
    },

    /**
     * Record a causal link between two node/task IDs.
     * Persists to traces.jsonl (durable) AND GenesisDB addEdge (best-effort).
     */
    async linkTrace(from, to, meta = {}) {
      ensureDir(P.dir);
      appendLine(P.trace, { from, to, rel: meta.rel || "traces", ...meta, at: meta.at ?? Date.now() });
      try {
        const d = open();
        await d.addEdge({ from, to, rel: meta.rel || "traces" });
      } catch { /* JSONL is the durable record; GenesisDB best-effort */ }
    },

    async close() { try { await db?.saveState?.(); } catch { /* */ } },

    // ── Canvas write surface (feature--node-db-canvas) ────────────────────────
    async _writeNode({ id, labels = [], props = {}, text = "" }) {
      const d = open();
      const embedding = text ? await embed(text) : new Array(DIM).fill(0);
      const result = await d.addNode({ id, labels, lang: "th", props, embedding });
      return { ok: true, id: result.id };
    },
    async _writeEdge({ from, to, rel }) {
      const d = open();
      await d.addEdge({ from, to, rel });
      return { ok: true, from, to, rel };
    },
    async _queryNodes({ text, k = 5, alpha = 0.5 }) {
      const d = open();
      const hits = await d.hybridSearch({ queryVector: await embed(text), k, alpha, lang: "th" });
      return { ok: true, nodes: (hits || []).map((h) => ({ id: h.node?.id, labels: h.node?.labels, props: h.node?.props, score: h.score })) };
    },
  };
  return store;
}

// ── Singleton factory ─────────────────────────────────────────────────────────
let _store = null;

/**
 * Return the active knowledge store (cached singleton per process).
 *
 * Mode selection (in order):
 *   1. Non-Windows → file (GenesisDB N-API binary is win32-only)
 *   2. CONFIG.store.knowledge === "genesisdb" AND binary loadable → genesisdb
 *   3. Otherwise → file
 *
 * @param {object} CONFIG   app config (CONFIG.store.knowledge, CONFIG.store.genesisdb)
 * @returns {object}        KnowledgeAdapter instance
 */
export function getStore(CONFIG) {
  if (_store) return _store;
  const s = CONFIG?.store || {};

  if (s.knowledge === "genesisdb") {
    if (process.platform !== "win32") {
      console.warn("knowledge-adapter: GenesisDB requested but platform is not win32 — degrading to file");
      _store = _createFileStore({ brainDir: s.brainDir });
    } else {
      // Probe binding synchronously: fail-fast before first I/O so callers never see a broken state
      try {
        const _req = createRequire(import.meta.url);
        _req(s.genesisdb?.bindingPath || DEFAULT_BINDING);
        _store = _createGenesisStore(s.genesisdb);
      } catch (e) {
        console.warn(`knowledge-adapter: GenesisDB binding unavailable (${e.message}) — degrading to file`);
        _store = _createFileStore({ brainDir: s.brainDir });
      }
    }
  } else {
    _store = _createFileStore({ brainDir: s.brainDir });
  }
  return _store;
}

/** Reset the singleton — use only in tests or when reloading config. */
export function resetStore() { _store = null; }

// ── Canvas write API — public wrappers (feature--node-db-canvas) ──────────────
export async function writeNode(CONFIG, { id, labels, props, text }) {
  const store = getStore(CONFIG);
  if (store.kind !== "genesisdb") return { ok: false, error: "writeNode requires genesisdb mode" };
  return store._writeNode({ id, labels, props, text });
}
export async function writeEdge(CONFIG, { from, to, rel }) {
  const store = getStore(CONFIG);
  if (store.kind !== "genesisdb") return { ok: false, error: "writeEdge requires genesisdb mode" };
  return store._writeEdge({ from, to, rel });
}
export async function queryNodes(CONFIG, { text, k = 5, alpha = 0.5 }) {
  const store = getStore(CONFIG);
  if (store.kind !== "genesisdb") return { ok: false, error: "queryNodes requires genesisdb mode" };
  return store._queryNodes({ text, k, alpha });
}
