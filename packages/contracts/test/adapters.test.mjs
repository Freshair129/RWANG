import test from "node:test";
import assert from "node:assert/strict";

import {
  adapterMethodNames,
  assertAdapterShape,
  validateAdapterShape,
} from "../src/adapters.mjs";

test("adapterMethodNames returns the required project adapter surface", () => {
  assert.deepEqual(adapterMethodNames("project"), [
    "listProjects",
    "listReadyTasks",
    "getTask",
    "updateTaskStatus",
    "addTaskComment",
    "attachDelivery",
    "attachVerification",
  ]);
});

test("validateAdapterShape accepts a complete worker adapter", () => {
  const errors = validateAdapterShape("worker", {
    providerId: "codex",
    start() {},
    continue() {},
    cancel() {},
    getUsage() {},
  });

  assert.deepEqual(errors, []);
});

test("assertAdapterShape throws when required methods are missing", () => {
  assert.throws(
    () => assertAdapterShape("scm", {
      providerId: "github",
      createWorkBranch() {},
    }),
    /commitArtifacts\(\)/
  );
});

test("validateAdapterShape rejects unknown kinds", () => {
  const errors = validateAdapterShape("mystery", {});
  assert.deepEqual(errors, ["unknown adapter kind: mystery"]);
});
