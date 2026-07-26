const NON_EMPTY_STRING_FIELDS = [
  ["taskId", "taskId"],
  ["source.provider", "source.provider"],
  ["source.externalProjectId", "source.externalProjectId"],
  ["source.externalTaskId", "source.externalTaskId"],
  ["objective", "objective"],
  ["execution.workerProvider", "execution.workerProvider"],
  ["execution.reviewPolicy", "execution.reviewPolicy"],
  ["execution.verificationProfile", "execution.verificationProfile"],
  ["delivery.scmProvider", "delivery.scmProvider"],
];

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value, field, errors) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return [];
  }
  const invalid = value.find((item) => typeof item !== "string" || item.trim().length === 0);
  if (invalid !== undefined) {
    errors.push(`${field} must contain only non-empty strings`);
    return [];
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function getPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function validateRequiredStrings(obj, errors) {
  for (const [path, label] of NON_EMPTY_STRING_FIELDS) {
    const value = getPath(obj, path);
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push(`${label} must be a non-empty string`);
    }
  }
}

export function normalizeDeliveryRef(input = {}) {
  const errors = [];
  const value = isPlainObject(input) ? input : {};
  const normalized = {
    provider: typeof value.provider === "string" ? value.provider.trim() : "",
    repository: typeof value.repository === "string" ? value.repository.trim() : "",
    branch: typeof value.branch === "string" && value.branch.trim().length > 0 ? value.branch.trim() : null,
    commit: typeof value.commit === "string" && value.commit.trim().length > 0 ? value.commit.trim() : null,
    changeRequestId: typeof value.changeRequestId === "string" && value.changeRequestId.trim().length > 0 ? value.changeRequestId.trim() : null,
    changeRequestUrl: typeof value.changeRequestUrl === "string" && value.changeRequestUrl.trim().length > 0 ? value.changeRequestUrl.trim() : null,
  };

  if (!normalized.provider) errors.push("delivery.provider must be a non-empty string");
  if (!normalized.repository) errors.push("delivery.repository must be a non-empty string");

  return { ok: errors.length === 0, value: normalized, errors };
}

export function normalizeVerificationRef(input = {}) {
  const errors = [];
  const value = isPlainObject(input) ? input : {};
  const normalized = {
    provider: typeof value.provider === "string" ? value.provider.trim() : "",
    status: typeof value.status === "string" ? value.status.trim() : "",
    verificationId: typeof value.verificationId === "string" && value.verificationId.trim().length > 0 ? value.verificationId.trim() : null,
    evidenceUrl: typeof value.evidenceUrl === "string" && value.evidenceUrl.trim().length > 0 ? value.evidenceUrl.trim() : null,
    logPath: typeof value.logPath === "string" && value.logPath.trim().length > 0 ? value.logPath.trim() : null,
  };

  if (!normalized.provider) errors.push("verification.provider must be a non-empty string");
  if (!normalized.status) errors.push("verification.status must be a non-empty string");

  return { ok: errors.length === 0, value: normalized, errors };
}

export function normalizeCanonicalTask(input = {}) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { ok: false, value: null, errors: ["task must be a plain object"] };
  }

  const normalized = {
    taskId: typeof input.taskId === "string" ? input.taskId.trim() : "",
    source: {
      provider: typeof input.source?.provider === "string" ? input.source.provider.trim() : "",
      externalProjectId: typeof input.source?.externalProjectId === "string" ? input.source.externalProjectId.trim() : "",
      externalTaskId: typeof input.source?.externalTaskId === "string" ? input.source.externalTaskId.trim() : "",
    },
    project: {
      stage: typeof input.project?.stage === "string" && input.project.stage.trim().length > 0 ? input.project.stage.trim() : "unspecified",
      priority: typeof input.project?.priority === "string" && input.project.priority.trim().length > 0 ? input.project.priority.trim() : "unspecified",
    },
    objective: typeof input.objective === "string" ? input.objective.trim() : "",
    acceptanceCriteria: asStringArray(input.acceptanceCriteria, "acceptanceCriteria", errors),
    dependencies: asStringArray(input.dependencies, "dependencies", errors),
    execution: {
      workerProvider: typeof input.execution?.workerProvider === "string" ? input.execution.workerProvider.trim() : "",
      reviewPolicy: typeof input.execution?.reviewPolicy === "string" ? input.execution.reviewPolicy.trim() : "",
      verificationProfile: typeof input.execution?.verificationProfile === "string" ? input.execution.verificationProfile.trim() : "",
    },
    delivery: {
      scmProvider: typeof input.delivery?.scmProvider === "string" ? input.delivery.scmProvider.trim() : "",
      repository: typeof input.delivery?.repository === "string" && input.delivery.repository.trim().length > 0 ? input.delivery.repository.trim() : null,
      branch: typeof input.delivery?.branch === "string" && input.delivery.branch.trim().length > 0 ? input.delivery.branch.trim() : null,
      changeRequest: typeof input.delivery?.changeRequest === "string" && input.delivery.changeRequest.trim().length > 0 ? input.delivery.changeRequest.trim() : null,
    },
  };

  validateRequiredStrings(normalized, errors);
  if (normalized.dependencies.includes(normalized.taskId)) {
    errors.push("dependencies must not contain taskId itself");
  }

  return { ok: errors.length === 0, value: normalized, errors };
}

export function validateCanonicalTask(input = {}) {
  return normalizeCanonicalTask(input).errors;
}
