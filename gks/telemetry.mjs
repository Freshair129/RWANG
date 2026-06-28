// gks/telemetry.mjs — opt-in, off-by-default health telemetry (audit--telemetry).
// Allowlist = anonymous health counters ONLY (app version, crash, feature-used). NEVER
// code/spec/atom content or provider payloads. Zero-dependency Node ESM.

export const TELEMETRY_ALLOWLIST = new Set(["app.version", "app.crash", "feature.used"]);
// only these scalar fields ever leave the box; everything else is stripped.
const SAFE_FIELDS = ["version", "feature", "count"];

export function createTelemetry({ enabled = false, allowlist = TELEMETRY_ALLOWLIST, sink } = {}) {
  const buffer = [];

  function record(event, fields = {}) {
    if (!enabled) return { recorded: false, reason: "telemetry disabled (opt-in, off by default)" };
    if (!allowlist.has(event)) return { recorded: false, reason: `event '${event}' not on the health allowlist` };
    const safe = { event };
    for (const k of SAFE_FIELDS) {
      const v = fields[k];
      if (typeof v === "string" || typeof v === "number") safe[k] = v;
    }
    buffer.push(safe);
    if (sink) sink(safe);
    return { recorded: true, rec: safe };
  }

  function flush() { return buffer.splice(0); }

  return { record, flush, get size() { return buffer.length; } };
}
