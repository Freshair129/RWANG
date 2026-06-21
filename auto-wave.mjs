// Autonomous wave runner — รัน wave อัตโนมัติ + supervisor review หลังจบ wave
// ก่อนเดิน wave ถัดไป. เลเยอร์อยู่บน engine.mjs (Verify Gate task-level + runPool)
// ไม่แก้ engine.mjs.
//
// แนวคิด:
//   1. หา "next wave" จาก waves() = DAG level แรกที่ยังมี task ไม่ done
//   2. ปล่อย runPool({mode:"wave"}) ให้ทำ snapshot ของ wave นั้น
//   3. รอจน POOL idle + ทุก task ใน wave settle (done/failed/needs-rework)
//   4. spawn supervisor (claude -p) ส่ง log excerpt + verdicts ให้ดูภาพรวมของ wave
//   5. verdict "pass" -> wave ถัดไป; "hold" -> หยุดเอาไว้ให้คนดู
//
// supervisor ตรวจสิ่งที่ Verify Gate task-level ตรวจไม่ได้: cross-task consistency,
// คุณภาพระหว่าง task, wave ถัดไปจะกระทบไหม, risk pattern. ผ่านยากกว่า task review.

import { spawn } from "child_process";
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import {
  PATHS, CONFIG, BACKLOG,
  loadState, waves, runPool, poolStatus, stopPool, byId,
} from "./engine.mjs";

// task ที่ถือว่า "settle แล้ว" ในรอบของ wave runner (ไม่นับ todo ที่ถูกข้ามเพราะ skipped/manual)
const SETTLED = new Set(["done", "failed", "needs-rework"]);

// stop flag ระดับ autonomous loop — เพราะ runPool รีเซ็ต POOL.stop=false ทุก wave,
// outer loop จึงต้องจำ stop เอง (MAJOR-1 fix)
let STOP = false;

const SUPERVISOR_PROMPT_TEMPLATE = `คุณคือ "supervisor" ของ orchestrator ที่ตรวจ "wave" ที่เพิ่งจบ —
ไม่ใช่ task เดียว ๆ. Verify Gate ตรวจ task แต่ละตัวไปแล้ว; งานคุณคือมองภาพรวมที่
Gate รายตัวมองไม่เห็น.

ตรวจสิ่งเหล่านี้:
1. **acceptance ภาพรวม**: ทุก task เสร็จจริง ๆ ตอบโจทย์ของมันไหม (Gate รายตัวอาจปล่อยพลาด)
2. **cross-task consistency**: ผลของแต่ละ task ใน wave นี้ขัดแย้งกันเองไหม
3. **next-wave readiness**: dependency ที่ส่งต่อ wave หน้า "เสร็จเป็นแค่ skeleton" ไหม
   ถ้าใช่ wave หน้าจะเจอปัญหา
4. **risk pattern**: มี anti-pattern ของ small-model (greeting / placeholder) ที่หลุดมาไหม

**ตอบบรรทัดเดียว JSON เท่านั้น** ห้ามมี markdown ห้ามมีคำอธิบายอื่นนอก JSON:
{"verdict":"pass"|"hold","issues":[{"severity":"critical"|"major"|"minor","detail":"...","fix":"..."}],"summary":"..."}

verdict "hold" = หยุด autonomous run ที่ wave นี้ ให้คนดู.
verdict "pass" = OK เดินต่อ wave ถัดไปได้.

**ห้าม pass ถ้ามี severity critical หรือ major**. ลังเลให้ hold (fail-safe).`;

function authForCmd(state) {
  const mode = state.authMode || "plan";
  return mode === "apikey" ? { ...process.env, ANTHROPIC_API_KEY: CONFIG.auth?.apiKey || process.env.ANTHROPIC_API_KEY }
                           : { ...process.env, ANTHROPIC_API_KEY: undefined };
}

