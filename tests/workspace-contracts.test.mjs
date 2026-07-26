import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import * as Contracts from "@rwang/contracts";
import * as Core from "@rwang/core";

test("contracts boundary exposes the canonical task and adapter APIs", () => {
  assert.equal(typeof Contracts.normalizeCanonicalTask, "function");
  assert.equal(typeof Contracts.validateCanonicalTask, "function");
  assert.equal(typeof Contracts.normalizeDeliveryRef, "function");
  assert.equal(typeof Contracts.normalizeVerificationRef, "function");
  assert.equal(typeof Contracts.adapterMethodNames, "function");
  assert.equal(typeof Contracts.validateAdapterShape, "function");
  assert.equal(typeof Contracts.assertAdapterShape, "function");
});

test("core boundary exposes reusable model-routing APIs without runtime rewiring", () => {
  assert.equal(typeof Core.CAPS, "object");
  assert.equal(typeof Core.parseModel, "function");
  assert.equal(typeof Core.isLocalProvider, "function");
  assert.equal(typeof Core.isAllowedUnderMode, "function");
  assert.equal(typeof Core.resolveForRole, "function");
});

test("package manifests expose only the implemented package entrypoints", async () => {
  const contractsPackage = JSON.parse(await readFile(
    new URL("../packages/contracts/package.json", import.meta.url),
    "utf8"
  ));
  const corePackage = JSON.parse(await readFile(
    new URL("../packages/core/package.json", import.meta.url),
    "utf8"
  ));

  assert.deepEqual(contractsPackage.exports, {
    ".": "./src/index.mjs",
    "./canonical-task": "./src/canonical-task.mjs",
    "./adapters": "./src/adapters.mjs",
  });
  assert.deepEqual(corePackage.exports, {
    ".": "./src/index.mjs",
    "./model-routing": "./src/model-routing.mjs",
  });
});
