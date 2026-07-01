// gks/goldset-append.test.mjs — gold-set growth (P0 follow-up #2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendGoldset, scoreGoldset } from "./goldset.mjs";

test("appendGoldset adds curated entries, dedupes by id, and persists", () => {
  const d = mkdtempSync(join(tmpdir(), "gold-"));
  const file = join(d, "gs.json");
  writeFileSync(file, JSON.stringify({ labels: [{ id: "seed", issues: [], verdict: "pass" }] }));

  const r1 = appendGoldset([
    { id: "v-major-minor", issues: [{ severity: "major" }, { severity: "minor" }], verdict: "rework" },
    { id: "v-critical", issues: [{ severity: "critical" }], verdict: "fail" },
  ], { path: file });
  assert.equal(r1.added, 2);
  assert.equal(r1.total, 3);

  // re-append the same ids -> no duplicates
  const r2 = appendGoldset({ id: "v-critical", issues: [{ severity: "critical" }], verdict: "fail" }, { path: file });
  assert.equal(r2.added, 0);
  assert.equal(r2.total, 3);

  const doc = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(doc.labels.length, 3);
  rmSync(d, { recursive: true, force: true });
});

test("grown gold-set scores a matching verdict predictor at 100%", () => {
  // predictions keyed by id, matching the ground-truth verdict rule -> perfect score
  const labels = [
    { id: "a", verdict: "pass" }, { id: "b", verdict: "rework" }, { id: "c", verdict: "fail" },
  ];
  const preds = [
    { id: "a", verdict: "pass" }, { id: "b", verdict: "rework" }, { id: "c", verdict: "fail" },
  ];
  const s = scoreGoldset(preds, labels, { threshold: 0.8 });
  assert.equal(s.verdictAccuracy, 1);
  assert.equal(s.pass, true);
});
