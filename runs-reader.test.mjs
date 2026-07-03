// runs-reader.test.mjs — fixture-dir coverage for listRuns / readRun.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listRuns, readRun } from "./runs-reader.mjs";

function makeRunsDir() {
  return mkdtempSync(join(tmpdir(), "runs-reader-"));
}

function snapshot(overrides = {}) {
  return {
    runId: "r1",
    status: "done",
    updated_at: "2026-07-03T04:41:40.577634+00:00",
    tasks: [
      { id: "T-1", status: "passed" },
      { id: "T-2", status: "passed" },
      { id: "T-3", status: "failed" },
    ],
    ledger: { local_tokens: 0, billed_tokens: 100, billed_usd: 0.42 },
    ...overrides,
  };
}

test("listRuns: happy path summarizes each run's progress.json", () => {
  const runsDir = makeRunsDir();

  const r1 = join(runsDir, "run-1");
  mkdirSync(r1);
  writeFileSync(join(r1, "progress.json"), JSON.stringify(snapshot({ runId: "run-1" })));

  const r2 = join(runsDir, "run-2");
  mkdirSync(r2);
  writeFileSync(
    join(r2, "progress.json"),
    JSON.stringify(snapshot({ runId: "run-2", status: "running", tasks: [{ id: "T-1", status: "pending" }] })),
  );

  const runs = listRuns(runsDir);
  assert.equal(runs.length, 2);

  const run1 = runs.find((r) => r.runId === "run-1");
  assert.deepEqual(run1, {
    runId: "run-1",
    status: "done",
    tasksPassed: 2,
    tasksTotal: 3,
    updatedAt: "2026-07-03T04:41:40.577634+00:00",
    billedUsd: 0.42,
  });

  const run2 = runs.find((r) => r.runId === "run-2");
  assert.equal(run2.status, "running");
  assert.equal(run2.tasksPassed, 0);
  assert.equal(run2.tasksTotal, 1);
});

test("listRuns: skips a dir with a missing progress.json without throwing", () => {
  const runsDir = makeRunsDir();

  const good = join(runsDir, "good-run");
  mkdirSync(good);
  writeFileSync(join(good, "progress.json"), JSON.stringify(snapshot({ runId: "good-run" })));

  // no progress.json at all
  mkdirSync(join(runsDir, "empty-run"));

  const runs = listRuns(runsDir);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].runId, "good-run");
});

test("listRuns: skips a dir with malformed JSON without throwing", () => {
  const runsDir = makeRunsDir();

  const good = join(runsDir, "good-run");
  mkdirSync(good);
  writeFileSync(join(good, "progress.json"), JSON.stringify(snapshot({ runId: "good-run" })));

  const bad = join(runsDir, "bad-run");
  mkdirSync(bad);
  writeFileSync(join(bad, "progress.json"), "{ not valid json ][");

  const runs = listRuns(runsDir);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].runId, "good-run");
});

test("listRuns: nonexistent runsDir returns [] without throwing", () => {
  const runs = listRuns(join(tmpdir(), "definitely-does-not-exist-" + Date.now()));
  assert.deepEqual(runs, []);
});

test("listRuns: ignores non-directory entries (stray files) in runsDir", () => {
  const runsDir = makeRunsDir();
  writeFileSync(join(runsDir, "stray-file.txt"), "not a run");

  const good = join(runsDir, "good-run");
  mkdirSync(good);
  writeFileSync(join(good, "progress.json"), JSON.stringify(snapshot({ runId: "good-run" })));

  const runs = listRuns(runsDir);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].runId, "good-run");
});

test("readRun: happy path returns full snapshot plus last 50 ndjson events", () => {
  const runsDir = makeRunsDir();
  const runDir = join(runsDir, "run-1");
  mkdirSync(runDir);
  const snap = snapshot({ runId: "run-1" });
  writeFileSync(join(runDir, "progress.json"), JSON.stringify(snap));

  const lines = [];
  for (let i = 0; i < 60; i++) {
    lines.push(JSON.stringify({ ts: `2026-07-03T00:00:${String(i).padStart(2, "0")}Z`, event: "note", detail: `e${i}` }));
  }
  writeFileSync(join(runDir, "progress.ndjson"), lines.join("\n") + "\n");

  const result = readRun(runsDir, "run-1");
  assert.equal(result.runId, "run-1");
  assert.equal(result.status, "done");
  assert.equal(result.events.length, 50);
  // last 50 of 60 → events[0] should be e10, events[49] should be e59
  assert.equal(result.events[0].detail, "e10");
  assert.equal(result.events[49].detail, "e59");
});

test("readRun: missing progress.json returns null without throwing", () => {
  const runsDir = makeRunsDir();
  mkdirSync(join(runsDir, "no-progress"));

  const result = readRun(runsDir, "no-progress");
  assert.equal(result, null);
});

test("readRun: malformed progress.json returns null without throwing", () => {
  const runsDir = makeRunsDir();
  const runDir = join(runsDir, "bad-run");
  mkdirSync(runDir);
  writeFileSync(join(runDir, "progress.json"), "{ broken");

  const result = readRun(runsDir, "bad-run");
  assert.equal(result, null);
});

test("readRun: missing progress.ndjson yields events: [] but still returns the snapshot", () => {
  const runsDir = makeRunsDir();
  const runDir = join(runsDir, "no-ndjson");
  mkdirSync(runDir);
  writeFileSync(join(runDir, "progress.json"), JSON.stringify(snapshot({ runId: "no-ndjson" })));

  const result = readRun(runsDir, "no-ndjson");
  assert.equal(result.runId, "no-ndjson");
  assert.deepEqual(result.events, []);
});

test("readRun: malformed ndjson lines are skipped, valid ones kept", () => {
  const runsDir = makeRunsDir();
  const runDir = join(runsDir, "mixed-ndjson");
  mkdirSync(runDir);
  writeFileSync(join(runDir, "progress.json"), JSON.stringify(snapshot({ runId: "mixed-ndjson" })));
  writeFileSync(
    join(runDir, "progress.ndjson"),
    [JSON.stringify({ event: "queued" }), "not json {{{", JSON.stringify({ event: "pass" }), ""].join("\n"),
  );

  const result = readRun(runsDir, "mixed-ndjson");
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].event, "queued");
  assert.equal(result.events[1].event, "pass");
});

test("read-only: listRuns and readRun never write into runsDir", () => {
  const runsDir = makeRunsDir();
  const runDir = join(runsDir, "run-1");
  mkdirSync(runDir);
  writeFileSync(join(runDir, "progress.json"), JSON.stringify(snapshot({ runId: "run-1" })));
  writeFileSync(join(runDir, "progress.ndjson"), JSON.stringify({ event: "note" }) + "\n");

  const before = readdirSync(runDir).sort();
  listRuns(runsDir);
  readRun(runsDir, "run-1");
  const after = readdirSync(runDir).sort();

  assert.deepEqual(before, after);
});
