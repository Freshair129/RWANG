// account-identity.test.mjs — real auth state + identity for login-dir accounts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeJwtClaims, readLoginIdentity } from "./account-identity.mjs";

function jwt(claims) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64(claims)}.sig`;
}

test("decodeJwtClaims reads the payload; bad input → null", () => {
  assert.equal(decodeJwtClaims(jwt({ email: "x@y.com" })).email, "x@y.com");
  assert.equal(decodeJwtClaims("garbage"), null);
  assert.equal(decodeJwtClaims(""), null);
});

test("codex: empty dir = not logged in; auth.json = authed + email + plan", () => {
  const empty = mkdtempSync(join(tmpdir(), "cdx-empty-"));
  assert.equal(readLoginIdentity("codex", empty).authed, false); // the exact bug: empty dir isn't 'live'

  const dir = mkdtempSync(join(tmpdir(), "cdx-"));
  writeFileSync(join(dir, "auth.json"), JSON.stringify({
    tokens: { id_token: jwt({ email: "me@gmail.com", "https://api.openai.com/auth.chatgpt_plan_type": "plus" }) },
  }));
  const id = readLoginIdentity("codex", dir);
  assert.equal(id.authed, true);
  assert.equal(id.email, "me@gmail.com");
  assert.equal(id.plan, "plus");
});

test("claude: .credentials.json → authed + subscription plan + tier", () => {
  const dir = mkdtempSync(join(tmpdir(), "cla-"));
  writeFileSync(join(dir, ".credentials.json"), JSON.stringify({
    claudeAiOauth: { accessToken: "sk-ant-xxx", subscriptionType: "max", rateLimitTier: "tier-3" },
  }));
  const id = readLoginIdentity("claude", dir);
  assert.equal(id.authed, true);
  assert.equal(id.plan, "max");
  assert.equal(id.tier, "tier-3");
});

test("no configDir / unknown provider → not authed (never throws)", () => {
  assert.equal(readLoginIdentity("codex", null).authed, false);
  assert.equal(readLoginIdentity("weird", "/nonexistent/dir").authed, false);
});
