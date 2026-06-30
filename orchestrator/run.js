// run.js — Rwang autonomous runner (Claude Code Workflow script).
//
// WHAT THIS IS
//   The control plane for Rwang: given a SPEC and a TARGET repo, it drives the
//   proven VERIFY -> AUTHOR -> REVIEW -> ASSEMBLE loop with model-tier routing
//   (local Ollama -> cloud open-weights -> Claude), a hard verify gate, and a
//   two-way cost ledger. It is the autonomous sibling of the `tiered-swarm`
//   skill, ported to run end-to-end without per-task human prompts.
//
// HOW IT RUNS
//   Workflow({ scriptPath: "G:/Rwang/orchestrator/run.js",
//              args: { specPath, targetRepo, autonomy, runDir } })
//
//   args.specPath   : path to the spec (YAML/JSON task list) Rwang routes.
//   args.targetRepo : the repo the work is DONE in (e.g. G:/GenesisBlock_Dev/GenesisBlock).
//   args.autonomy   : "supervised" | "autonomous" | "unattended".
//   args.runDir     : G:/Rwang/runs/<runId>  — progress.ndjson + progress.json live here.
//
// WORKFLOW SCRIPTING CONSTRAINTS (why this file looks the way it does)
//   * Pure JS. NO fs / Bash / Node APIs in the script body.
//   * NO Date.now() / Math.random() / argless new Date() — they THROW here.
//     => every timestamp + every filesystem/shell/progress write happens INSIDE
//        an agent() call (agents have tools); the body only orchestrates.
//   * Must begin with `export const meta = {...}` as a pure literal.
//   * Hooks available: agent(prompt,opts), parallel(thunks), pipeline(items,...stages),
//     phase(title), log(msg), and the global `args`.
//
// TWO-AXIS MODEL (capability tier  ⟂  role specialist)
//   T0   local-SLM         vibethinker-3b
//   T1   local-mid         aroow-rust-coder-9b (Rust) / mellum2-12b-a2.5b (general)
//   T1.5 cloud-open-wt     kimi-k2.7-code:cloud / deepseek-v4-pro:cloud
//   T2   claude-sonnet-4-6 (opts.model = "sonnet")
//   T3   claude-opus-4-8   (opts.model = "opus")
//   The router is a ROLE, not a tier. HARD RULE: a task with no machine-checkable
//   verify_command is NOT cheap-eligible -> it floors at T2. Local-first is allowed
//   ONLY behind a verify gate (FrugalGPT: route cheap iff p_fail < c_frontier/c_fix).
//
// SAFETY INVARIANTS (never yield to autonomy — enforced below, see // GATE: comments)
//   (1) No external write (push/PR/merge/deploy) without human approval.
//   (2) No unverified cheap output crosses a phase boundary (the verify gate is the interlock).
//   (3) A task that exhausts the escalation ladder HALTS the run; it never loops forever.
//   (4) Every run is on a branch, never directly on the target default branch.

export const meta = {
  name: "rwang-autonomous-runner",
  description:
    "Spec-driven, tier-routed VERIFY->AUTHOR->REVIEW->ASSEMBLE runner with a verify " +
    "gate, escalation ladder (T0->T1->T1.5->T2->T3), two-way cost ledger, and " +
    "autonomy gates (supervised|autonomous|unattended). Drives a target repo on a branch.",
  phases: ["Route", "Execute", "Review"],
};

// ---------------------------------------------------------------------------
// The full escalation ladder, cheap -> frontier. Used to compute the next rung.
// ---------------------------------------------------------------------------
const LADDER = ["T0", "T1", "T1.5", "T2", "T3"];

// Map a capability tier to the agent runtime: local tiers shell out to Ollama via
// orchestrator/ollama_route.sh; Claude tiers run AS a Claude agent of that model.
function isLocalTier(tier) {
  return tier === "T0" || tier === "T1" || tier === "T1.5";
}
function claudeModelFor(tier) {
  if (tier === "T2") return "sonnet";
  if (tier === "T3") return "opus";
  return undefined; // local tiers: no Claude model; agent drives ollama_route.sh
}
function nextRung(tier) {
  const i = LADDER.indexOf(tier);
  if (i < 0 || i >= LADDER.length - 1) return null; // already at T3 (or unknown) => no rung
  return LADDER[i + 1];
}

