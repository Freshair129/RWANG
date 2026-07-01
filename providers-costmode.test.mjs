// providers-costmode.test.mjs — free/local cost-mode gate on role resolution.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedUnderMode, resolveForRole } from "./providers.mjs";

test("isAllowedUnderMode: normal allows all", () => {
  for (const m of ["claude:opus", "codex:o4-mini", "ollama:x", "openrouter:foo", "openai-image:gpt-image-1"])
    assert.equal(isAllowedUnderMode(m, "normal"), true);
});

test("isAllowedUnderMode: local = local providers only", () => {
  assert.equal(isAllowedUnderMode("ollama:x", "local"), true);
  assert.equal(isAllowedUnderMode("local-image:default", "local"), true);
  assert.equal(isAllowedUnderMode("claude:opus", "local"), false);
  assert.equal(isAllowedUnderMode("openrouter:meta/llama:free", "local"), false); // network -> not local
});

test("isAllowedUnderMode: free = local + OpenRouter :free only", () => {
  assert.equal(isAllowedUnderMode("ollama:x", "free"), true);
  assert.equal(isAllowedUnderMode("openrouter:meta-llama/llama-3.1-8b-instruct:free", "free"), true);
  assert.equal(isAllowedUnderMode("openrouter:anthropic/claude-sonnet-4", "free"), false); // paid OR model
  assert.equal(isAllowedUnderMode("claude:opus", "free"), false);
  assert.equal(isAllowedUnderMode("openai-image:gpt-image-1", "free"), false);
});

const CFG = {
  providers: {
    claude: { enabled: true, capabilities: ["file_edit", "code_review"] },
    ollama: { enabled: true, capabilities: ["text_gen", "file_edit", "code_review"] },
    openrouter: { enabled: true, capabilities: ["text_gen"] },
  },
  roles: {
    coder: { requires: ["file_edit"], preferred: ["claude:sonnet", "ollama:coder-local"] },
    reviewer: { requires: ["code_review"], preferred: ["claude:opus", "ollama:reviewer-local"] },
    scout: { requires: ["text_gen"], preferred: ["openrouter:google/gemma-3-27b", "openrouter:meta/llama:free", "ollama:scout-local"] },
  },
};

test("resolveForRole honors cost-mode on the fallback chain", () => {
  // normal -> first enabled (cloud)
  assert.equal(resolveForRole("coder", CFG).provider, "claude");
  // free/local -> skip claude, land on the local ollama
  assert.equal(resolveForRole("coder", CFG, false, { costMode: "free" }).provider, "ollama");
  assert.equal(resolveForRole("coder", CFG, false, { costMode: "local" }).provider, "ollama");
  // reviewer resolves locally under free/local (ollama has code_review here)
  assert.equal(resolveForRole("reviewer", CFG, false, { costMode: "local" }).model, "reviewer-local");
});

test("free mode picks an OpenRouter :free model before the local fallback; local skips it", () => {
  const free = resolveForRole("scout", CFG, false, { costMode: "free" });
  assert.equal(free.provider, "openrouter");
  assert.equal(free.model, "meta/llama:free"); // the paid gemma-3-27b is filtered out
  const local = resolveForRole("scout", CFG, false, { costMode: "local" });
  assert.equal(local.provider, "ollama"); // even the :free OR model is excluded offline
});
