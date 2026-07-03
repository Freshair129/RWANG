// chain-verify.mjs — read-only JS mirror of `orchestrator/progress.py verify-chain` (Rwang repo).
// Walks runDir/progress.ndjson verifying the tamper-evident hash chain documented in
// USERFLOW.md "The shared progress schema", then compares the chain tip against
// progress.json "last_event_hash" (the anti-truncation anchor). Zero-dependency Node ESM.
//
// Chain rule (verbatim): event_hash = sha256(prev_event_hash + "\n" +
//   JSON.stringify(event minus the two hash fields, keys sorted, compact separators)).
// The first hashed event uses prev_event_hash = "genesis". Legacy events (written before
// the chain existed) carry no hash fields and are tolerated as a prefix before the chain
// starts; an unhashed line AFTER the chain has begun is a break, not legacy.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const GENESIS = "genesis";
const HASH_FIELDS = new Set(["prev_event_hash", "event_hash"]);

// CROSS-LANGUAGE HAZARD: JSON.parse collapses Python's int/float distinction (both
// `0` and `0.0` parse to the JS number 0), but progress.py's json.dumps renders them
// DIFFERENTLY — a float always carries a decimal point (0.0 -> "0.0", 1.0 -> "1.0"),
// an int never does (0 -> "0"). Since we cannot recover the type from the parsed
// value, we must know it from the schema. In the ndjson event schema exactly ONE
// numeric field is a Python float — `cost_usd`; every other number (`attempt_id`,
// `verify.visible_exit`, `verify.holdout_exit`) is a Python int. FLOAT_KEYS names the
// float fields by key so a float value that happens to be integral (cost_usd 0.0)
// serializes as "0.0" while a true int (visible_exit 0) serializes as "0" — matching
// progress.py byte-for-byte. This mirror is coupled to that schema by design; the
// real-ndjson fixture in the test guards the coupling.
const FLOAT_KEYS = new Set(["cost_usd"]);

function numToken(n, isFloat) {
  if (!Number.isFinite(n)) return "null";           // NaN/Infinity -> Python json emits null; schema never produces these
  if (isFloat && Number.isInteger(n)) return `${n}.0`;
  return String(n);                                 // ints, and non-integral floats (0.02 -> "0.02") already match
}

// Canonicalize an event (sorted keys, compact separators) the same way json.dumps(...,
// sort_keys=True, separators=(",", ":")) does in progress.py, so hashes match byte-for-byte.
// `keyName` is the object key this value sits under (undefined at the root / in arrays),
// used only to decide float-vs-int number rendering.
function canonicalize(value, keyName) {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k], k)}`).join(",")}}`;
  }
  if (typeof value === "number") return numToken(value, FLOAT_KEYS.has(keyName));
  return JSON.stringify(value);
}

function eventHash(prevHash, event) {
  const body = {};
  for (const [k, v] of Object.entries(event)) {
    if (!HASH_FIELDS.has(k)) body[k] = v;
  }
  const canon = canonicalize(body);
  return createHash("sha256").update(`${prevHash}\n${canon}`, "utf8").digest("hex");
}

function readSnapshot(jsonPath) {
  return JSON.parse(readFileSync(jsonPath, "utf8"));
}

/**
 * Verify the tamper-evident hash chain of runDir/progress.ndjson against the
 * last_event_hash tip recorded in runDir/progress.json.
 *
 * Returns { ok, events, hashed, chainTip, snapshotTip, errors[] }.
 * ok is true iff the chain is unbroken AND chainTip === snapshotTip (a pure-legacy
 * run — zero hashed events, no snapshot tip — is also ok, per the documented rule).
 */
export function verifyChain(runDir) {
  const ndjsonPath = join(runDir, "progress.ndjson");
  const jsonPath = join(runDir, "progress.json");

  const errors = [];
  const warnings = [];
  let nEvents = 0;
  let nHashed = 0;
  let prev = GENESIS;
  let chainStarted = false;

  let raw;
  try {
    raw = readFileSync(ndjsonPath, "utf8");
  } catch (e) {
    errors.push(`cannot read ${ndjsonPath}: ${e.message}`);
    return {
      ok: false, events: 0, hashed: 0, chainTip: null, snapshotTip: null, errors, warnings,
    };
  }

  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const lineNo = i + 1;
    nEvents += 1;

    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      errors.push(`line ${lineNo}: not valid JSON`);
      continue;
    }
    if (ev === null || typeof ev !== "object" || Array.isArray(ev)) {
      errors.push(`line ${lineNo}: event is not an object`);
      continue;
    }

    const stored = ev.event_hash;
    if (typeof stored !== "string" || !stored) {
      if (chainStarted) {
        errors.push(`line ${lineNo}: unhashed event after the chain started`);
      }
      // else: legacy prefix (pre-chain writer) — allowed, chain not begun.
      continue;
    }

    nHashed += 1;
    if (ev.prev_event_hash !== prev) {
      errors.push(
        `line ${lineNo}: prev_event_hash mismatch (expected ${prev}, got ${ev.prev_event_hash})`
      );
    }
    const recomputed = eventHash(prev, ev);
    if (recomputed !== stored) {
      errors.push(`line ${lineNo}: event_hash mismatch — event content was altered`);
    }
    // Chain onward from the STORED hash: a single tampered line then yields exactly
    // one mismatch instead of cascading down the rest of the file.
    prev = stored;
    chainStarted = true;
  }

  let snap;
  try {
    snap = readSnapshot(jsonPath);
  } catch (e) {
    errors.push(`cannot read ${jsonPath}: ${e.message}`);
    return {
      ok: false, events: nEvents, hashed: nHashed, chainTip: nHashed ? prev : null,
      snapshotTip: null, errors, warnings,
    };
  }
  const snapTip = Object.prototype.hasOwnProperty.call(snap, "last_event_hash")
    ? snap.last_event_hash
    : null;

  if (nHashed === 0) {
    if (snapTip === null || snapTip === undefined) {
      warnings.push("no chain (legacy run)");
    } else if (snapTip === GENESIS) {
      // new-format run with zero events yet — an empty chain is intact
    } else {
      errors.push(
        `progress.json last_event_hash=${snapTip} but progress.ndjson has no hashed events ` +
          `(chain deleted or file replaced)`
      );
    }
  } else if (snapTip === null || snapTip === undefined) {
    errors.push(
      "chain present in ndjson but progress.json has no last_event_hash (snapshot stale or tampered)"
    );
  } else if (snapTip !== prev) {
    errors.push(
      `chain tip ${prev} != progress.json last_event_hash ${snapTip} (ndjson truncated or snapshot stale)`
    );
  }

  const chainTip = nHashed ? prev : null;
  const ok = errors.length === 0;

  return { ok, events: nEvents, hashed: nHashed, chainTip, snapshotTip: snapTip, errors, warnings };
}

export default verifyChain;