// JSON schema the Route agent must return — one routed task per element.
const ROUTE_SCHEMA = {
  type: "object",
  properties: {
    epic_dod: { type: "string" },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          description: { type: "string" },
          tier: { type: "string" },            // computed_tier from route.py (T0..T3)
          executor_model: { type: "string" },  // concrete model tag for that tier
          verify_command: { type: "string" },  // "" when none (=> not cheap-eligible)
          depends_on: { type: "array", items: { type: "string" } },
          review_gate: { type: "boolean" },
          human_review: { type: "boolean" },   // true => surfaces, never auto-run
        },
        required: ["id", "description", "tier", "executor_model", "verify_command", "depends_on"],
      },
    },
  },
  required: ["epic_dod", "tasks"],
};

// JSON schema each Execute agent returns after attempting + verifying a task.
const EXEC_SCHEMA = {
  type: "object",
  properties: {
    pass: { type: "boolean" },
    verify_exit: { type: "number" },       // 0 == pass; gate reads THIS, not prose
    summary: { type: "string" },
    local_tokens: { type: "number" },      // Ollama prompt_eval_count + eval_count (rate 0)
    billed_estimate: { type: "number" },   // est. USD on Claude tiers; 0 for local
    needs_external_write: { type: "boolean" }, // push/PR/merge/deploy detected
  },
  required: ["pass", "verify_exit", "summary", "local_tokens", "billed_estimate"],
};

// ---------------------------------------------------------------------------
// Build the prompt that makes one agent EXECUTE a task at a given tier in the
// target repo and then RUN its verify_command. Local vs Claude differ only in
// how the authoring step is performed; the verify gate is identical.
// ---------------------------------------------------------------------------
function executePrompt(task, tier, model, runDir, attemptNo, escalated) {
  const local = isLocalTier(tier);
  const localBlock = local
    ? [
        `This is a LOCAL tier (${tier}). Do the authoring/work via the local model:`,
        `  bash orchestrator/ollama_route.sh ${model} "<your fully-specified prompt>"`,
        `(run from the Rwang dir G:/Rwang). It prints the response text plus`,
        `prompt_eval_count + eval_count — SUM those two into local_tokens. billed_estimate=0.`,
        `Apply the model's output as concrete edits in the target repo yourself.`,
      ].join("\n")
    : [
        `This is a CLAUDE tier (${tier}, model=${model}). Do the authoring/work DIRECTLY`,
        `as this Claude agent — read the relevant files, make the edits. Set local_tokens=0`,
        `and put a rough USD self-estimate in billed_estimate.`,
      ].join("\n");

  return [
    `RWANG TASK EXECUTION — task "${task.id}" at tier ${tier}${escalated ? " (ESCALATED)" : ""}.`,
    ``,
    `TARGET REPO (do ALL work here): ${args.targetRepo}`,
    `RWANG DIR (scripts live here):   G:/Rwang`,
    `RUN DIR (progress files):        ${runDir}`,
    ``,
    `Task: ${task.description}`,
    `verify_command: ${task.verify_command ? task.verify_command : "(none)"}`,
    ``,
    localBlock,
    ``,
    `// GATE (invariant 4): work ONLY on a feature branch in the target repo, never on`,
    `// its default branch. If you are on the default branch, create/checkout a run branch`,
    `// (e.g. rwang/<runId>) FIRST. Do not commit/push — that is an external write.`,
    ``,
    `// GATE (invariant 2): after editing, RUN the verify_command in ${args.targetRepo} and`,
    `// capture its real exit code. Report verify_exit = that integer (0 == pass). Do NOT`,
    `// claim pass without having actually run it. If there is no verify_command, you cannot`,
    `// self-certify cheaply — this task should already be floored to T2+; report verify_exit`,
    `// = 0 only after an equivalent Claude-grade check and explain it in summary.`,
    ``,
    `// GATE (invariant 1): if completing this task requires an EXTERNAL WRITE`,
    `// (git push, opening a PR, merge, deploy, publishing a package), DO NOT perform it.`,
    `// Set needs_external_write=true, pass=false, and explain in summary; the runner will`,
    `// surface it for human approval.`,
    ``,
    `After running verify, append a live progress event by calling (from G:/Rwang):`,
    `  python orchestrator/progress.py ${runDir} event --task ${task.id} \\`,
    `    --status <pass|fail|escalate|blocked|running> --tier ${tier} --model ${model} \\`,
    `    --cost <billed_estimate-usd> --note "<one line>"`,
    `Use --status running BEFORE the work and the pass/fail status AFTER verify.`,
    `(attempt #${attemptNo} for this task.)`,
    ``,
    `Return ONLY the JSON for the schema: pass, verify_exit, summary, local_tokens,`,
    `billed_estimate, needs_external_write.`,
  ].join("\n");
}

