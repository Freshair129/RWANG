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

// codex: {dir}/auth.json → tokens.id_token (JWT) carries email + chatgpt_plan_type.
// NB: chatgpt_plan_type is nested under the "https://api.openai.com/auth" claim (not top-level),
// alongside the subscription window — so we search claims recursively for it.
function findClaim(o, re, depth = 0) {
  if (!o || typeof o !== "object" || depth > 4) return null;
  for (const [k, v] of Object.entries(o)) {
    if (re.test(k) && v != null && typeof v !== "object") return v;
    if (v && typeof v === "object") { const r = findClaim(v, re, depth + 1); if (r != null) return r; }
  }
  return null;
}
function codexIdentity(dir) {
  const f = join(dir, "auth.json");
  if (!existsSync(f)) return { authed: false };
  try {
    const j = JSON.parse(readFileSync(f, "utf8"));
    const claims = decodeJwtClaims(j.tokens?.id_token || j.id_token) || {};
    const planType = findClaim(claims, /chatgpt_plan_type$/);
    const until = findClaim(claims, /subscription_active_until$/); // ISO date the plan renews/expires
    const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s);
    return {
      authed: !!(j.tokens || j.OPENAI_API_KEY),
      email: claims.email || null,
      plan: planType ? `ChatGPT ${cap(planType)}` : (j.OPENAI_API_KEY ? "api-key" : null),
      tier: until ? `renews ${String(until).slice(0, 10)}` : null,
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
