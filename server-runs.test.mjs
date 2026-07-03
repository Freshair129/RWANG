// server-runs.test.mjs — boots the real server.mjs process on an ephemeral port
// against a fixture RWANG_RUNS_DIR and asserts GET /api/runs, GET /api/runs/:id,
// and the 404-on-unknown-id shape. Strictly read-only: never mutates the fixture dir.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

const REPO_DIR = dirname(fileURLToPath(import.meta.url));

let fixtureDir;
let child;
let port;
let baseUrl;

function snapshot(overrides = {}) {
  return {
    runId: "r1",
    status: "done",
    updated_at: "2026-07-03T04:41:40.577634+00:00",
    tasks: [
      { id: "T-1", status: "passed" },
      { id: "T-2", status: "passed" },
    ],
    ledger: { local_tokens: 0, billed_tokens: 100, billed_usd: 0.42 },
    ...overrides,
  };
}

function makeFixtureRunsDir() {
  const dir = mkdtempSync(join(tmpdir(), "server-runs-fixture-"));
  const runDir = join(dir, "run-1");
  mkdirSync(runDir);
  writeFileSync(join(runDir, "progress.json"), JSON.stringify(snapshot({ runId: "run-1" })));
  writeFileSync(
    join(runDir, "progress.ndjson"),
    [JSON.stringify({ event: "queued" }), JSON.stringify({ event: "pass" })].join("\n") + "\n",
  );
  return dir;
}

async function waitForServer(baseUrl, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl + "/api/runs");
      if (res.ok || res.status === 404) return;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not become ready: " + (lastErr ? lastErr.message : "timeout"));
}

before(async () => {
  fixtureDir = makeFixtureRunsDir();
  port = 20000 + Math.floor(Math.random() * 10000);
  baseUrl = `http://127.0.0.1:${port}`;

  child = spawn(process.execPath, ["server.mjs", "--port", String(port)], {
    cwd: REPO_DIR,
    env: { ...process.env, RWANG_RUNS_DIR: fixtureDir },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForServer(baseUrl);
});

after(async () => {
  if (child && !child.killed) {
    child.kill();
    await once(child, "exit").catch(() => {});
  }
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

test("GET /api/runs returns the run list summary shape", async () => {
  const res = await fetch(baseUrl + "/api/runs");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  const run = body.find((r) => r.runId === "run-1");
  assert.ok(run, "run-1 present in list");
  assert.equal(run.status, "done");
  assert.equal(run.tasksPassed, 2);
  assert.equal(run.tasksTotal, 2);
  assert.equal(run.billedUsd, 0.42);
});

test("GET /api/runs/:id returns snapshot + events + chain result", async () => {
  const res = await fetch(baseUrl + "/api/runs/run-1");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.runId, "run-1");
  assert.equal(body.status, "done");
  assert.ok(Array.isArray(body.events));
  assert.equal(body.events.length, 2);
  assert.ok(body.chain && typeof body.chain === "object");
  assert.equal(typeof body.chain.ok, "boolean");
});

test("GET /api/runs/:id 404s on an unknown run id", async () => {
  const res = await fetch(baseUrl + "/api/runs/does-not-exist");
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.ok, false);
});

test("read-only: fixture runs dir is untouched after all requests", async () => {
  const before_ = readdirSync(join(fixtureDir, "run-1")).sort();
  await fetch(baseUrl + "/api/runs");
  await fetch(baseUrl + "/api/runs/run-1");
  await fetch(baseUrl + "/api/runs/does-not-exist");
  const after_ = readdirSync(join(fixtureDir, "run-1")).sort();
  assert.deepEqual(before_, after_);
});
