export const CAPS = Object.freeze({
  FILE_EDIT: "file_edit",
  SHELL_EXEC: "shell_exec",
  CODE_REVIEW: "code_review",
  TEXT_GEN: "text_gen",
  STREAMING: "streaming",
  VISION: "vision",
  LONG_CONTEXT: "long_context",
  SANDBOX: "sandbox",
  IMAGE_GEN: "image_gen",
});

const KNOWN_PREFIXES = new Set([
  "claude",
  "ollama",
  "llamacpp",
  "codex",
  "openrouter",
  "antigravity",
  "openai-image",
  "local-image",
  "openrouter-image",
]);

const LOCAL_PROVIDERS = new Set(["ollama", "llamacpp", "local-image"]);

export function parseModel(model) {
  if (!model || typeof model !== "string") return null;
  const idx = model.indexOf(":");
  if (idx > 0) {
    const prefix = model.slice(0, idx);
    if (KNOWN_PREFIXES.has(prefix)) return { provider: prefix, model: model.slice(idx + 1) };
    if (prefix === "ollama") return { provider: "ollama", model: model.slice(7) };
  }
  return { provider: "claude", model };
}

export function isLocalProvider(providerName) {
  return LOCAL_PROVIDERS.has(providerName);
}

export function isAllowedUnderMode(pref, costMode = "normal") {
  if (!costMode || costMode === "normal") return true;
  const parsed = parseModel(pref);
  if (!parsed) return false;
  if (LOCAL_PROVIDERS.has(parsed.provider)) return true;
  if (costMode === "free" && (parsed.provider === "openrouter" || parsed.provider === "openrouter-image")) {
    return /:free$/i.test(parsed.model || "");
  }
  return false;
}

export function resolveForRole(roleName, config, preferLocal = false, { costMode = "normal" } = {}) {
  const role = config.roles?.[roleName];
  if (!role?.preferred?.length) return null;
  let prefs = role.preferred;
  if (preferLocal) {
    prefs = [...role.preferred].sort((a, b) => {
      const aLocal = LOCAL_PROVIDERS.has(parseModel(a)?.provider);
      const bLocal = LOCAL_PROVIDERS.has(parseModel(b)?.provider);
      return (bLocal ? 1 : 0) - (aLocal ? 1 : 0);
    });
  }
  prefs = prefs.filter((pref) => isAllowedUnderMode(pref, costMode));
  for (const pref of prefs) {
    const parsed = parseModel(pref);
    if (!parsed) continue;
    const providerDef = config.providers?.[parsed.provider];
    if (!providerDef || providerDef.enabled === false) continue;
    const required = role.requires || [];
    const caps = providerDef.capabilities || [];
    if (required.every((capability) => caps.includes(capability))) {
      return { ...parsed, roleName };
    }
  }
  return null;
}
