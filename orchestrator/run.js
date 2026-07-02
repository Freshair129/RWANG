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
    "Spec-driven, tier-routed VERIFY->AUTHOR->REVIEW->ASSEMBLE runner with a verify gate, escalation ladder (T0->T1->T1.5->T2->T3), two-way cost ledger, and autonomy gates (supervised|autonomous|unattended). Drives a target repo on a branch.",
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
    governance_lint_exit: { type: "number" }, // exit code of governance_lint.py (0 = matrix proven)
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
        required: ["id", "description", "tier", "executor_model", "verify_command", "depends_on",
                   "review_gate", "human_review"],
      },
    },
  },
  required: ["governance_lint_exit", "epic_dod", "tasks"],
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
    `TARGET REPO (do ALL work here): ${CFG.targetRepo}`,
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
    `// GATE (invariant 2): after editing, RUN the verify_command in ${CFG.targetRepo} and`,
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

// JSON schema the Execute-rehydrate agent returns when a phase is launched
// standalone (no in-memory routed list) — reconstructs state from disk.
const REHYDRATE_SCHEMA = {
  type: "object",
  properties: {
    governance_lint_exit: { type: "number" }, // lint re-runs at Execute entry (resume path)
    epic_dod: { type: "string" },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          description: { type: "string" },
          tier: { type: "string" },
          executor_model: { type: "string" },
          verify_command: { type: "string" },
          depends_on: { type: "array", items: { type: "string" } },
          review_gate: { type: "boolean" },
          human_review: { type: "boolean" },
          status: { type: "string" },   // pending|running|passed|escalated|failed|blocked
        },
        required: ["id", "description", "tier", "executor_model", "verify_command",
                   "depends_on", "review_gate", "human_review", "status"],
      },
    },
  },
  required: ["governance_lint_exit", "tasks"],
};

// Topologically batch tasks into dependency "waves": independent tasks in a wave
// run in parallel; a later wave waits on earlier ones. Extracted so both the
// autonomous chain and a standalone Execute phase build waves identically.
function buildWaves(tasks) {
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
      // Dependency cycle or a dep on an unknown id: run the rest as a final wave.
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
  return waves;
}

// ---------------------------------------------------------------------------
// PHASE FUNCTIONS. Each rehydrates from disk, does ONE phase, writes its
// terminal status via progress.py, and returns. State lives ONLY on disk
// (progress.json + tasks.json) so a phase can run standalone or be chained.
// ---------------------------------------------------------------------------

