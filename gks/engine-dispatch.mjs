// gks/engine-dispatch.mjs — bind autonomas' injected `dispatchWave` to the engine's REAL
// worker + Verify Gate (engine.executeWithReview). This is the "engine CLI wiring" follow-up from
// REPORT--AUTONOMOUS-ENGINE-P0: the autoloop was unit-tested with mocks; this makes it run for real.
//
// Contract expected by gks/autoloop.mjs:
//   dispatchWave(leaves, round) -> [{ leaf, review:{issues:[{severity}]}, ok, status? }]
//
// The engine records the reviewer's issue list into the async knowledge store (not into state), so
// we can't read the exact issues back synchronously after dispatch. We therefore derive the review
// from the FINAL dispatch status — which carries the only decision the gate needs:
//   done         -> passed the Verify Gate            -> no issues (ok)
//   needs-rework  -> reviewer rejected (or rework cap) -> critical issue (fails the gate, triggers refine)
//   reviewing     -> reviewer itself unusable         -> major issue (not a clean pass)
//   failed/other  -> worker failed                    -> critical issue
// Injectable `engine` keeps this unit-testable without booting the real engine.
// Zero-dependency Node ESM.

import * as EngineDefault from "../engine.mjs";

export function statusToReview(status) {
  if (status === "done") return { issues: [], verdict: "pass" };
  if (status === "reviewing") {
    return { issues: [{ severity: "major", area: "review", detail: "reviewer unavailable (reviewing)" }], verdict: "fail" };
  }
  return { issues: [{ severity: "critical", area: "correctness", detail: `dispatch status: ${status}` }], verdict: "fail" };
}

// costRemaining() bound to the engine's session cost vs the active cap → governs autonomy so the
// loop stops on cost-cap exactly like runPool does. Returns Infinity if no cap / snapshot fails.
export function engineCostRemaining(engine = EngineDefault) {
  try {
    const snap = engine.snapshot();
    const cap = snap.usageLimits?.sessionUsd;
    if (cap == null) return Infinity;
    return cap - (snap.usage?.session?.cost || 0);
  } catch { return Infinity; }
}

// Build the async dispatchWave. Sequential dispatch (not runPool's concurrency) so each leaf's cost
// is realized before the next — keeps the cost-cap guard tight during an autonomous run.
export function makeEngineDispatch({ engine = EngineDefault, worker = "auto-loop", onLog = () => {} } = {}) {
  return async function dispatchWave(leaves, round) {
    const out = [];
    for (const leaf of leaves || []) {
      const id = leaf?.id;
      const task = id ? engine.byId(id) : null;
      if (!task) {
        onLog(`skip leaf ${id ?? "?"} — not a backlog atom`);
        out.push({ leaf, review: { issues: [] }, ok: true, skipped: true });
        continue;
      }
      const model = engine.modelFor(task, engine.loadState());
      if (model == null) {
        onLog(`skip ${id} — manual / no model`);
        out.push({ leaf, review: { issues: [] }, ok: true, skipped: true });
        continue;
      }
      // Retry across rounds: a leaf left failed/needs-rework/active by a prior round must be
      // released to `todo` before this round can re-dispatch it (else claim is blocked forever).
      const curStatus = engine.loadState?.().tasks?.[id]?.status;
      if (curStatus && !["todo", "done"].includes(curStatus)) { try { engine.setStatus?.(id, "todo"); } catch { /* */ } }
      const w = `${worker}-r${round}`;
      const c = engine.claim(id, w);
      if (c && c.ok === false) {
        onLog(`claim ${id} blocked: ${c.error}`);
        // a leaf that could not even be dispatched is a hard failure (critical), never a silent pass
        out.push({ leaf, review: { issues: [{ severity: "critical", area: "dispatch", detail: c.error }] }, ok: false });
        continue;
      }
      let status;
      try {
        status = await engine.executeWithReview(engine.byId(id), model, w);
      } catch (e) {
        onLog(`dispatch ${id} threw: ${e.message}`);
        out.push({ leaf, review: { issues: [{ severity: "critical", area: "dispatch", detail: e.message }] }, ok: false });
        continue;
      }
      onLog(`${id} → ${status}`);
      out.push({ leaf, review: statusToReview(status), ok: status === "done", status });
    }
    return out;
  };
}
