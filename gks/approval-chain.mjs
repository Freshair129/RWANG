// gks/approval-chain.mjs — multi-role DACI approval state machine (algo--approval-chain).
// Layered ON TOP of the hard pre-dispatch gate (guard--governance-gate); harvested from GoVibe
// STD-Execution-Governance. The chain for a given complexity is a subset of the steps, in order.
// Zero-dependency Node ESM.

const STEP = {
  SCOPE:         { role: "ARCHON", verdicts: ["APPROVED", "NEEDS_REVISION", "ADR_REQUIRED"] },
  DOC_REVIEW:    { role: "ATHER",  verdicts: ["COMPLIANT", "DRIFT", "NON-COMPLIANT"] },
  FEASIBILITY:   { role: "RKOI",   verdicts: ["PASS", "REVISION", "FAIL"] },
  ARCH_APPROVAL: { role: "ARCHON", verdicts: ["APPROVED", "NEEDS_REVISION", "ADR_REQUIRED"] },
  QA:            { role: "GHOST",  verdicts: ["VERIFIED", "REJECTED"] },
  AUDIT:         { role: "ATHER",  verdicts: ["COMPLIANT", "DRIFT", "NON-COMPLIANT"] },
};
const PASS = new Set(["APPROVED", "COMPLIANT", "PASS", "VERIFIED"]);

/** Build the ordered step list for a classification. C-0/C-1 are light; C-3 (or H4-H6) is full. */
export function buildChain({ complexity = "C-1", tier = "H1" } = {}) {
  const c = String(complexity).toUpperCase();
  const high = c === "C-3" || ["H4", "H5", "H6"].includes(tier);
  const steps = [];
  if (c === "C-2" || c === "C-3") steps.push("SCOPE", "DOC_REVIEW", "FEASIBILITY");
  if (high) steps.push("ARCH_APPROVAL");
  steps.push("QA");
  if (c === "C-2" || c === "C-3") steps.push("AUDIT");
  return steps.map((k) => ({ step: k, ...STEP[k] }));
}

/**
 * Run the chain. decide(step, ctx) -> a verdict string. For C-2/C-3 a missing approved
 * source doc blocks at intake (the "no source doc -> BLOCKED" rule).
 * @returns { ok, blockedAt?, reason?, verdicts: [{step, role, verdict, pass}] }
 */
export function runChain(classification = {}, decide, ctx = {}) {
  const c = String(classification.complexity || "C-1").toUpperCase();
  if ((c === "C-2" || c === "C-3") && !ctx.sourceDoc) {
    return { ok: false, blockedAt: "INTAKE", reason: "no approved source doc (required for C-2/C-3)", verdicts: [] };
  }
  const chain = buildChain(classification);
  const verdicts = [];
  for (const s of chain) {
    const verdict = decide(s, ctx);
    const pass = PASS.has(String(verdict).toUpperCase());
    verdicts.push({ step: s.step, role: s.role, verdict, pass });
    if (!pass) return { ok: false, blockedAt: s.step, reason: `${s.role} returned ${verdict}`, verdicts };
  }
  return { ok: true, verdicts };
}

/**
 * Feed a chain result into the hard governance gate (guard--governance-gate / engine.mjs
 * needsConfirm+isConfirmed) WITHOUT bypassing it. The DACI chain is advisory only: it can
 * make the gate STRICTER (recommend "block" on any chain failure) but it can NEVER flip a
 * gated atom to confirmed — `autoConfirm` is always false, so a human confirm stays required.
 * The engine's setStatus(running) check is unchanged; this just supplies evidence to it.
 *
 * @param {{ok:boolean, blockedAt?:string, reason?:string, verdicts:Array}} chainResult runChain output
 * @param {{gated?:boolean}} atom  whether the governance gate flags this atom (needsConfirm === true)
 * @returns {{recommend:"confirm"|"block", autoConfirm:false, requiresHumanConfirm:boolean,
 *            chainPassed:boolean, blockedAt?:string, reason?:string, evidence:Array}}
 */
export function feedGate(chainResult = {}, atom = {}) {
  const chainPassed = chainResult.ok === true;
  return {
    // chain may only ADD a stop; a pass is a recommendation, never an authorization
    recommend: chainPassed ? "confirm" : "block",
    autoConfirm: false,                 // the hard gate is never bypassed — a human still confirms
    requiresHumanConfirm: atom.gated === true,
    chainPassed,
    blockedAt: chainResult.blockedAt,
    reason: chainResult.reason,
    evidence: chainResult.verdicts || [],
  };
}
