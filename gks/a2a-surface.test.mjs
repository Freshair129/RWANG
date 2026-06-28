// gks/a2a-surface.test.mjs — acceptance for protocol--a2a-surface.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAgentCard, toA2AState, fromA2AState, a2aProvider, A2A_SKILLS } from "./a2a-surface.mjs";

test("the Agent Card has the A2A-required fields + skills", () => {
  const card = buildAgentCard({ url: "http://localhost:4577" });
  for (const k of ["name", "url", "version", "capabilities", "skills"]) assert.ok(k in card, `missing ${k}`);
  assert.ok(card.skills.length >= 1);
});

test("engine states map onto A2A task states", () => {
  assert.equal(toA2AState("running"), "working");
  assert.equal(toA2AState("done"), "completed");
  assert.equal(toA2AState("failed"), "failed");
  assert.equal(toA2AState("reviewing"), "input-required");
});

test("A2A states map back to engine states", () => {
  assert.equal(fromA2AState("completed"), "done");
  assert.equal(fromA2AState("working"), "running");
});

test("a remote agent card becomes a registry provider with transport a2a", () => {
  const p = a2aProvider(buildAgentCard({ url: "http://peer:9000" }));
  assert.equal(p.transport, "a2a");
  assert.equal(p.url, "http://peer:9000");
  assert.deepEqual(p.capabilities, A2A_SKILLS.map((s) => s.id));
});
