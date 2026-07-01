#!/usr/bin/env node
/**
 * G-Maiden Multi-Agent Orchestrator — CLI
 * (logic อยู่ใน engine.mjs ซึ่ง server.mjs ใช้ร่วมกัน)
 *
 *   node orchestrator.mjs status | next | graph [--mermaid]
 *   node orchestrator.mjs claim <id> [-w name] | release <id> | done <id> | fail <id>
 *   node orchestrator.mjs assign <id> <model> | reset
 *   node orchestrator.mjs run [--max N] [--execute] [-w name]
 */
import { join } from "node:path";
import * as E from "./engine.mjs";
import { runAutonomous, stopAutonomous } from "./auto-wave.mjs";
import { accountsStatus, DEFAULT_STATE_PATH } from "./accounts.mjs";
import { autonomasAsync } from "./gks/autoloop.mjs";
import { makeEngineDispatch, engineCostRemaining } from "./gks/engine-dispatch.mjs";
import { assignTier } from "./planner.mjs";
import { decompose } from "./gks/adaptive-decompose.mjs";
import { classifyVerdict } from "./gks/verify-gate.mjs";
import { scoreGoldset } from "./gks/goldset.mjs";
import { writeNode, writeEdge } from "./store/knowledge.mjs";

const ACTIVE = E.ACTIVE;

// ── auto-loop: the closed autonomous loop (PLAN→BUILD→TEST→BENCH→refine), engine-bound ──
// Dry-run shows the decomposition + tiers; --execute runs the governed loop for real (stops on
// target / plateau / round-cap / cost-cap; checkpoints every round so a crash resumes).
async function cmdAutoLoop(goalId, { target, maxRounds, execute, executor }) {
  const goal = E.byId(goalId);
  if (!goal) { console.error(`ERROR: ไม่พบ atom '${goalId}' ใน backlog`); process.exitCode = 1; return; }

  let leaves = [];
  try { leaves = decompose(goal, { executorCapability: executor, assignTier }) || []; }
  catch (e) { console.error("ERROR: decompose ล้ม — " + e.message); process.exitCode = 1; return; }

  console.log(`\n  🔁 auto-loop: ${goalId} — "${goal.title}"`);
  console.log(`  executor=${executor} · decompose → ${leaves.length} leaf(s):`);
  for (const l of leaves) {
    const real = !!E.byId(l.id);
    let tier = "?"; try { tier = JSON.stringify(assignTier(l)); } catch { /* */ }
    console.log(`    - ${l.id.padEnd(18)} tier=${tier}${real ? "" : "  ⚠ synthetic (not a backlog atom → skipped in dispatch)"}`);
  }

  if (!execute) {
    console.log(`\n  DRY-RUN. ใส่ --execute เพื่อรันจริง (ปล่อยต่อเนื่องจนถึง target/plateau/cost-cap — ใช้โทเค็นจริง).\n`);
    return;
  }

  const runDir = join(E.PATHS.LOGS, "auto-loop", goalId.replace(/[^\w.-]/g, "_"));
  // traceability: record each round + link it to the goal via the knowledge store (best-effort)
  const store = {
    recordOutcome: (o) => writeNode(E.CONFIG, { id: `${o.goal}#r${o.round}`, labels: ["AutoloopRound"],
      props: { status: o.status, score: o.score, round: o.round, goal: o.goal }, text: `autoloop ${o.goal} round ${o.round} → ${o.status}` }).catch(() => {}),
    linkTrace: (from, to, meta) => writeEdge(E.CONFIG, { from, to, rel: meta?.rel || "refined_in_round" }).catch(() => {}),
  };
  const gateCtx = {
    reviewEnabled: E.CONFIG.review?.enabled !== false,
    atCap: engineCostRemaining(E) <= 0, offline: false, governance: false, workerTier: "local",
  };
  const dispatchWave = makeEngineDispatch({ engine: E, worker: "auto-loop", onLog: (m) => console.log("  " + m) });

  console.log(`\n  ▶ EXECUTE auto-loop — target=${target} max-rounds=${maxRounds} · cost-cap governs (Ctrl+C to stop)\n`);
  const res = await autonomasAsync(goal, {
    assignTier, decompose, classifyVerdict, scoreGoldset, dispatchWave,
    store, labels: [], executorCapability: executor, runDir, gateCtx,
  }, { target, maxRounds, costRemaining: () => engineCostRemaining(E) });

  console.log(`\n  === auto-loop done ===`);
  console.log(`  stop: ${res.stopReason}${res.done ? " ✅ target-met" : ""} · rounds: ${res.rounds} · best score: ${res.score}`);
  console.log(`  checkpoint: ${join(runDir, "autoloop.checkpoint.json")}\n`);
}