// PHASE: Route. Runs the deterministic router, writes durable tasks.json, inits
// the progress files, then marks phase_done:route. The router is a ROLE — it
// never sends work to a model.
async function phaseRoute() {
  phase("Route");
  const specPath = CFG.specPath, targetRepo = CFG.targetRepo, runDir = CFG.runDir;
  const autonomy = CFG.autonomy || "autonomous";

  const routed = await agent(
    [
      `RWANG ROUTE — you are the routing ROLE (deterministic, no model work).`,
      ``,
      `0) GOVERNANCE LINT — hard gate before anything else. From G:/Rwang run:`,
      `     python orchestrator/governance/governance_lint.py --stamp "${runDir}"`,
      `   and record its exit code as governance_lint_exit. (--stamp also writes`,
      `   ${runDir}/governance_lint.json — the durable report later phases check.)`,
      `   If the exit code is NON-ZERO: STOP HERE — skip steps 1-6 entirely`,
      `   (no route.py, no progress init) and return`,
      `   {"governance_lint_exit": <code>, "epic_dod": "", "tasks": []}.`,
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
      `5) Initialize the shared progress files. From G:/Rwang, write the DURABLE tasks JSON`,
      `   to ${runDir}/tasks.json (status omitted; progress.py sets all to pending) — this`,
      `   file is the source-of-truth a standalone Execute phase rehydrates from — then run:`,
      `     python orchestrator/progress.py ${runDir} init --spec "${specPath}" \\`,
      `       --target "${targetRepo}" --autonomy "${autonomy}" \\`,
      `       --epic "<epic_dod>" --tasks ${runDir}/tasks.json`,
      `6) Mark the phase complete. From G:/Rwang run:`,
      `     python orchestrator/progress.py ${runDir} phase-done --phase route`,
      ``,
      `Return ONLY the JSON for the schema: epic_dod, and tasks[] with`,
      `{id, description, tier, executor_model, verify_command, depends_on, review_gate, human_review}.`,
    ].join("\n"),
    { label: "route", phase: "Route", model: "sonnet", schema: ROUTE_SCHEMA }
  );

  // GOVERNANCE GATE (G6/GP1): the decision is made HERE in code, not in the prompt.
  // A broken Governance Matrix (missing guard / failing guard_test) means no run starts.
  if (!routed || routed.governance_lint_exit !== 0) {
    const code = routed ? routed.governance_lint_exit : "?";
    log(`[governance] lint exit=${code} — refusing to start (fix orchestrator/governance/ first).`);
    throw new Error(
      `RWANG: governance_lint failed (exit ${code}) — no new run starts while the ` +
      `Governance Matrix is broken. Run: python orchestrator/governance/governance_lint.py`
    );
  }

  const n = (routed && routed.tasks && routed.tasks.length) || 0;
  log(`Routed ${n} task(s). epic_dod="${(routed && routed.epic_dod) || ""}"`);
  return routed || { epic_dod: "", tasks: [] };
}

// PHASE: Execute. If `routed` is null (standalone/resume), rehydrate the task
// list + per-task status from disk (FR-2). Tasks already `passed` are SKIPPED
// (FR-4 idempotent resume). On the first blocked task, later waves do not start.
async function phaseExecute(routed) {
  phase("Execute");
  const runDir = CFG.runDir;

  let tasks, epic_dod;
  if (routed && routed.tasks) {
    tasks = routed.tasks;
    epic_dod = routed.epic_dod || "";
  } else {
    const re = await agent(
      [
        `RWANG EXECUTE REHYDRATE — reconstruct run state from DISK only (no memory).`,
        `0) GOVERNANCE LINT re-check (the matrix may have broken since Route). From`,
        `   G:/Rwang run:  python orchestrator/governance/governance_lint.py --stamp "${runDir}"`,
        `   and record its exit code as governance_lint_exit. If NON-ZERO: STOP —`,
        `   return {"governance_lint_exit": <code>, "epic_dod": "", "tasks": []}.`,
        `From G:/Rwang, read ${runDir}/tasks.json (the durable routed task list) and`,
        `${runDir}/progress.json (for each task's current status and the epic_dod).`,
        `Return epic_dod and tasks[] joining the two: each task {id, description, tier,`,
        `executor_model, verify_command, depends_on, review_gate, human_review, status},`,
        `where status is the progress.json task status (pending|running|passed|escalated|`,
        `failed|blocked). Return ONLY the schema JSON.`,
      ].join("\n"),
      { label: "rehydrate", phase: "Execute", model: "sonnet", schema: REHYDRATE_SCHEMA }
    );
    // GOVERNANCE GATE at Execute entry too (M3): resume/standalone must not bypass G6.
    if (!re || re.governance_lint_exit !== 0) {
      const code = re ? re.governance_lint_exit : "?";
      log(`[governance] lint exit=${code} at Execute entry — refusing to continue.`);
      throw new Error(
        `RWANG: governance_lint failed (exit ${code}) at Execute rehydrate — ` +
        `fix orchestrator/governance/ before resuming this run.`
      );
    }
    tasks = (re && re.tasks) || [];
    epic_dod = (re && re.epic_dod) || "";
  }

  const waves = buildWaves(tasks);
  let runBlocked = false;
  let blockedTask = null;
  const results = [];

  for (let w = 0; w < waves.length; w++) {
    if (runBlocked) break;
    const wave = waves[w];
    // FR-4: an already-passed task is not re-run — resume continues where it stopped.
    const todo = wave.filter((t) => t.status !== "passed");
    const skipped = wave.filter((t) => t.status === "passed");
    for (const s of skipped) {
      log(`[skip] task ${s.id} already passed — not re-running.`);
      results.push({ id: s.id, terminal: "passed", skipped: true });
    }
    log(`Execute wave ${w + 1}/${waves.length}: run [${todo.map((t) => t.id).join(", ")}]` +
      (skipped.length ? ` skip [${skipped.map((t) => t.id).join(", ")}]` : ""));

    const waveResults = await parallel(
      todo.map((t) => () => runTaskWithEscalation(t, runDir))
    );
    for (const r of waveResults) {
      results.push(r);
      if (r.terminal === "blocked") {
        runBlocked = true;
        blockedTask = r;
        log(`[STOP] run blocked by task ${r.id} (reason=${r.reason}).`);
      }
    }
  }

  if (!runBlocked) {
    await agent(
      [
        `Mark the Execute phase complete. From G:/Rwang run:`,
        `  python orchestrator/progress.py ${runDir} phase-done --phase execute`,
        `Return a one-line confirmation.`,
      ].join("\n"),
      { label: "phase-done:execute", phase: "Execute" }
    );
  }
  return { tasks, epic_dod, results, runBlocked, blockedTask };
}

