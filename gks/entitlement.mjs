// gks/entitlement.mjs — device-bound license token (guard--entitlement).
// Ed25519-signed token bound to a deviceId, with a tier and an offline grace window.
// Uses node:crypto (built-in, zero external dependency). The license tier feeds the
// cost-cap ceiling (config--cost-cap-tiers); marketplace/storefront is deferred.

import { sign, verify } from "node:crypto";

/** Issue a signed token. claims: { deviceId, tier, exp (ms epoch), graceMs }. */
export function issueToken(claims, privateKey) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = sign(null, Buffer.from(payload), privateKey).toString("base64url");
  return `${payload}.${sig}`;
}

/** Verify a token. Returns { ok, tier?, deviceId?, withinGrace?, reason? }. */
export function verifyToken(token, publicKey, { now = Date.now(), deviceId } = {}) {
  const parts = String(token).split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed token" };
  const [payload, sig] = parts;

  let good = false;
  try { good = verify(null, Buffer.from(payload), publicKey, Buffer.from(sig, "base64url")); } catch { good = false; }
  if (!good) return { ok: false, reason: "bad signature" };

  let claims;
  try { claims = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return { ok: false, reason: "bad payload" }; }

  if (deviceId && claims.deviceId !== deviceId) return { ok: false, reason: "device mismatch" };

  if (claims.exp && now > claims.exp) {
    const within = claims.graceMs != null && now <= claims.exp + claims.graceMs;
    if (!within) return { ok: false, reason: "expired" };
    return { ok: true, tier: claims.tier, deviceId: claims.deviceId, withinGrace: true };
  }
  return { ok: true, tier: claims.tier, deviceId: claims.deviceId, withinGrace: false };
}