function cmdAccounts() {
  const rows = accountsStatus(E.CONFIG, DEFAULT_STATE_PATH);
  if (!rows.length) { console.log("  (no provider has registered accounts)"); return; }
  for (const r of rows) {
    console.log(`\n  ${r.provider}  ·  rotation=${r.rotation}`);
    for (const a of r.accounts) {
      const st = a.live ? "● live" : `○ cooldown ${Math.ceil(a.cooldownMs / 60000)}m`;
      console.log(`    ${a.id.padEnd(12)} ${st.padEnd(16)} uses=${a.uses}  tokens=${a.tokens}  cost=$${(a.cost || 0).toFixed(4)}`);
    }
  }
}

function bar(done, total, w = 40) { const f = Math.round((done / total) * w); return "[" + "█".repeat(f) + "░".repeat(w - f) + "]"; }
function arg(flags, def) { for (const f of flags) { const i = process.argv.indexOf(f); if (i >= 0) return process.argv[i + 1] ?? true; } return def; }
function out(r) { if (r && r.ok === false) { console.error("ERROR: " + r.error); process.exitCode = 1; } return r; }

function cmdStatus() {
  const snap = E.snapshot();
  const { done, total, pct } = snap.progress;
  console.log(`\n  G-Maiden Orchestrator — ${done}/${total} done (${pct}%)`);
  console.log("  " + bar(done, total) + "\n");
  console.log("  สถานะ: " + Object.entries(snap.counts).map(([k, v]) => `${k}=${v}`).join("  "));
  const ready = snap.tasks.filter((t) => t.ready).length;
  const blocked = snap.tasks.filter((t) => t.status === "todo" && !t.depsDone).length;
  console.log(`  ready: ${ready}   blocked: ${blocked}` + (snap.reaped ? `   reclaimed: ${snap.reaped}` : "") + "\n");
  for (const t of snap.tasks) {
    const tag = t.status === "done" ? "✓" : ACTIVE.has(t.status) ? "▶" : t.ready ? "○" : t.status === "failed" ? "✗" : "·";
    const who = t.worker ? ` @${t.worker}` : "";
    console.log(`  ${tag} ${t.id.padEnd(5)} [${(t.model || "manual").padEnd(6)}] ${t.status.padEnd(8)} ${t.title}${who}`);
  }
  console.log();
}
function cmdNext() {
  const ready = E.snapshot().tasks.filter((t) => t.ready);
  if (!ready.length) return console.log("ไม่มี task พร้อมทำ (ติด dependency หรือเสร็จหมด)");
  console.log("\n  Task พร้อมทำ (deps ครบ):\n");
  for (const t of ready) { console.log(`  ○ ${t.id.padEnd(5)} -> ${(t.model || "MANUAL").padEnd(7)} | ${t.title}`); console.log(`      accept: ${t.accept}`); }
  console.log();
}
function cmdGraph(mermaid) {
  if (mermaid) { console.log("graph TD"); for (const t of E.BACKLOG) for (const d of t.deps || []) console.log(`  ${d.replace(/[.-]/g, "_")} --> ${t.id.replace(/[.-]/g, "_")}`); return; }
  E.waves().forEach((w, i) => { console.log(`\n  Wave ${i}:`); for (const t of w) console.log(`    ${t.id.padEnd(5)} [${E.roleFor(t).padEnd(9)}] ${t.title}`); });
  console.log();
}