// PHASE: Review. A T3/opus agent adversarially reviews the assembled changes vs
// the epic DoD. If epic_dod is falsy (standalone), it is read from progress.json.
// Ends by marking phase_done:review (review-only — never commits/pushes).
async function phaseReview(epic_dod, runBlocked, blockedTask) {
  phase("Review");
  const runDir = CFG.runDir, targetRepo = CFG.targetRepo;

  const reviewSummary = await agent(
    [
      `RWANG ADVERSARIAL REVIEW (tier T3 / opus). Review the ASSEMBLED changes in the`,
      `target repo against the epic definition-of-done.`,
      ``,
      `TARGET REPO: ${targetRepo}`,
      `EPIC DoD:    ${epic_dod || `(read it from ${runDir}/progress.json .epic_dod)`}`,
      `RUN STATUS:  ${runBlocked ? "BLOCKED at task " + (blockedTask && blockedTask.id) : "all waves attempted"}`,
      ``,
      `Inspect the working tree (git diff/status in ${targetRepo}), re-run the most`,
      `load-bearing verify_command(s) if cheap, and look adversarially for: unverified`,
      `claims, regressions, missed acceptance criteria, and anything that should have been`,
      `human_review. Be skeptical of any cheap-tier output that crossed a phase boundary —`,
      `confirm its verify actually passed.`,
      ``,
      `// GATE (invariant 1): do NOT commit/push/merge. Review only. In "unattended" mode the`,
      `// commit-to-branch is a SEPARATE gated phase and a human still merges.`,
      ``,
      `Then, from G:/Rwang, run:`,
      `  python orchestrator/progress.py ${runDir} phase-done --phase review`,
      ``,
      `Return a concise prose verdict: PASS or NEEDS-WORK, the strongest concern, and whether`,
      `the epic DoD is met.`,
    ].join("\n"),
    { label: "adversarial-review", phase: "Review", model: "opus", isolation: "default" }
  );
  return reviewSummary;
}

