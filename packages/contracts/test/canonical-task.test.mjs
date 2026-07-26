import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeCanonicalTask,
  normalizeDeliveryRef,
  normalizeVerificationRef,
  validateCanonicalTask,
} from "../src/canonical-task.mjs";

test("normalizeCanonicalTask accepts the CR-24 baseline shape", () => {
  const result = normalizeCanonicalTask({
    taskId: "FE-042",
    source: {
      provider: "linear",
      externalProjectId: "RWANG",
      externalTaskId: "RWG-142",
    },
    project: {
      stage: "implementation",
      priority: "high",
    },
    objective: "Implement ProfileForm validation",
    acceptanceCriteria: ["form rejects invalid email", "form shows validation message"],
    dependencies: ["FE-041"],
    execution: {
      workerProvider: "chatgpt",
      reviewPolicy: "self-review-first",
      verificationProfile: "typescript-standard",
    },
    delivery: {
      scmProvider: "github",
      repository: "Freshair129/govibe",
      branch: null,
      changeRequest: null,
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.taskId, "FE-042");
  assert.equal(result.value.delivery.branch, null);
});

test("validateCanonicalTask reports missing required fields", () => {
  const errors = validateCanonicalTask({
    taskId: "  ",
    source: {},
    execution: {},
    delivery: {},
  });

  assert.ok(errors.includes("taskId must be a non-empty string"));
  assert.ok(errors.includes("source.provider must be a non-empty string"));
  assert.ok(errors.includes("objective must be a non-empty string"));
  assert.ok(errors.includes("delivery.scmProvider must be a non-empty string"));
});

test("normalizeCanonicalTask rejects self-dependency and invalid arrays", () => {
  const result = normalizeCanonicalTask({
    taskId: "TASK-1",
    source: {
      provider: "document",
      externalProjectId: "rw",
      externalTaskId: "TASK-1",
    },
    objective: "Do the thing",
    acceptanceCriteria: "not-an-array",
    dependencies: ["TASK-1"],
    execution: {
      workerProvider: "codex",
      reviewPolicy: "self-review-first",
      verificationProfile: "local-standard",
    },
    delivery: {
      scmProvider: "local-git",
    },
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("acceptanceCriteria must be an array"));
  assert.ok(result.errors.includes("dependencies must not contain taskId itself"));
});

test("normalizeDeliveryRef and normalizeVerificationRef preserve optional nulls", () => {
  const delivery = normalizeDeliveryRef({
    provider: "github",
    repository: "Freshair129/RWANG",
  });
  const verification = normalizeVerificationRef({
    provider: "local",
    status: "passed",
  });

  assert.equal(delivery.ok, true);
  assert.equal(delivery.value.branch, null);
  assert.equal(verification.ok, true);
  assert.equal(verification.value.evidenceUrl, null);
});