async function cmdRun({ max, execute, worker }) {
  E.detectCycle();
  const concurrency = max || E.CONFIG.concurrency;
  if (!execute) {
    const snap = E.snapshot();
    console.log(`\n  DRY-RUN — concurrency=${concurrency}\n`);
    const done = new Set(snap.tasks.filter((t) => t.status === "done").map((t) => t.id));
    const remaining = new Set(snap.tasks.filter((t) => t.status !== "done").map((t) => t.id));
    let wave = 0;
    while (remaining.size) {
      const batch = [...remaining].map(E.byId).filter((t) => (t.deps || []).every((d) => done.has(d)));
      if (!batch.length) { console.log("  ⚠ เหลือ task ติด dependency วน"); break; }
      console.log(`  Wave ${wave++} (คู่ขนาน ${Math.min(batch.length, concurrency)}/รอบ):`);
      for (const t of batch) { console.log(`    ${t.id.padEnd(5)} -> ${E.modelFor(t, E.loadState()) || "MANUAL(มือ)"}`); done.add(t.id); remaining.delete(t.id); }
    }
    console.log(`\n  ใช้ --execute เพื่อเรียก claude จริง\n`); return;
  }
  console.log(`\n  EXECUTE worker pool — concurrency=${concurrency}\n`);
  let running = 0, idx = 0; const inflight = new Set();
  const tick = async () => {
    while (running < concurrency) {
      const snap = E.snapshot();
      const t = snap.tasks.find((x) => x.ready && x.model !== null);
      if (!t) break;
      const w = `${worker}-${++idx}`;
      const c = E.claim(t.id, w); if (!c.ok) continue;
      E.setStatus(t.id, "running", { worker: w, claimedAt: E.now() });
      console.log(`  ▶ ${w} dispatch ${t.id} -> ${c.model}`);
      running++;
      const p = E.executeWithReview(E.byId(t.id), c.model, w).then((status) => {
        console.log(`  ${status === "done" ? "✓" : status === "needs-rework" ? "⚠" : "✗"} ${t.id} (${status})`);
        running--; inflight.delete(p);
      });
      inflight.add(p);
    }
  };
  await tick();
  while (inflight.size) { await Promise.race(inflight); await tick(); }
  console.log("\n  รอบนี้จบ — ดู status\n");
}

async function cmdAutoWave({ maxWaves, supervisorModel, concurrency, dryRun }) {
  E.detectCycle();
  if (dryRun) {
    const snap = E.snapshot();
    const done = new Set(snap.tasks.filter((t) => t.status === "done").map((t) => t.id));
    const remaining = new Set(snap.tasks.filter((t) => t.status !== "done").map((t) => t.id));
    const planned = [];
    let wave = 0;
    while (remaining.size) {
      const batch = [...remaining].map(E.byId).filter((t) => (t.deps || []).every((d) => done.has(d)));
      if (!batch.length) break;
      planned.push(batch.map((t) => t.id));
      for (const t of batch) { done.add(t.id); remaining.delete(t.id); }
      wave++;
    }
    console.log(`\n  AUTO-WAVE DRY-RUN — supervisor=${supervisorModel || "(default)"}  concurrency=${concurrency}\n`);
    planned.forEach((ids, i) => console.log(`  Wave ${i + 1}: ${ids.join(", ")}`));
    console.log(`\n  ${planned.length} waves คาดว่าจะรัน. ใช้ \`node orchestrator.mjs auto-wave\` (ไม่มี --dry-run) เพื่อรันจริง.\n`);
    return;
  }
  console.log(`\n  🤖 AUTO-WAVE  —  supervisor=${supervisorModel || "(default)"}  max-waves=${maxWaves}  concurrency=${concurrency}\n`);
  console.log(`  รัน wave -> supervisor review -> ผ่านก็ wave ถัดไป. กด Ctrl+C ในระหว่างทาง (หรือ \`node orchestrator.mjs stop\` จาก terminal อื่น) เพื่อหยุด.\n`);
  const opts = { maxWaves, concurrency };
  if (supervisorModel) opts.supervisorModel = supervisorModel;
  opts.onLog = (line) => console.log("  " + line);
  const res = await runAutonomous(opts);
  console.log(`\n  === DONE ===`);
  console.log(`  waves run: ${res.waves.length}`);
  if (res.completedAt != null) console.log(`  ✅ all tasks done at wave ${res.completedAt}`);
  if (res.holdAt != null) console.log(`  🛑 supervisor HOLD at wave ${res.holdAt + 1}`);
  if (res.stoppedAt != null) console.log(`  ⏸ stopped at wave ${res.stoppedAt + 1}`);
  if (res.exhaustedAt != null) console.log(`  ⚠ max-waves reached`);
  console.log(`  report: ${res.reportFile}\n`);
}