// PHASE: Commit (unattended ONLY). Commits verified work to the CURRENT feature
// branch of the target repo (never the default branch), then sets awaiting_merge.
// INVARIANT 1/4: branch-only — never push / open a PR / merge / deploy; the human
// always owns the merge. The commit agent aborts if it is on the default branch.
async function phaseCommit() {
  phase("Review");
  const runDir = CFG.runDir, targetRepo = CFG.targetRepo;
  const autonomy = CFG.autonomy || "autonomous";
  // Hard guard: the commit phase is reachable ONLY in unattended mode.
  if (autonomy !== "unattended") {
    log(`[commit] skipped — commit phase is reachable only in unattended mode.`);
    return { status: "skipped", reason: "not-unattended" };
  }
  const res = await agent(
    [
      `RWANG UNATTENDED COMMIT (branch-only). Commit the verified work to the CURRENT`,
      `feature branch of the target repo, then record awaiting_merge.`,
      `TARGET REPO (do the git work here): ${targetRepo}`,
      ``,
      `// GATE (invariants 1 & 4): this is a BRANCH-ONLY local commit. You MUST NOT push,`,
      `// open a PR, merge, or deploy, and MUST NOT commit on the repository's default`,
      `// branch. The human always owns the merge.`,
      ``,
      `Steps (run git inside ${targetRepo}):`,
      `1) Read the current branch and the default branch. If the current branch IS the`,
      `   default branch (e.g. main/master), STOP: do NOT commit. Set needs_external_write`,
      `   in your summary and return — the run stays blocked for a human. Otherwise continue.`,
      `2) Stage and commit ONLY on this feature branch — no push, no merge, no PR:`,
      `     git add -A`,
      `     git commit -m "rwang(unattended): verified work for run ${runDir}"`,
      `   (If there is nothing to commit, say so; that is fine — treat it as a no-op.)`,
      `3) From G:/Rwang, record the boundary so a human can merge:`,
      `     python orchestrator/progress.py ${runDir} finish --status awaiting_merge`,
      ``,
      `Return a one-line confirmation: the branch name, the short commit sha (or "no-op"),`,
      `and that the run is awaiting a human merge.`,
    ].join("\n"),
    { label: "unattended-commit", phase: "Review" }
  );
  return { status: "awaiting_merge", detail: typeof res === "string" ? res : "" };
}

// ---------------------------------------------------------------------------
// MAIN — the dispatcher. With args.phase, run exactly ONE phase and return
// (FR-1) — the external driver decides what runs next. With no phase, chain the
// phases per autonomy level: supervised pauses after Route (it cannot block
// in-body), autonomous/unattended drive straight through.
// ---------------------------------------------------------------------------
// --- Top-level workflow body. The Workflow runtime wraps and runs this directly
// (top-level await + return are supported); the phase functions above are plain
// declarations. This file is a Workflow script, NOT a node ESM module — do not
// wrap the body in `export default function` (the runtime rejects the 2nd export).
// The Workflow runtime may deliver `args` as a JSON STRING rather than an object
// (observed: args arrived as raw JSON text, so args.specPath was undefined and
// Object.keys(args) returned character indices). Normalize once, up front —
// everything below reads CFG, never the raw global `args`.
const CFG = typeof args === "string" ? JSON.parse(args)
          : (args && typeof args === "object" ? args : {});

// Fail fast on missing args instead of routing literal "undefined" paths (which
// spawns agents that write garbage to an `undefined/` dir). Cheap: no agents.
if (!CFG.specPath || !CFG.targetRepo || !CFG.runDir) {
  log(`[fatal] missing required args — got keys: ${JSON.stringify(Object.keys(CFG))}`);
  return { status: "failed", reason: "missing-args",
    received: { specPath: CFG.specPath, targetRepo: CFG.targetRepo, runDir: CFG.runDir, keys: Object.keys(CFG) } };
}

