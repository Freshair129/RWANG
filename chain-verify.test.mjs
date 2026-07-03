// chain-verify.test.mjs — fixtures for verifyChain(): intact chain, edited line,
// truncated tail, pure-legacy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyChain } from "./chain-verify.mjs";

const GENESIS = "genesis";

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function eventHash(prevHash, event) {
  const body = {};
  for (const [k, v] of Object.entries(event)) {
    if (k !== "prev_event_hash" && k !== "event_hash") body[k] = v;
  }
  const canon = canonicalize(body);
  return createHash("sha256").update(`${prevHash}\n${canon}`, "utf8").digest("hex");
}

// Build a chain of n events, chained from GENESIS, and return the array of
// on-disk event objects (each carries prev_event_hash + event_hash).
function buildChain(n) {
  const events = [];
  let prev = GENESIS;
  for (let i = 0; i < n; i++) {
    const base = { ts: `2026-07-03T00:00:0${i}Z`, task: `T-${i}`, event: "note", status: "ok" };
    const hash = eventHash(prev, base);
    const chained = { ...base, prev_event_hash: prev, event_hash: hash };
    events.push(chained);
    prev = hash;
  }
  return { events, tip: prev };
}

function writeRun(dir, events, snapshotTip) {
  const ndjsonPath = join(dir, "progress.ndjson");
  const jsonPath = join(dir, "progress.json");
  writeFileSync(ndjsonPath, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  writeFileSync(jsonPath, JSON.stringify({ last_event_hash: snapshotTip }));
  return { ndjsonPath, jsonPath };
}

function mkRunDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("intact chain: unbroken hashes + snapshot tip matches -> ok", () => {
  const dir = mkRunDir("chain-intact-");
  const { events, tip } = buildChain(5);
  writeRun(dir, events, tip);

  const report = verifyChain(dir);
  assert.equal(report.ok, true);
  assert.equal(report.events, 5);
  assert.equal(report.hashed, 5);
  assert.equal(report.chainTip, tip);
  assert.equal(report.snapshotTip, tip);
  assert.deepEqual(report.errors, []);
});

test("edited line: mutated event content breaks the recomputed hash -> not ok", () => {
  const dir = mkRunDir("chain-edited-");
  const { events, tip } = buildChain(5);
  // Tamper with line 3's status after hashing (simulates an on-disk edit).
  events[2] = { ...events[2], status: "TAMPERED" };
  writeRun(dir, events, tip);

  const report = verifyChain(dir);
  assert.equal(report.ok, false);
  assert.equal(report.events, 5);
  assert.ok(
    report.errors.some((e) => e.includes("line 3") && e.includes("event_hash mismatch")),
    `expected a line 3 event_hash mismatch error, got: ${JSON.stringify(report.errors)}`
  );
});

test("truncated tail: dropped trailing events -> chain self-verifies but tip != snapshot", () => {
  const dir = mkRunDir("chain-truncated-");
  const { events, tip } = buildChain(5);
  const truncated = events.slice(0, 3); // drop the last two events
  writeRun(dir, truncated, tip); // snapshot still points at the ORIGINAL (longer) tip

  const report = verifyChain(dir);
  assert.equal(report.ok, false);
  assert.equal(report.events, 3);
  assert.equal(report.hashed, 3);
  assert.notEqual(report.chainTip, report.snapshotTip);
  assert.ok(
    report.errors.some((e) => e.includes("ndjson truncated or snapshot stale")),
    `expected a truncation error, got: ${JSON.stringify(report.errors)}`
  );
});

test("pure-legacy: zero hashed events, no snapshot tip -> ok with a legacy warning", () => {
  const dir = mkRunDir("chain-legacy-");
  const legacyEvents = [
    { ts: "2026-01-01T00:00:00Z", task: "T-0", event: "note", status: "ok" },
    { ts: "2026-01-01T00:00:01Z", task: "T-1", event: "note", status: "ok" },
  ];
  const ndjsonPath = join(dir, "progress.ndjson");
  const jsonPath = join(dir, "progress.json");
  writeFileSync(ndjsonPath, legacyEvents.map((e) => JSON.stringify(e)).join("\n") + "\n");
  writeFileSync(jsonPath, JSON.stringify({ status: "done" })); // no last_event_hash field at all

  const report = verifyChain(dir);
  assert.equal(report.ok, true);
  assert.equal(report.events, 2);
  assert.equal(report.hashed, 0);
  assert.equal(report.chainTip, null);
  assert.equal(report.snapshotTip, null);
  assert.deepEqual(report.errors, []);
  assert.ok(report.warnings.includes("no chain (legacy run)"));
});

test("legacy prefix then real chain: hashed events after legacy lines still verify", () => {
  const dir = mkRunDir("chain-mixed-");
  const legacy = { ts: "2026-01-01T00:00:00Z", task: "T-legacy", event: "note", status: "ok" };
  const { events, tip } = buildChain(2);
  writeRun(dir, [legacy, ...events], tip);

  const report = verifyChain(dir);
  assert.equal(report.ok, true);
  assert.equal(report.events, 3);
  assert.equal(report.hashed, 2);
  assert.equal(report.chainTip, tip);
});

test("unhashed line after the chain started is a break, not tolerated legacy", () => {
  const dir = mkRunDir("chain-break-");
  const { events, tip } = buildChain(3);
  const unhashed = { ts: "2026-01-01T00:00:09Z", task: "T-x", event: "note", status: "ok" };
  writeRun(dir, [events[0], unhashed, events[1], events[2]], tip);

  const report = verifyChain(dir);
  assert.equal(report.ok, false);
  assert.ok(
    report.errors.some((e) => e.includes("unhashed event after the chain started")),
    `expected an unhashed-after-chain-started error, got: ${JSON.stringify(report.errors)}`
  );
});

// GOLDEN CROSS-LANGUAGE FIXTURE — the anti-self-consistency test.
// Every fixture above hashes with THIS file's local canonicalize(), so a JS-vs-Python
// canonicalization divergence stays invisible (a closed loop). These two lines are
// verbatim output of `progress.py` (init + a pass event, pinned timestamps) carrying
// hashes PYTHON computed. verifyChain must reproduce them byte-for-byte, which exercises
// the int/float split that broke the first cut: cost_usd 0.0 is a Python float ("0.0")
// while attempt_id 0/1 and verify.visible_exit 0 are Python ints ("0"). Regenerate with:
//   progress.py <dir> init ... --ts 2026-07-03T00:00:00+00:00
//   progress.py <dir> event --task G-1 --status pass --tier T2 --model claude-sonnet-4-6 \
//               --cost 0 --verify-exit 0 --note ok --ts 2026-07-03T00:00:01+00:00
test("golden: a real progress.py chain (Python-computed hashes) verifies -> ok", () => {
  const dir = mkRunDir("chain-golden-");
  const ndjson =
    '{"ts": "2026-07-03T00:00:00+00:00", "task": "G-1", "event": "queued", "status": "pending", "tier": "T2", "model": "m", "cost_usd": 0.0, "detail": "queued at init", "run_id": "golden", "task_id": "G-1", "event_type": "queued", "attempt_id": 0, "files": [], "approved_by": null, "prev_event_hash": "genesis", "event_hash": "899f57a889ce355ef2fae49d732f38f055689b50155dd3b4025b93e2b268605a"}\n' +
    '{"ts": "2026-07-03T00:00:01+00:00", "task": "G-1", "event": "pass", "status": "passed", "tier": "T2", "model": "claude-sonnet-4-6", "cost_usd": 0.0, "detail": "ok", "attempt_id": 1, "files": [], "verify": {"cmd": "", "visible_exit": 0, "holdout_exit": null}, "run_id": "golden", "task_id": "G-1", "event_type": "pass", "approved_by": null, "prev_event_hash": "899f57a889ce355ef2fae49d732f38f055689b50155dd3b4025b93e2b268605a", "event_hash": "98e745749f60c796a325c0e315d5abe7d1ddfa6a5315e65b4c20f9df987c11c3"}\n';
  const snapshotTip = "98e745749f60c796a325c0e315d5abe7d1ddfa6a5315e65b4c20f9df987c11c3";
  writeFileSync(join(dir, "progress.ndjson"), ndjson);
  writeFileSync(join(dir, "progress.json"), JSON.stringify({ last_event_hash: snapshotTip }));

  const report = verifyChain(dir);
  assert.equal(report.ok, true, `golden chain must verify; errors: ${JSON.stringify(report.errors)}`);
  assert.equal(report.hashed, 2);
  assert.equal(report.chainTip, snapshotTip);
  assert.deepEqual(report.errors, []);
});