const [cmd, a1, a2] = process.argv.slice(2);
try {
  switch (cmd) {
    case "status": cmdStatus(); break;
    case "accounts": cmdAccounts(); break;
    case "next": cmdNext(); break;
    case "graph": cmdGraph(process.argv.includes("--mermaid")); break;
    case "claim": out(E.claim(a1, arg(["-w", "--worker"], "w1"))); if (process.exitCode !== 1) console.log(`✓ claimed ${a1}`); break;
    case "release": out(E.setStatus(a1, "todo")); console.log(`→ ${a1} = todo`); break;
    case "done": out(E.setStatus(a1, "done")); console.log(`→ ${a1} = done`); break;
    case "fail": out(E.setStatus(a1, "failed")); console.log(`→ ${a1} = failed`); break;
    case "assign": out(E.assign(a1, a2)); console.log(`→ ${a1} model=${a2}`); break;
    case "reset": E.reset(); console.log("state ล้างกลับ todo ทั้งหมด"); break;
    case "run": await cmdRun({ max: Number(arg(["--max"], 0)) || 0, execute: process.argv.includes("--execute"), worker: arg(["-w", "--worker"], "worker") }); break;
    case "auto-wave": await cmdAutoWave({
      maxWaves: Number(arg(["--max-waves"], 0)) || 100,
      supervisorModel: arg(["--supervisor", "--reviewer"], null),
      concurrency: Number(arg(["--max", "--concurrency"], 0)) || E.CONFIG.concurrency,
      dryRun: process.argv.includes("--dry-run"),
    }); break;
    case "auto-loop": await cmdAutoLoop(a1, {
      target: Number(arg(["--target"], 0)) || 1.0,
      maxRounds: Number(arg(["--max-rounds"], 0)) || 5,
      executor: arg(["--executor"], "frontier"),
      execute: process.argv.includes("--execute"),
    }); break;
    case "mode": if (a1) { out(E.setMode(a1)); if (process.exitCode !== 1) console.log(`→ cost-mode = ${a1}  (normal=all · free=local+OpenRouter:free · local=offline only)`); } else console.log(`cost-mode: ${E.getMode()}`); break;
    case "stop": stopAutonomous(); console.log("→ pool stop requested"); break;
    default: console.log("commands: status | accounts | mode [normal|free|local] | next | graph [--mermaid] | claim <id> [-w name] | release|done|fail <id> | assign <id> <model> | run [--max N] [--execute] | auto-wave [--max-waves N] [--supervisor MODEL] [--max N] [--dry-run] | auto-loop <goalId> [--target 1.0] [--max-rounds 5] [--executor frontier] [--execute] | stop | reset");
  }
} catch (e) { console.error("ERROR: " + e.message); process.exitCode = 1; }