const autonomy = CFG.autonomy || "autonomous";
const runDir = CFG.runDir;
const requested = CFG.phase; // "route"|"execute"|"review"|"commit"|undefined

  log(`Rwang run. spec=${CFG.specPath} target=${CFG.targetRepo} ` +
    `autonomy=${autonomy} runDir=${runDir} phase=${requested || "(all)"}`);

  // ---- Single-phase invocation: do exactly one phase, then return. ----
  if (requested) {
    if (requested === "route") {
      const routed = await phaseRoute();
      return { runDir, phase: "route", status: "phase_done:route",
        epic_dod: routed.epic_dod || "", tasks_total: (routed.tasks || []).length };
    }
    if (requested === "execute") {
      const ex = await phaseExecute(null);
      return { runDir, phase: "execute",
        status: ex.runBlocked ? "blocked" : "phase_done:execute",
        tasks_total: ex.tasks.length,
        tasks_passed: ex.results.filter((r) => r.terminal === "passed").length,
        blocked_task: ex.blockedTask ? { id: ex.blockedTask.id, reason: ex.blockedTask.reason } : null };
    }
    if (requested === "review") {
      const review = await phaseReview("", false, null);
      return { runDir, phase: "review", status: "phase_done:review",
        review: typeof review === "string" ? review : (review && review.summary) || "" };
    }
    if (requested === "commit") {
      const c = await phaseCommit();
      return { runDir, phase: "commit", status: c.status };
    }
    throw new Error(`RWANG: unknown CFG.phase "${requested}" (route|execute|review|commit).`);
  }

  // ---- No phase given: chain per autonomy level. ----
  const routed = await phaseRoute();

  // SUPERVISED cannot pause mid-body, so it stops after Route with an approval
  // gate; the session driver resumes by launching phase=execute after approval.
  if (autonomy === "supervised") {
    await agent(
      [
        `Set the supervised approval gate. From G:/Rwang run:`,
        `  python orchestrator/progress.py ${runDir} gate --phase execute --await`,
        `Return a one-line confirmation.`,
      ].join("\n"),
      { label: "gate:execute", phase: "Route" }
    );
    log(`[supervised] paused after Route — awaiting human approval to Execute.`);
    return { runDir, spec: CFG.specPath, target_repo: CFG.targetRepo, autonomy,
      status: "awaiting_approval", awaiting: { phase: "execute" },
      epic_dod: routed.epic_dod || "",
      note: "supervised pause — the session driver resumes via phase=execute after approval." };
  }

  // AUTONOMOUS / UNATTENDED: drive straight through.
  const ex = await phaseExecute(routed);
  const review = await phaseReview(ex.epic_dod, ex.runBlocked, ex.blockedTask);

  let terminalStatus = ex.runBlocked ? "blocked" : "done";
  if (!ex.runBlocked && autonomy === "unattended") {
    await phaseCommit();                 // branch-only; sets awaiting_merge itself
    terminalStatus = "awaiting_merge";
  }

  if (terminalStatus !== "awaiting_merge") {
    await agent(
      [
        `Finalize the Rwang run. From G:/Rwang run:`,
        `  python orchestrator/progress.py ${runDir} finish --status ${terminalStatus}`,
        `This flips ${runDir}/progress.json status to "${terminalStatus}" and stamps updated_at.`,
        `Return a one-line confirmation of the final status.`,
      ].join("\n"),
      { label: "finalize", phase: "Review" }
    );
  }

  log(`Rwang run ${terminalStatus}. ${ex.results.filter((r) => r.terminal === "passed").length}/` +
    `${ex.tasks.length} task(s) passed.`);

  return {
    runDir,
    spec: CFG.specPath,
    target_repo: CFG.targetRepo,
    autonomy,
    status: terminalStatus,
    epic_dod: ex.epic_dod || "",
    tasks_total: ex.tasks.length,
    tasks_passed: ex.results.filter((r) => r.terminal === "passed").length,
    blocked_task: ex.blockedTask ? { id: ex.blockedTask.id, reason: ex.blockedTask.reason } : null,
    review: typeof review === "string" ? review : (review && review.summary) || "",
    note:
      "Claude pricing in the ledger is the 2026-06-04 snapshot (UNCERTAINTY FLAG); " +
      "re-verify rates before billing.",
  };
