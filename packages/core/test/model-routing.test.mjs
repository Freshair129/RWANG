import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPS,
  parseModel,
  isLocalProvider,
  isAllowedUnderMode,
  resolveForRole,
} from "../src/model-routing.mjs";

test("CAPS exposes stable capability tags", () => {
  assert.equal(CAPS.FILE_EDIT, "file_edit");
  assert.equal(CAPS.IMAGE_GEN, "image_gen");
});

test("parseModel supports provider-prefixed and legacy model strings", () => {
  assert.deepEqual(parseModel("claude:opus"), { provider: "claude", model: "opus" });
  assert.deepEqual(parseModel("sonnet"), { provider: "claude", model: "sonnet" });
  assert.deepEqual(parseModel("ollama:gemma4-rust-coder:latest"), {
    provider: "ollama",
    model: "gemma4-rust-coder:latest",
  });
});

test("isLocalProvider and isAllowedUnderMode enforce local/free gating", () => {
  assert.equal(isLocalProvider("ollama"), true);
  assert.equal(isLocalProvider("claude"), false);
  assert.equal(isAllowedUnderMode("claude:opus", "local"), false);
  assert.equal(isAllowedUnderMode("ollama:gemma4", "local"), true);
  assert.equal(isAllowedUnderMode("openrouter:google/gemma-3n-e4b-it:free", "free"), true);
  assert.equal(isAllowedUnderMode("openrouter:anthropic/claude-sonnet-4", "free"), false);
});

test("resolveForRole honors capability checks and preferLocal ordering", () => {
  const config = {
    roles: {
      coder: {
        preferred: ["claude:sonnet", "ollama:gemma4"],
        requires: ["file_edit"],
      },
    },
    providers: {
      claude: {
        enabled: true,
        capabilities: ["file_edit", "text_gen"],
      },
      ollama: {
        enabled: true,
        capabilities: ["file_edit", "text_gen"],
      },
    },
  };

  assert.deepEqual(resolveForRole("coder", config), {
    provider: "claude",
    model: "sonnet",
    roleName: "coder",
  });
  assert.deepEqual(resolveForRole("coder", config, true), {
    provider: "ollama",
    model: "gemma4",
    roleName: "coder",
  });
  assert.deepEqual(resolveForRole("coder", config, false, { costMode: "local" }), {
    provider: "ollama",
    model: "gemma4",
    roleName: "coder",
  });
});
