// gks/marketplace.test.mjs — acceptance for feature--marketplace-seam.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { packLoadout, importPack } from "./marketplace.mjs";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

test("a signed loadout pack imports and yields the loadout", () => {
  const loadout = { role: "coder", model: "claude:sonnet", tools: ["file_edit"] };
  const pack = packLoadout(loadout, privateKey, { author: "ARCHON" });
  const r = importPack(pack, publicKey);
  assert.equal(r.ok, true);
  assert.deepEqual(r.loadout, loadout);
  assert.equal(r.author, "ARCHON");
});

test("a tampered pack is rejected (signature)", () => {
  const pack = packLoadout({ role: "coder" }, privateKey);
  assert.equal(importPack(pack.slice(0, -4) + "AAAA", publicKey).ok, false);
});

test("a pack signed by another key is rejected", () => {
  const other = generateKeyPairSync("ed25519");
  const pack = packLoadout({ role: "coder" }, other.privateKey);
  assert.equal(importPack(pack, publicKey).ok, false);
});
