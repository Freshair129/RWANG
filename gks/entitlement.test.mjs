// gks/entitlement.test.mjs — acceptance for guard--entitlement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { issueToken, verifyToken } from "./entitlement.mjs";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

test("a freshly issued token verifies and carries its tier", () => {
  const tok = issueToken({ deviceId: "DEV-1", tier: "studio", exp: Date.now() + 1e6 }, privateKey);
  const r = verifyToken(tok, publicKey, { deviceId: "DEV-1" });
  assert.equal(r.ok, true);
  assert.equal(r.tier, "studio");
  assert.equal(r.withinGrace, false);
});

test("a token bound to another device is rejected", () => {
  const tok = issueToken({ deviceId: "DEV-1", tier: "pro", exp: Date.now() + 1e6 }, privateKey);
  assert.equal(verifyToken(tok, publicKey, { deviceId: "DEV-2" }).reason, "device mismatch");
});

test("a tampered token fails the signature check", () => {
  const tok = issueToken({ deviceId: "DEV-1", tier: "pro", exp: Date.now() + 1e6 }, privateKey);
  assert.equal(verifyToken(tok.slice(0, -4) + "AAAA", publicKey).ok, false);
});

test("an expired token outside the grace window is rejected", () => {
  const tok = issueToken({ deviceId: "DEV-1", tier: "free", exp: 1000, graceMs: 100 }, privateKey);
  assert.equal(verifyToken(tok, publicKey, { now: 2000 }).reason, "expired");
});

test("an expired token within the offline grace window still works (flagged)", () => {
  const tok = issueToken({ deviceId: "DEV-1", tier: "free", exp: 1000, graceMs: 5000 }, privateKey);
  const r = verifyToken(tok, publicKey, { now: 3000 });
  assert.equal(r.ok, true);
  assert.equal(r.withinGrace, true);
});
