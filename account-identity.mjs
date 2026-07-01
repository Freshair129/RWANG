// account-identity.mjs — read WHO a login-dir account actually is (email / plan) + whether it's
// really logged in. "live" only meant "not cooling down" — for a login account (codex/claude) that's
// misleading: an empty CODEX_HOME shows no cooldown yet isn't logged in. This reads the CLI's own
// credential file to surface real auth state + identity, WITHOUT ever returning the tokens.
// Best-effort, zero-dependency Node ESM.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, isAbsolute, resolve } from "node:path";

// inline (avoid a circular import with accounts.mjs)
function expandHome(p) {
  if (!p) return p;
  const e = p.replace(/^~(?=[\\/]|$)/, homedir());
  return isAbsolute(e) ? e : resolve(e);
}

// decode a JWT's payload claims (no verification — we only read email/plan from our own local token)
export function decodeJwtClaims(token) {
  try {
    const seg = String(token).split(".")[1];
    if (!seg) return null;
    return JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));
  } catch { return null; }
}

// codex: {dir}/auth.json → tokens.id_token (JWT) carries email + chatgpt_plan_type
function codexIdentity(dir) {
  const f = join(dir, "auth.json");
  if (!existsSync(f)) return { authed: false };
  try {
    const j = JSON.parse(readFileSync(f, "utf8"));
    const claims = decodeJwtClaims(j.tokens?.id_token || j.id_token) || {};
    const planKey = Object.keys(claims).find((k) => /chatgpt_plan_type$/.test(k));
    return {
      authed: !!(j.tokens || j.OPENAI_API_KEY),
      email: claims.email || null,
      plan: (planKey && claims[planKey]) || (j.OPENAI_API_KEY ? "api-key" : null),
    };
  } catch { return { authed: existsSync(f) }; }
}

// claude: {dir}/.credentials.json → claudeAiOauth.subscriptionType / rateLimitTier (no email stored)
function claudeIdentity(dir) {
  const f = join(dir, ".credentials.json");
  if (!existsSync(f)) return { authed: false };
  try {
    const o = JSON.parse(readFileSync(f, "utf8")).claudeAiOauth || {};
    return { authed: !!(o.accessToken || o.subscriptionType), email: null,
      plan: o.subscriptionType || null, tier: o.rateLimitTier || null };
  } catch { return { authed: existsSync(f) }; }
}

// Public: identity for a login-dir account. Unknown providers / no dir → not authed.
export function readLoginIdentity(provider, configDir) {
  if (!configDir) return { authed: false };
  const dir = expandHome(configDir);
  if (provider === "codex") return codexIdentity(dir);
  if (provider === "claude") return claudeIdentity(dir);
  // generic login dir: authed if the dir has any credential-looking file
  return { authed: existsSync(join(dir, "auth.json")) || existsSync(join(dir, ".credentials.json")) };
}