function tailLines(s, n) {
  const arr = s.split(/\r?\n/);
  return arr.slice(Math.max(0, arr.length - n)).join("\n");
}

function latestLogFor(id, tailN = 35) {
  if (!existsSync(PATHS.LOGS)) return "";
  const files = readdirSync(PATHS.LOGS).filter(
    (f) => f.startsWith(`${id}.`) && f.endsWith(".log") && !f.endsWith(".review.log")
  );
  if (!files.length) return "";
  files.sort(); // worker-1 < worker-2 < ... — last = most-recent attempt
  try {
    const txt = readFileSync(join(PATHS.LOGS, files[files.length - 1]), "utf8");
    return tailLines(txt, tailN);
  } catch { return ""; }
}

function latestReviewLogFor(id, tailN = 20) {
  if (!existsSync(PATHS.LOGS)) return "";
  const files = readdirSync(PATHS.LOGS).filter(
    (f) => f.startsWith(`${id}.`) && f.endsWith(".review.log")
  );
  if (!files.length) return "";
  files.sort();
  try {
    const txt = readFileSync(join(PATHS.LOGS, files[files.length - 1]), "utf8");
    return tailLines(txt, tailN);
  } catch { return ""; }
}

function buildSupervisorPrompt(waveIdx, dagLevel, waveTaskRows) {
  const blocks = waveTaskRows.map((row) => {
    const t = row.task;
    const lines = [
      `### ${t.id} — status: **${row.status}**  (type: ${t.type}, model: ${row.model || "?"})`,
      `acceptance: ${t.accept || "(none)"}`,
      row.outcome ? `prev gate verdict: ${row.outcome.review?.verdict || "?"} (${row.outcome.review?.summary || ""})` : "",
      row.logTail ? `worker log (tail):\n\`\`\`\n${row.logTail}\n\`\`\`` : "",
      row.reviewTail ? `task review log (tail):\n\`\`\`\n${row.reviewTail}\n\`\`\`` : "",
    ].filter(Boolean);
    return lines.join("\n");
  });
  return `${SUPERVISOR_PROMPT_TEMPLATE}

## Wave #${waveIdx + 1}  (DAG level ${dagLevel + 1})  —  ${waveTaskRows.length} tasks

${blocks.join("\n\n")}

ตอบ JSON ตามรูปแบบที่บอกข้างต้น (บรรทัดเดียว).`;
}

function parseSupervisorOutput(stdout) {
  // หา JSON บรรทัดสุดท้ายที่เริ่มด้วย { (claude อาจมี trailing log line)
  const cand = stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("{") && l.endsWith("}"));
  for (let i = cand.length - 1; i >= 0; i--) {
    try { return JSON.parse(cand[i]); } catch {}
  }
  return null;
}

function spawnSupervisor({ prompt, model, logFile }) {
  return new Promise((resolve) => {
    const state = loadState();
    const args = [...CONFIG.executor.baseArgs, "--model", model, ...CONFIG.executor.extraArgs];
    const child = spawn(CONFIG.executor.command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: authForCmd(state),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => {
      try {
        writeFileSync(logFile,
          `# supervisor exit=${code} model=${model}\n\n## prompt\n${prompt}\n\n## stdout\n${stdout}\n\n## stderr\n${stderr}\n`);
      } catch {}
      if (code !== 0 && !stdout.trim()) {
        return resolve({ verdict: "hold", issues: [{ severity: "major", area: "supervisor", detail: `claude exit ${code}`, fix: "ดู supervisor log" }], summary: "supervisor unavailable", ran: false });
      }
      const v = parseSupervisorOutput(stdout);
      if (!v) {
        return resolve({ verdict: "hold", issues: [{ severity: "major", area: "supervisor", detail: "verdict JSON ไม่ parse", fix: "ดู supervisor log" }], summary: "unparseable", ran: true });
      }
      resolve({ ...v, ran: true });
    });
    child.on("error", (e) => {
      try { writeFileSync(logFile, `# supervisor spawn error: ${e}\n`); } catch {}
      resolve({ verdict: "hold", issues: [{ severity: "major", area: "supervisor", detail: String(e), fix: "ตรวจ claude CLI" }], summary: "spawn error", ran: false });
    });
    try { child.stdin.end(prompt); } catch {}
  });
}