// Run one task through the escalation ladder. Returns a terminal result object.
// This is the heart of the verify gate + FrugalGPT escalation.
async function runTaskWithEscalation(task, runDir) {
  // Autonomy interlock: a human_review-flagged task is surfaced, never auto-run.
  if (task.human_review === true) {
    log(`[human_review] task ${task.id} flagged for a human — surfacing, not executing.`);
    await agent(
      [
        `Record that task "${task.id}" is flagged human_review and was NOT auto-executed.`,
        `From G:/Rwang run:`,
        `  python orchestrator/progress.py ${runDir} event --task ${task.id} ` +
          `--status blocked --tier ${task.tier} --model ${task.executor_model} ` +
          `--cost 0 --note "human_review flag: requires a human; not auto-run"`,
        `Return a one-line confirmation.`,
      ].join("\n"),
      { label: `surface-human-review:${task.id}`, phase: "Execute" }
    );
    return { id: task.id, terminal: "blocked", reason: "human_review" };
  }

  let tier = task.tier;          // starting rung from the router (already >= safety floor)
  let model = task.executor_model;
  let attempt = 0;

  // ESCALATION LADDER: T0 -> T1 -> T1.5 -> T2 -> T3. Climb on verify failure only.
  while (true) {
    attempt += 1;
    const escalated = attempt > 1;
    const claudeModel = claudeModelFor(tier);

    const res = await agent(
      executePrompt(task, tier, model, runDir, attempt, escalated),
      {
        label: `exec:${task.id}@${tier}`,
        phase: "Execute",
        model: claudeModel,       // sonnet/opus for T2/T3; undefined => default agent drives Ollama
        isolation: "default",
        schema: EXEC_SCHEMA,
      }
    );

    // Invariant 1: an external write halts this task for human approval immediately.
    if (res && res.needs_external_write === true) {
      log(`[autonomy] task ${task.id} needs an external write — surfacing for human approval.`);
      return {
        id: task.id,
        terminal: "blocked",
        reason: "needs_external_write",
        summary: res.summary,
      };
    }

    const passed = res && res.pass === true && res.verify_exit === 0;
    if (passed) {
      log(`[pass] task ${task.id} verified at ${tier} (exit 0).`);
      return {
        id: task.id,
        terminal: "passed",
        tier,
        model,
        summary: res.summary,
        local_tokens: res.local_tokens || 0,
        billed_estimate: res.billed_estimate || 0,
      };
    }

    // Verify FAILED at this rung. Compute the next rung.
    const up = nextRung(tier);
    if (up === null) {
      // Invariant 3: ladder exhausted even at T3 -> HALT, never loop forever.
      log(`[blocked] task ${task.id} FAILED verify even at T3 — halting run (gate-exhaustion).`);
      return {
        id: task.id,
        terminal: "blocked",
        reason: "gate_exhaustion",
        summary: res ? res.summary : "verify failed at T3",
      };
    }

    // Record the escalation as a live event, then climb one rung and retry.
    log(`[escalate] task ${task.id} ${tier} -> ${up} (verify_exit=${res ? res.verify_exit : "?"}).`);
    await agent(
      [
        `Record an escalation for task "${task.id}": ${tier} -> ${up}. From G:/Rwang run:`,
        `  python orchestrator/progress.py ${runDir} event --task ${task.id} ` +
          `--status escalate --tier ${tier} --model ${model} --cost 0 ` +
          `--note "verify failed at ${tier}; climbing to ${up}"`,
        `Return a one-line confirmation.`,
      ].join("\n"),
      { label: `escalate:${task.id}:${tier}->${up}`, phase: "Execute" }
    );

    tier = up;
    // Re-derive the concrete executor for the new rung. Keep aroow for Rust at T1.
    if (tier === "T1") {
      const rusty = /cargo|\.rs\b|rust/i.test(
        `${task.description} ${task.verify_command || ""}`
      );
      model = rusty ? "aroow-rust-coder-9b" : "mellum2-12b-a2.5b";
    } else if (tier === "T0") {
      model = "vibethinker-3b";
    } else if (tier === "T1.5") {
      model = "kimi-k2.7-code:cloud";
    } else if (tier === "T2") {
      model = "claude-sonnet-4-6";
    } else if (tier === "T3") {
      model = "claude-opus-4-8";
    }
  }
}

