/**
 * Knowledge store adapter (ADR-O-003) — ชั้น knowledge แยกจาก execution core
 *   "file"      = zero-dep (append jsonl) — ดีฟอลต์ รักษา P1
 *   "genesisdb" = N-API anti-error loop (SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP)
 *
 * L0 (เฟสนี้): recordOutcome() — write-only เก็บความผิดที่ Verify Gate ตีกลับ
 * L1 (ถัดไป):  queryContext() — ดึง "❌ past mistakes" ที่คล้าย task กลับมา inject เข้า prompt
 *
 * สัญญา: write-only best-effort — ห้าม throw ออกไปทำ Verify Gate/pool พังหรือช้า (เรียกแบบ fire-and-forget)
 */
import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dir = dirname(fileURLToPath(import.meta.url));
const BRAIN = join(__dir, "..", "brain");
const FAILLOG = join(BRAIN, "failures.jsonl");
const ensureBrain = () => { if (!existsSync(BRAIN)) mkdirSync(BRAIN, { recursive: true }); };
const appendFail = (rec) => { ensureBrain(); appendFileSync(FAILLOG, JSON.stringify(rec) + "\n"); };

// ---------- helpers สำหรับ queryContext (L1) ----------
const STOP = new Set(["the", "a", "ของ", "ใน", "และ", "ที่", "ให้", "build", "task"]);
const tokenize = (s) => (s || "").toLowerCase().split(/[\s,/:.|()\[\]{}'"`-]+/).filter((w) => w.length > 1 && !STOP.has(w));
const overlap = (a, b) => { const sb = new Set(b); return a.filter((w) => sb.has(w)).length; };
const toMistake = (r) => ({ issue: r.issue || r.detail || "", fix: r.fix || "", task: r.taskId || r.task || "", severity: r.severity || "" });
const dedupe = (rows) => { const seen = new Set(); return rows.filter((r) => { const k = (r.issue || r.detail || "").slice(0, 80); if (!k || seen.has(k)) return false; seen.add(k); return true; }); };

// แตก outcome 1 ตัว -> หลาย "failure rows" (1 row ต่อ 1 issue) เพื่อให้ค้นได้ราย issue ใน L1
function failureRows(rec) {
  const issues = rec.issues?.length ? rec.issues : [{ severity: rec.status === "failed" ? "blocked" : "major", area: "produce", detail: rec.summary || rec.status, fix: "" }];
  return issues.map((is) => ({
    taskId: rec.taskId, title: rec.taskTitle, type: rec.type, status: rec.status,
    model: rec.model, worker: rec.worker, at: rec.at,
    issue: is.detail || "", fix: is.fix || "", severity: is.severity || "", area: is.area || "",
  }));
}

// ---------- file store (zero-dep) ----------
function fileStore() {
  return {
    kind: "file",
    async recordOutcome(rec) { for (const row of failureRows(rec)) appendFail(row); },
    // L1 fallback (zero-dep): lexical overlap แทน semantic — คืน "❌ past mistakes" ที่คำซ้ำกับ task
    async queryContext(task, { k = 3 } = {}) {
      if (!existsSync(FAILLOG)) return [];
      const terms = tokenize(`${task.title} ${task.type}`);
      const rows = readFileSync(FAILLOG, "utf8").split("\n").filter(Boolean)
        .map((j) => { try { return JSON.parse(j); } catch { return null; } }).filter(Boolean);
      const scored = rows.map((r) => ({ r, s: overlap(terms, tokenize(`${r.title} ${r.issue} ${r.type}`)) }))
        .filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
      return dedupe(scored.map((x) => x.r)).slice(0, k).map(toMistake);
    },
    async groundContext() { return null; },   // L2 ต้องใช้ GRL ของ GenesisDB — file mode degrade เป็น static scope.docs
    async close() {},
  };
}

// ---------- genesisdb store (N-API, lazy) ----------
function genesisStore(g = {}) {
  const require = createRequire(import.meta.url);
  const OLLAMA = g.ollamaHost || "http://127.0.0.1:11434";
  const EMBED = g.embedModel || "bge-m3:latest";
  const DIM = g.vectorDim || 1024;
  let db = null;
  const seenTasks = new Set();   // กัน addNode task ซ้ำต่อ process

  async function embed(text) {
    const r = await fetch(`${OLLAMA}/api/embeddings`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: EMBED, prompt: text }),
    });
    if (!r.ok) throw new Error(`Ollama embed HTTP ${r.status}`);
    const j = await r.json();
    const v = j.embedding ?? (Array.isArray(j.embeddings) ? j.embeddings[0] : null);
    if (!Array.isArray(v)) throw new Error("embedding shape ไม่รู้จัก");
    return v;
  }
  function open() {
    if (db) return db;
    const { GenesisDatabase } = require(g.bindingPath || "G:/GenesisBlock_Dev/GenesisBlock/index.js");
    ensureBrain();
    db = GenesisDatabase.open({ path: g.path || join(BRAIN, "orch.gdb"), pageCacheMb: g.pageCacheMb || 64, readOnly: false, vectorDim: DIM });
    return db;
  }
  return {
    kind: "genesisdb",
    async recordOutcome(rec) {
      const rows = failureRows(rec);
      for (const row of rows) appendFail(row);                 // เก็บ jsonl ด้วยเสมอ (durable + debug)
      const d = open();
      // L2: task node (id เจาะจง) เพื่อให้ retrieveContext มีจุดยึด + ผูก edge -> failure
      const taskNodeId = `task:${rec.taskId}`;
      if (!seenTasks.has(taskNodeId)) {
        try { await d.addNode({ id: taskNodeId, labels: ["task"], lang: "th", props: { id: rec.taskId, title: rec.taskTitle, type: rec.type }, embedding: await embed(`${rec.taskTitle} ${rec.type}`) }); } catch { /* อาจมีแล้ว */ }
        seenTasks.add(taskNodeId);
      }
      for (const row of rows) {
        const fn = await d.addNode({ labels: ["failure"], lang: "th", causedBy: "verify-gate", props: row, embedding: await embed(`${row.title} :: ${row.issue}`) });
        try { await d.addEdge({ from: taskNodeId, to: fn.id, rel: "failed_with" }); } catch { /* */ }
      }
    },
    // L1 — semantic: hybridSearch (vector+lexical) บน failure nodes -> "❌ past mistakes" ที่คล้าย task
    async queryContext(task, { k = 3, alpha = 0.5 } = {}) {
      const d = open();
      let hits = [];
      try { hits = await d.hybridSearch({ queryVector: await embed(`${task.title} :: ${task.accept || ""}`), k: k + 2, alpha, lang: "th" }); }
      catch { return []; }
      const rows = (hits || []).map((h) => h.node?.props).filter((p) => p && p.issue);
      return dedupe(rows).slice(0, k).map(toMistake);
    },
    // L2 — grounded context: "ชื่องานที่เกี่ยวข้อง" จาก hybridSearch (เสริม L1 ไม่ซ้ำ — L1 = ความผิด, L2 = งานคล้าย)
    // retrieveContext (GRL tier+budget) ให้ tokenEstimate/reasoningPath แบบ budgeted
    async groundContext(task, { tier = "H1", budget = 4000 } = {}) {
      const d = open();
      try {
        const hits = await d.hybridSearch({ queryVector: await embed(`${task.title} :: ${task.accept || ""}`), k: 5, alpha: 0.5, lang: "th" });
        const titles = [...new Set((hits || []).map((h) => h.node?.props?.title).filter(Boolean).filter((tt) => tt !== task.title))];
        if (!titles.length) return null;
        let tokenEstimate, reasoningPath;
        try { const ctx = await d.retrieveContext(hits[0].node.id, tier, budget, true); tokenEstimate = ctx.tokenEstimate; reasoningPath = ctx.reasoningPath; } catch { /* GRL optional */ }
        return { tokenEstimate, reasoningPath, lines: titles.slice(0, 6) };
      } catch { return null; }
    },
    async close() { try { await db?.saveState?.(); } catch { /* */ } },
    // canvas write surface (feature--node-db-canvas)
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
}

let _store = null;
/** คืน store ตาม CONFIG.store.knowledge (cache; เปลี่ยนโหมดต้อง restart). */
export function getStore(CONFIG) {
  if (_store) return _store;
  const s = CONFIG?.store || {};
  _store = s.knowledge === "genesisdb" ? genesisStore(s.genesisdb) : fileStore();
  return _store;
}

// ---------- Node↔DB canvas write API (feature--node-db-canvas) ----------
// Direct write surface for the visual canvas — bypasses the outcome pipeline.
// Only available when kind === "genesisdb"; file mode returns graceful errors.
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