// "remaining" = ยังไม่ done (true completion). needs-rework/failed นับเป็น "ยังไม่เสร็จ" ด้วย
// (กัน false-complete — done≠passed; needs-rework ที่ค้างจะถูก guard ใน loop จับเป็น HOLD) — MAJOR-2 fix
function pendingTasks(state) {
  return BACKLOG.filter((t) => state.tasks[t.id].status !== "done");
}

// คืน { index, dagLevel, ids } ของ wave แรกที่ยังมี task ที่ยังต้องทำ; null ถ้าไม่มีอะไรเหลือ
function pickNextWave(state) {
  const lvl = waves();
  for (let i = 0; i < lvl.length; i++) {
    const ids = lvl[i].map((t) => t.id);
    const undone = ids.filter((id) => !["done"].includes(state.tasks[id]?.status));
    if (undone.length) return { index: i, dagLevel: i, ids: undone, allIdsInLevel: ids };
  }
  return null;
}

// poll until wave's tasks are settled + pool is idle. คืน "idle" / "stopped" / "timeout"
async function waitForWave({ ids, pollMs = 1500, idleMs = 3000, timeoutMs = 60 * 60 * 1000 }) {
  const start = Date.now();
  let lastBusy = Date.now();
  while (true) {
    if (STOP) return "stopped";
    if (Date.now() - start > timeoutMs) return "timeout";
    const ps = poolStatus();
    if (ps.running > 0) lastBusy = Date.now();
    if (ps.stop || (!ps.active && Date.now() - lastBusy >= idleMs)) {
      // double-check task statuses
      const s = loadState();
      const settled = ids.every((id) => SETTLED.has(s.tasks[id]?.status));
      const acceptIfManual = ids.every((id) => {
        const st = s.tasks[id]?.status;
        if (SETTLED.has(st)) return true;
        // task ที่ skip เพราะ manual (modelFor = null) จะค้าง "todo" — ถือว่า settle
        const t = byId(id);
        const provisional = s.tasks[id];
        return st === "todo" && (!provisional?.model && (t?.type === "manual"));
      });
      if (settled || acceptIfManual) {
        return ps.stop ? "stopped" : "idle";
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

export async function runAutonomous({
  maxWaves = 100,
  supervisorModel = (CONFIG.review?.reviewerByTier?.opus) || "opus",
  concurrency = CONFIG.concurrency,
  workerLabel = "auto-wave",
  onLog = () => {},
} = {}) {
  if (!existsSync(PATHS.LOGS)) mkdirSync(PATHS.LOGS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportFile = join(PATHS.LOGS, `auto-wave.${stamp}.md`);
  const log = (line) => {
    try { appendFileSync(reportFile, line + "\n"); } catch {}
    onLog(line);
  };

  const t0 = Date.now();
  log(`# Autonomous wave run — ${new Date(t0).toISOString()}`);
  log(`supervisor=${supervisorModel}  concurrency=${concurrency}  maxWaves=${maxWaves}`);

  const summary = { waves: [], stoppedAt: null, holdAt: null, completedAt: null, reportFile };

  STOP = false;
  for (let waveIdx = 0; waveIdx < maxWaves; waveIdx++) {
    if (STOP) { log(`\n⏹ STOPPED by user at wave ${waveIdx + 1}`); summary.stoppedAt = waveIdx; return summary; }
    const state = loadState();
    if (!pendingTasks(state).length) {
      log(`\n✅ ALL TASKS DONE  ·  elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      summary.completedAt = waveIdx;
      return summary;
    }
    const wv = pickNextWave(state);
    if (!wv) {
      log(`\n⚠ no actionable wave (DAG cycle? all tasks failed/blocked)`);
      summary.holdAt = waveIdx;
      return summary;
    }
    log(`\n## Wave ${waveIdx + 1}  ·  DAG level ${wv.dagLevel + 1}  ·  ${wv.ids.length} tasks: ${wv.ids.join(", ")}`);

    // guard (MAJOR-2): wave นี้มี task ที่รันได้ (todo) ไหม — ถ้าเหลือแต่ needs-rework/failed
    // runPool ทำอะไรไม่ได้ -> กัน deadlock (วนเรียก supervisor ซ้ำ) + false-complete -> HOLD ให้คนแก้
    const actionable = wv.ids.filter((id) => state.tasks[id]?.status === "todo");
    const stuck = wv.ids.filter((id) => ["failed", "needs-rework"].includes(state.tasks[id]?.status));
    if (!actionable.length) {
      log(`\n🛑 HOLD — wave ${waveIdx + 1} ไม่มี task ที่รันได้ (ติด: ${stuck.join(", ") || "—"}). fix/reset ก่อนเดินต่อ.`);
      summary.holdAt = waveIdx; summary.blocked = stuck; return summary;
    }

    // 1. fire the wave
    const r = runPool({ mode: "wave", max: concurrency, worker: workerLabel });
    if (!r.ok && !r.active) {
      // pool already running from elsewhere -> wait for it
      log(`pool was already active — waiting...`);
    }
    // 2. wait for wave to settle
    const reason = await waitForWave({ ids: wv.allIdsInLevel });
    log(`wave settled (${reason})`);
    if (reason === "stopped") {
      summary.stoppedAt = waveIdx;
      return summary;
    }
    if (reason === "timeout") {
      log(`🛑 TIMEOUT — wave ไม่จบใน budget. หยุด.`);
      summary.holdAt = waveIdx;
      return summary;
    }

    // 3. gather rows for supervisor
    const afterState = loadState();
    const waveTaskRows = wv.allIdsInLevel.map((id) => {
      const taskState = afterState.tasks[id];
      const task = byId(id);
      return {
        task,
        status: taskState?.status || "?",
        model: taskState?.model,
        outcome: taskState?.outcome || taskState?.lastOutcome,
        logTail: latestLogFor(id, 35),
        reviewTail: latestReviewLogFor(id, 20),
      };
    });

    // 4. supervisor review
    const supervisorLog = join(PATHS.LOGS, `auto-wave.supervisor-${waveIdx + 1}.log`);
    const prompt = buildSupervisorPrompt(waveIdx, wv.dagLevel, waveTaskRows);
    log(`\n📋 Calling supervisor (${supervisorModel}) — log: ${supervisorLog}`);
    const verdict = await spawnSupervisor({ prompt, model: supervisorModel, logFile: supervisorLog });

    log(`\nSupervisor verdict: **${verdict.verdict}**  —  ${verdict.summary || "(no summary)"}`);
    for (const issue of verdict.issues || []) {
      log(`  - [${issue.severity || "?"}] ${issue.area || ""}: ${issue.detail || ""}${issue.fix ? `  →  ${issue.fix}` : ""}`);
    }

    summary.waves.push({ waveIdx, dagLevel: wv.dagLevel, tasks: wv.ids, verdict: verdict.verdict, summary: verdict.summary, supervisorLog });

    if (verdict.verdict !== "pass") {
      log(`\n🛑 HOLD — autonomous run หยุดที่ wave ${waveIdx + 1}. ดู ${supervisorLog} แล้ว fix issues + restart.`);
      summary.holdAt = waveIdx;
      return summary;
    }
  }

  log(`\n⚠ maxWaves (${maxWaves}) reached without completing all tasks`);
  summary.exhaustedAt = maxWaves;
  return summary;
}

// CLI-friendly stop
export function stopAutonomous() {
  STOP = true;
  stopPool();
}
