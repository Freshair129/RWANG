// gks/approval-chain.test.mjs — acceptance for algo--approval-chain.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChain, runChain, feedGate } from "./approval-chain.mjs";

const firstVerdict = (s) => s.verdicts[0]; // the PASS verdict of each step

test("C-0 has a minimal chain (QA only)", () => {
  assert.deepEqual(buildChain({ complexity: "C-0" }).map((s) => s.step), ["QA"]);
});

test("C-3 runs the full DACI chain incl architecture approval + audit", () => {
  assert.deepEqual(
    buildChain({ complexity: "C-3" }).map((s) => s.step),
    ["SCOPE", "DOC_REVIEW", "FEASIBILITY", "ARCH_APPROVAL", "QA", "AUDIT"],
  );
});

test("a C-2 module-level task also escalates to architecture approval at H4", () => {
  assert.ok(buildChain({ complexity: "C-2", tier: "H4" }).some((s) => s.step === "ARCH_APPROVAL"));
});

test("C-2/C-3 with no source doc is blocked at intake", () => {
  const r = runChain({ complexity: "C-3" }, firstVerdict, {});
  assert.equal(r.ok, false);
  assert.equal(r.blockedAt, "INTAKE");
});

test("an all-pass C-3 with a source doc completes the whole chain", () => {
  const r = runChain({ complexity: "C-3" }, firstVerdict, { sourceDoc: "SDD-x" });
  assert.equal(r.ok, true);
  assert.equal(r.verdicts.length, 6);
});

test("a FAIL at a step halts the chain at that step", () => {
  const decide = (s) => (s.step === "FEASIBILITY" ? "FAIL" : s.verdicts[0]);
  const r = runChain({ complexity: "C-2" }, decide, { sourceDoc: "SRD-x" });
  assert.equal(r.ok, false);
  assert.equal(r.blockedAt, "FEASIBILITY");
});

// --- acceptance #4: the chain feeds the governance gate but NEVER bypasses it ---

test("a passing chain on a gated atom recommends confirm but never auto-confirms (gate stays authoritative)", () => {
  const r = runChain({ complexity: "C-3" }, (s) => s.verdicts[0], { sourceDoc: "SDD-x" });
  const g = feedGate(r, { gated: true });
  assert.equal(g.recommend, "confirm");
  assert.equal(g.autoConfirm, false);          // <- never bypasses the hard human-confirm gate
  assert.equal(g.requiresHumanConfirm, true);
  assert.equal(g.chainPassed, true);
  assert.equal(g.evidence.length, 6);          // role+verdict evidence is forwarded to the gate
});

test("a failed chain feeds a BLOCK into the gate (chain can only make the gate stricter)", () => {
  const r = runChain({ complexity: "C-3" }, () => "FAIL", { sourceDoc: "SDD-x" });
  const g = feedGate(r, { gated: true });
  assert.equal(g.recommend, "block");
  assert.equal(g.autoConfirm, false);
  assert.equal(g.blockedAt, "SCOPE");
});

test("intake-blocked C-2/C-3 (no source doc) feeds a BLOCK, still no bypass", () => {
  const r = runChain({ complexity: "C-2" }, (s) => s.verdicts[0], {}); // no sourceDoc
  const g = feedGate(r, { gated: true });
  assert.equal(g.chainPassed, false);
  assert.equal(g.recommend, "block");
  assert.equal(g.autoConfirm, false);
});

test("a non-gated atom never gains an auto-confirm from a passing chain either", () => {
  const r = runChain({ complexity: "C-0" }, (s) => s.verdicts[0], {});
  const g = feedGate(r, { gated: false });
  assert.equal(g.recommend, "confirm");
  assert.equal(g.requiresHumanConfirm, false);
  assert.equal(g.autoConfirm, false);          // chain authorizes nothing on its own
});
