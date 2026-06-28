// gks/telemetry.test.mjs — acceptance for audit--telemetry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTelemetry } from "./telemetry.mjs";

test("telemetry is OFF by default — nothing recorded", () => {
  const t = createTelemetry();
  assert.equal(t.record("app.version", { version: "0.1.0" }).recorded, false);
  assert.equal(t.flush().length, 0);
});

test("when enabled, only allowlisted health events are recorded", () => {
  const t = createTelemetry({ enabled: true });
  assert.equal(t.record("app.version", { version: "0.1.0" }).recorded, true);
  assert.equal(t.record("feature.used", { feature: "board" }).recorded, true);
  assert.equal(t.record("atom.body", { feature: "x" }).recorded, false); // not allowlisted
});

test("payload bodies are stripped — only safe scalar fields survive", () => {
  const t = createTelemetry({ enabled: true });
  t.record("feature.used", { feature: "canvas", atomBody: "SECRET", provider: "claude" });
  const [rec] = t.flush();
  assert.equal(rec.feature, "canvas");
  assert.equal("atomBody" in rec, false);
  assert.equal("provider" in rec, false);
});