// ---------------------------------------------------------------------------
// MAIN — the autonomous loop.
// ---------------------------------------------------------------------------
export default async function run() {
  const specPath = args.specPath;
  const targetRepo = args.targetRepo;
  const autonomy = args.autonomy || "autonomous"; // supervised|autonomous|unattended
  const runDir = args.runDir;

  log(`Rwang run starting. spec=${specPath} target=${targetRepo} autonomy=${autonomy} runDir=${runDir}`);

  // =========================================================================
  // PHASE 1 — Route. One agent reads the spec, runs the deterministic router,
  // and initializes the shared progress files. The router is a ROLE (zero-VRAM,
  // rules-first) — it never sends work to a model.
  // =========================================================================
  phase("Route");

  const routed = await agent(
    [
      `RWANG ROUTE — you are the routing ROLE (deterministic, no model work).`,
      ``,
      `1) Read the spec at: ${specPath}`,
      `2) From G:/Rwang, run the deterministic tier router and capture its JSON:`,
      `     python orchestrator/route.py ${specPath} --json`,
      `   Each element has {id, cheap_eligible, computed_tier, executor_model, reasons,`,
      `   spec_tier_hint, disagrees_with_spec}. The HARD RULE is already applied by route.py:`,
      `   a task with NO verify_command is NOT cheap-eligible and floors at T2.`,
      `3) Read the spec yourself to recover each task's description, verify_command (may be`,
      `   ""), depends_on (array of task ids), review_gate (bool), and any human_review flag.`,
      `   Also distill the EPIC definition-of-done (epic_dod) — the run-level acceptance.`,
      `4) Build the routed task list by joining route.py output (tier=computed_tier,`,
      `   executor_model) with the spec fields. Any task whose work is an external write`,
      `   (push/PR/merge/deploy) OR is explicitly human-gated -> set human_review=true.`,
      ``,
      `5) Initialize the shared progress files. From G:/Rwang, write the tasks JSON to`,
      `   ${runDir}/tasks.json (status omitted; progress.py sets all to pending), then run:`,
      `     python orchestrator/progress.py ${runDir} init --spec "${specPath}" \\`,
      `       --target "${targetRepo}" --autonomy "${autonomy}" \\`,
      `       --epic "<epic_dod>" --tasks ${runDir}/tasks.json`,
      `   This creates ${runDir}/progress.json (status=running, all tasks pending, phases`,
      `   Route/Execute/Review) and starts ${runDir}/progress.ndjson.`,
      ``,
      `Return ONLY the JSON for the schema: epic_dod, and tasks[] with`,
      `{id, description, tier, executor_model, verify_command, depends_on, review_gate, human_review}.`,
    ].join("\n"),
    { label: "route", phase: "Route", model: "sonnet", schema: ROUTE_SCHEMA }
  );

  const tasks = (routed && routed.tasks) || [];
  log(`Routed ${tasks.length} task(s). epic_dod="${(routed && routed.epic_dod) || ""}"`);

  // SUPERVISED autonomy: in a real supervised run the harness would pause for a
  // human ack before each phase. We mark the boundary explicitly so the operator
  // sees it in the log; autonomous/unattended drive straight through.
  if (autonomy === "supervised") {
    log(`[supervised] Route complete. (A supervisor would approve before Execute.)`);
  }

  // Build the dependency layers: independent tasks run in PARALLEL, dependents WAIT.
  // We topologically batch tasks into "waves" by depends_on so pipeline()/parallel()
  // can express "this wave's tasks are independent; the next wave depends on it".
  const byId = {};
  for (const t of tasks) byId[t.id] = t;
  const done = {};
  const waves = [];
  let remaining = tasks.slice();
  let guard = 0;
  while (remaining.length > 0 && guard < tasks.length + 2) {
    guard += 1;
    const ready = remaining.filter((t) =>
      (t.depends_on || []).every((d) => done[d] === true || byId[d] === undefined)
    );
    if (ready.length === 0) {
      // Dependency cycle or a dep on an unknown id that never completes.
      log(`[warn] dependency stall — ${remaining.length} task(s) have unmet deps; ` +
        `running them as a final wave to avoid a livelock.`);
      waves.push(remaining);
      for (const t of remaining) done[t.id] = true;
      remaining = [];
      break;
    }
    waves.push(ready);
    for (const t of ready) done[t.id] = true;
    const readyIds = new Set(ready.map((t) => t.id));
    remaining = remaining.filter((t) => !readyIds.has(t.id));
  }

  // =========================================================================
  // PHASE 2 — Execute. Drive waves in order; within a wave, tasks run in
  // parallel (deps already satisfied). The verify gate + escalation ladder live
  // in runTaskWithEscalation. If any task goes terminal=blocked, we STOP the run
  // (invariants 1/3): we do not start later waves.
  // =========================================================================
  phase("Execute");

  let runBlocked = false;
  let blockedTask = null;
  const results = [];

  for (let w = 0; w < waves.length; w++) {
    if (runBlocked) break;
    const wave = waves[w];
    log(`Execute wave ${w + 1}/${waves.length}: [${wave.map((t) => t.id).join(", ")}]`);

    // parallel() over the independent tasks in this wave.
    const waveResults = await parallel(
      wave.map((t) => () => runTaskWithEscalation(t, runDir))
    );

    for (const r of waveResults) {
      results.push(r);
      if (r.terminal === "blocked") {
        // Invariant 1 (external write) / 3 (gate-exhaustion) / human_review all
        // funnel here: surface and STOP the run. Never loop, never skip the gate.
        runBlocked = true;
        blockedTask = r;
        log(`[STOP] run blocked by task ${r.id} (reason=${r.reason}).`);
      }
    }
  }

  // =========================================================================
  // PHASE 3 — Review. A T3 (opus) agent adversarially reviews the ASSEMBLED
  // changes against the epic DoD — this is the final verify gate for output that
  // crosses to the human. Even if we are blocked, we review what landed so the
  // human gets a real assessment, not just a halt.
  // =========================================================================
  phase("Review");

  const reviewSummary = await agent(
    [
      `RWANG ADVERSARIAL REVIEW (tier T3 / opus). Review the ASSEMBLED changes in the`,
      `target repo against the epic definition-of-done.`,
      ``,
      `TARGET REPO: ${targetRepo}`,
      `EPIC DoD:    ${(routed && routed.epic_dod) || "(none captured)"}`,
      `RUN STATUS:  ${runBlocked ? "BLOCKED at task " + (blockedTask && blockedTask.id) : "all waves attempted"}`,
      ``,
      `Inspect the working tree (git diff/status in ${targetRepo}), re-run the most`,
      `load-bearing verify_command(s) if cheap, and look adversarially for: unverified`,
      `claims, regressions, missed acceptance criteria, and anything that should have been`,
      `human_review. Be skeptical of any cheap-tier output that crossed a phase boundary —`,
      `confirm its verify actually passed.`,
      ``,
      `// GATE (invariant 1): do NOT commit/push/merge. Review only. In "unattended" mode a`,
      `// human still merges — your job is to certify, not to ship.`,
      ``,
      `Return a concise prose verdict: PASS or NEEDS-WORK, the strongest concern, and whether`,
      `the epic DoD is met.`,
    ].join("\n"),
    { label: "adversarial-review", phase: "Review", model: "opus", isolation: "default" }
  );

  // Terminal status: blocked if any task halted us, else done.
  const terminalStatus = runBlocked ? "blocked" : "done";

  // Final agent writes the terminal progress.json status so the monitor settles.
  await agent(
    [
      `Finalize the Rwang run. From G:/Rwang run:`,
      `  python orchestrator/progress.py ${runDir} finish --status ${terminalStatus}`,
      `This flips ${runDir}/progress.json status to "${terminalStatus}" and stamps updated_at.`,
      `Return a one-line confirmation of the final status.`,
    ].join("\n"),
    { label: "finalize", phase: "Review" }
  );

  log(`Rwang run ${terminalStatus}. ${results.filter((r) => r.terminal === "passed").length}/` +
    `${tasks.length} task(s) passed.`);

  // Return value (Workflow result object).
  return {
    runDir,
    spec: specPath,
    target_repo: targetRepo,
    autonomy,
    status: terminalStatus,
    epic_dod: (routed && routed.epic_dod) || "",
    tasks_total: tasks.length,
    tasks_passed: results.filter((r) => r.terminal === "passed").length,
    blocked_task: blockedTask ? { id: blockedTask.id, reason: blockedTask.reason } : null,
    review: typeof reviewSummary === "string" ? reviewSummary : (reviewSummary && reviewSummary.summary) || "",
    note:
      "Claude pricing in the ledger is the 2026-06-04 snapshot (UNCERTAINTY FLAG); " +
      "re-verify rates before billing.",
  };
}
