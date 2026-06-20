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
import * as E from "./engine.mjs";

const ACTIVE = E.ACTIVE;

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

const [cmd, a1, a2] = process.argv.slice(2);
try {
  switch (cmd) {
    case "status": cmdStatus(); break;
    case "next": cmdNext(); break;
    case "graph": cmdGraph(process.argv.includes("--mermaid")); break;
    case "claim": out(E.claim(a1, arg(["-w", "--worker"], "w1"))); if (process.exitCode !== 1) console.log(`✓ claimed ${a1}`); break;
    case "release": out(E.setStatus(a1, "todo")); console.log(`→ ${a1} = todo`); break;
    case "done": out(E.setStatus(a1, "done")); console.log(`→ ${a1} = done`); break;
    case "fail": out(E.setStatus(a1, "failed")); console.log(`→ ${a1} = failed`); break;
    case "assign": out(E.assign(a1, a2)); console.log(`→ ${a1} model=${a2}`); break;
    case "reset": E.reset(); console.log("state ล้างกลับ todo ทั้งหมด"); break;
    case "run": await cmdRun({ max: Number(arg(["--max"], 0)) || 0, execute: process.argv.includes("--execute"), worker: arg(["-w", "--worker"], "worker") }); break;
    default: console.log("commands: status | next | graph [--mermaid] | claim <id> [-w name] | release|done|fail <id> | assign <id> <model> | run [--max N] [--execute] | reset");
  }
} catch (e) { console.error("ERROR: " + e.message); process.exitCode = 1; }
