// runs-reader.mjs â€” read-only reader over Rwang's runs/<runId>/ directory tree.
// Node ESM, zero-dependency (stdlib only, matches accounts.mjs / account-identity.mjs style).
// NEVER writes into runsDir â€” this module only reads progress.json / progress.ndjson.
//
// Schema reference: G:/Rwang/USERFLOW.md "The shared progress schema" â€” progress.json is the
// rolled-up snapshot (runId, status, tasks[], ledger{billed_usd}, updated_at, ...), progress.ndjson
// is the append-only per-line event audit log.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// List every run under runsDir, summarized from its progress.json snapshot.
// Skips any subdirectory that isn't readable / doesn't have a valid progress.json,
// without throwing â€” a single broken run must never take down the whole list.
export function listRuns(runsDir) {
  let entries;
  try {
    entries = readdirSync(runsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const runs = [];
  for (const entry of entries) {
    let isDir;
    try {
      isDir = entry.isDirectory ? entry.isDirectory() : statSync(join(runsDir, entry.name)).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    const runId = entry.name;
    const progressPath = join(runsDir, runId, "progress.json");

    let snapshot;
    try {
      const raw = readFileSync(progressPath, "utf8");
      snapshot = JSON.parse(raw);
    } catch {
      // missing progress.json, unreadable dir, or malformed JSON â€” skip, don't throw
      continue;
    }

    const tasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
    const tasksTotal = tasks.length;
    const tasksPassed = tasks.filter((t) => t && (t.status === "passed" || t.status === "pass")).length;

    runs.push({
      runId: snapshot.runId || runId,
      status: snapshot.status ?? null,
      tasksPassed,
      tasksTotal,
      updatedAt: snapshot.updated_at ?? null,
      billedUsd: snapshot?.ledger?.billed_usd ?? 0,
    });
  }

  return runs;
}

// Read one run in full: the parsed progress.json snapshot plus the last 50 ndjson events.
// Returns null (never throws) if the run dir / progress.json is missing or unreadable.
export function readRun(runsDir, runId) {
  const runDir = join(runsDir, runId);
  const progressPath = join(runDir, "progress.json");

  let snapshot;
  try {
    const raw = readFileSync(progressPath, "utf8");
    snapshot = JSON.parse(raw);
  } catch {
    return null;
  }

  const events = readLastNdjsonEvents(join(runDir, "progress.ndjson"), 50);

  return { ...snapshot, events };
}

// Read the last `limit` valid JSON lines from an ndjson file. Malformed lines are skipped.
// Returns [] if the file is missing/unreadable â€” never throws.
function readLastNdjsonEvents(ndjsonPath, limit) {
  let raw;
  try {
    raw = readFileSync(ndjsonPath, "utf8");
  } catch {
    return [];
  }

  const lines = raw.split("\n").filter((line) => line.trim().length > 0);
  const tail = lines.slice(-limit);

  const events = [];
  for (const line of tail) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // skip malformed line
    }
  }
  return events;
}
