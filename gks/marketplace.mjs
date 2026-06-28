// gks/marketplace.mjs — signed loadout-pack import seam (feature--marketplace-seam).
// v1 ships ONLY the signed sideload import path (storefront/payments deferred). Reuses the
// ed25519 sign/verify from entitlement.mjs. Zero external dependency (node:crypto).
import { issueToken, verifyToken } from "./entitlement.mjs";

/** Sign a loadout pack into a portable, verifiable artifact. */
export function packLoadout(loadout, privateKey, { author = "unknown", exp = null } = {}) {
  const claims = { kind: "loadout-pack", author, loadout };
  if (exp) claims.exp = exp;
  return issueToken(claims, privateKey);
}

/** Import + verify a signed pack. Returns { ok, loadout?, author?, reason? }. */
export function importPack(pack, publicKey, { now = Date.now() } = {}) {
  const v = verifyToken(pack, publicKey, { now });
  if (!v.ok) return { ok: false, reason: v.reason };
  let payload;
  try { payload = JSON.parse(Buffer.from(String(pack).split(".")[0], "base64url").toString()); }
  catch { return { ok: false, reason: "bad payload" }; }
  if (payload.kind !== "loadout-pack") return { ok: false, reason: "not a loadout pack" };
  return { ok: true, loadout: payload.loadout, author: payload.author };
}
