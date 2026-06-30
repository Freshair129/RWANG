// knowledge.test.mjs — acceptance for algo--knowledge-adapter
// Tests: same API in both modes · off-Windows degrades to file · semantic→lexical fallback
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, existsSync, readFileSync } from "node:fs";
import { _createFileStore, _createGenesisStore, getStore, resetStore } from "./knowledge.mjs";

// ── helpers ───────────────────────────────────────────────────────────────────
function makeBrain() {
  return join(tmpdir(), `gmaiden-ka-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}
function cleanup(dir) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ } }

const SAMPLE_REC = {
  taskId: "t1", taskTitle: "Build the knowledge adapter", type: "code",
  status: "failed", model: "claude:sonnet", worker: "w1", at: 1_000_000,
  issues: [{ severity: "blocked", area: "produce", detail: "no asOf method", fix: "add asOf" }],
};

// ── API surface contract: same 4 methods in file mode ────────────────────────
test("file store exposes all 4 contract methods", () => {
  const s = _createFileStore({ brainDir: makeBrain() });
  assert.equal(typeof s.recordOutcome, "function", "recordOutcome");
  assert.equal(typeof s.queryContext, "function", "queryContext");
  assert.equal(typeof s.asOf, "function", "asOf");
  assert.equal(typeof s.linkTrace, "function", "linkTrace");
  assert.equal(s.kind, "file");
});

// ── file: recordOutcome + queryContext ────────────────────────────────────────
test("file: recordOutcome writes failure rows; queryContext returns them via lexical search", async () => {
  const brainDir = makeBrain();
  try {
    const s = _createFileStore({ brainDir });
    await s.recordOutcome(SAMPLE_REC);

    const results = await s.queryContext({ title: "knowledge adapter", type: "code" }, { k: 5 });
    assert.ok(results.length > 0, "should find at least one match");
    assert.ok(results[0].issue.includes("asOf"), "should surface the recorded issue");
  } finally { cleanup(brainDir); }
});

// ── file: asOf time-travel filtering ─────────────────────────────────────────
test("file: asOf filters out records newer than the given timestamp", async () => {
  const brainDir = makeBrain();
  try {
    const s = _createFileStore({ brainDir });

    // Record two outcomes: one old, one new
    await s.recordOutcome({ ...SAMPLE_REC, taskId: "old", taskTitle: "old task failure", at: 500, issues: [{ detail: "old bug", fix: "", severity: "minor", area: "" }] });
    await s.recordOutcome({ ...SAMPLE_REC, taskId: "new", taskTitle: "new task failure", at: 2_000_000, issues: [{ detail: "new bug", fix: "", severity: "minor", area: "" }] });

    // asOf(1000) should only see records with at <= 1000
    const snap = s.asOf(1000);
    const results = await snap.queryContext({ title: "task failure", type: "code" }, { k: 10 });
    const issues = results.map((r) => r.issue);
    assert.ok(issues.some((i) => i.includes("old bug")), "old record should be visible");
    assert.ok(!issues.some((i) => i.includes("new bug")), "new record should be hidden by asOf(1000)");
  } finally { cleanup(brainDir); }
});

// ── file: asOf is read-only (recordOutcome + linkTrace are still writable on the original) ──
test("file: asOf snapshot inherits queryContext but allows writes on original store", async () => {
  const brainDir = makeBrain();
  try {
    const s = _createFileStore({ brainDir });
    const snap = s.asOf(999);
    // Snapshot queryContext returns empty (no records yet)
    const r = await snap.queryContext({ title: "anything", type: "code" });
    assert.deepEqual(r, []);
    // Original store can still write
    await s.recordOutcome(SAMPLE_REC);
  } finally { cleanup(brainDir); }
});

// ── file: linkTrace appends to traces.jsonl ───────────────────────────────────
test("file: linkTrace writes a trace record to brain/traces.jsonl", async () => {
  const brainDir = makeBrain();
  try {
    const s = _createFileStore({ brainDir });
    await s.linkTrace("task:t1", "task:t2", { rel: "causes", note: "t1 failure caused t2 re-run" });
    const traceFile = join(brainDir, "traces.jsonl");
    assert.ok(existsSync(traceFile), "traces.jsonl should exist");
    const line = JSON.parse(readFileSync(traceFile, "utf8").trim().split("\n")[0]);
    assert.equal(line.from, "task:t1");
    assert.equal(line.to, "task:t2");
    assert.equal(line.rel, "causes");
    assert.ok(typeof line.at === "number", "at should be a timestamp");
  } finally { cleanup(brainDir); }
});

// ── getStore: degrades to file when genesisdb binary is missing ───────────────
test("getStore: returns file mode when genesisdb binary path does not exist (win32 binary probe)", () => {
  resetStore();
  const s = getStore({ store: { knowledge: "genesisdb", genesisdb: { bindingPath: "/nonexistent/path/index.js" } } });
  // On any platform: missing binary → file mode
  assert.equal(s.kind, "file", "should degrade to file when binary is missing");
  resetStore();
});

// ── getStore: degrades to file on non-win32 (or returns genesisdb on win32 if binary exists) ──
test("getStore: selects file mode on non-win32 platforms when genesisdb is configured", () => {
  resetStore();
  if (process.platform !== "win32") {
    const s = getStore({ store: { knowledge: "genesisdb" } });
    assert.equal(s.kind, "file", "non-win32 must degrade to file");
  } else {
    // On win32 with missing binary, still degrades
    const s = getStore({ store: { knowledge: "genesisdb", genesisdb: { bindingPath: "C:/nonexistent.js" } } });
    assert.equal(s.kind, "file");
  }
  resetStore();
});

// ── getStore: returns file when no config provided ────────────────────────────
test("getStore: returns file store with no config (default mode)", () => {
  resetStore();
  const s = getStore({});
  assert.equal(s.kind, "file");
  resetStore();
});

// ── genesisdb mode: semantic→lexical fallback when open() / embed fails ───────
test("genesisdb: queryContext falls back to lexical when GenesisDB/Ollama is unavailable", async () => {
  const brainDir = makeBrain();
  try {
    // Populate failures.jsonl via file mode first
    const file = _createFileStore({ brainDir });
    await file.recordOutcome({ ...SAMPLE_REC, issues: [{ detail: "linkTrace missing", fix: "implement linkTrace", severity: "blocked", area: "" }] });

    // Create a genesisdb store pointing to a broken binding — open() will throw → falls back to lexical
    const gdb = _createGenesisStore({ bindingPath: "/nonexistent/index.js", brainDir });
    const results = await gdb.queryContext({ title: "knowledge adapter", type: "code" }, { k: 5 });

    // Fallback must return lexical results (not an empty array or throw)
    assert.ok(results.length > 0, "should return lexical fallback results when GenesisDB unavailable");
    assert.ok(results.some((r) => r.issue.includes("linkTrace")), "should surface the recorded issue via lexical");
  } finally { cleanup(brainDir); }
});

// ── genesisdb: asOf view exposes same read API ────────────────────────────────
test("genesisdb: asOf view has queryContext and groundContext, throws on writes", async () => {
  const brainDir = makeBrain();
  try {
    const gdb = _createGenesisStore({ bindingPath: "/nonexistent/index.js", brainDir });
    const snap = gdb.asOf(12345);
    assert.equal(snap.kind, "genesisdb:snapshot");
    assert.equal(typeof snap.queryContext, "function");
    assert.equal(typeof snap.groundContext, "function");
    await assert.rejects(() => snap.recordOutcome({}), /read-only/, "recordOutcome on snapshot should throw");
    await assert.rejects(() => snap.linkTrace("a", "b"), /read-only/, "linkTrace on snapshot should throw");
  } finally { cleanup(brainDir); }
});

// ── genesisdb: linkTrace writes traces.jsonl as durable fallback ──────────────
test("genesisdb: linkTrace writes traces.jsonl even when GenesisDB addEdge fails", async () => {
  const brainDir = makeBrain();
  try {
    // GenesisDB open() will fail (bad path), but linkTrace should still write JSONL
    const gdb = _createGenesisStore({ bindingPath: "/nonexistent/index.js", brainDir });
    await gdb.linkTrace("node:a", "node:b", { rel: "caused_by" });
    const traceFile = join(brainDir, "traces.jsonl");
    assert.ok(existsSync(traceFile), "traces.jsonl should be written even if genesisdb addEdge fails");
    const line = JSON.parse(readFileSync(traceFile, "utf8").trim().split("\n")[0]);
    assert.equal(line.from, "node:a");
    assert.equal(line.to, "node:b");
    assert.equal(line.rel, "caused_by");
  } finally { cleanup(brainDir); }
});

// ── genesisdb: recordOutcome writes JSONL first (durable) ─────────────────────
test("genesisdb: recordOutcome writes failures.jsonl even when GenesisDB is unavailable", async () => {
  const brainDir = makeBrain();
  try {
    const gdb = _createGenesisStore({ bindingPath: "/nonexistent/index.js", brainDir });
    // recordOutcome calls appendFail first, then tries open() which will fail
    try { await gdb.recordOutcome(SAMPLE_REC); } catch { /* open() threw, but JSONL should still be written */ }
    const failFile = join(brainDir, "failures.jsonl");
    assert.ok(existsSync(failFile), "failures.jsonl should be written before GenesisDB open()");
  } finally { cleanup(brainDir); }
});
