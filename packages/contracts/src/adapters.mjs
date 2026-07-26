const ADAPTER_METHODS = Object.freeze({
  project: [
    "listProjects",
    "listReadyTasks",
    "getTask",
    "updateTaskStatus",
    "addTaskComment",
    "attachDelivery",
    "attachVerification",
  ],
  worker: [
    "start",
    "continue",
    "cancel",
    "getUsage",
  ],
  scm: [
    "createWorkBranch",
    "commitArtifacts",
    "pushBranch",
    "openChangeRequest",
    "getChangeRequestStatus",
    "getReviewEvidence",
    "merge",
  ],
  verification: [
    "run",
    "getStatus",
  ],
});

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function adapterMethodNames(kind) {
  return ADAPTER_METHODS[kind] ? [...ADAPTER_METHODS[kind]] : [];
}

export function validateAdapterShape(kind, adapter) {
  const expected = ADAPTER_METHODS[kind];
  if (!expected) return [`unknown adapter kind: ${kind}`];
  if (!isPlainObject(adapter)) return [`${kind} adapter must be a plain object`];

  const errors = [];
  if (typeof adapter.providerId !== "string" || adapter.providerId.trim().length === 0) {
    errors.push(`${kind} adapter.providerId must be a non-empty string`);
  }
  for (const method of expected) {
    if (typeof adapter[method] !== "function") {
      errors.push(`${kind} adapter is missing method ${method}()`);
    }
  }
  return errors;
}

export function assertAdapterShape(kind, adapter) {
  const errors = validateAdapterShape(kind, adapter);
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return adapter;
}
