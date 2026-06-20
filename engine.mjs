/**
 * G-Maiden Orchestrator — shared engine
 * ใช้ร่วมกันโดย orchestrator.mjs (CLI) และ server.mjs (web UI).
 * ฟังก์ชันทั้งหมด return ค่าแบบ structured (ไม่ print) เพื่อให้ทั้ง CLI/HTTP ใช้ได้.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, openSync, closeSync, unlinkSync, readdirSync, createWriteStream, statSync, readSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
export const PATHS = {
  __dir, ROOT,
  STATE: join(__dir, "state.json"),
  LOCK: join(__dir, ".state.lock"),
  LOGS: join(__dir, "logs"),
};

export let CONFIG = loadJson(join(__dir, "config.json"));
export let BACKLOG = loadJson(join(__dir, "backlog.json")).tasks;
// hot-reload: อ่าน config/backlog ใหม่จากดิสก์ (เรียกตอน snapshot) -> แก้ไฟล์แล้วเห็นผลทันทีไม่ต้อง restart
export function reload() {
  try { CONFIG = loadJson(join(__dir, "config.json")); BACKLOG = loadJson(join(__dir, "backlog.json")).tasks; } catch { /* keep last good */ }
}

export const ACTIVE = new Set(["claimed", "running", "reviewing"]);

function loadJson(p) { return JSON.parse(readFileSync(p, "utf8")); }
export function now() { return Date.now(); }
export function byId(id) { return BACKLOG.find((t) => t.id === id); }

export function modelFor(task, state) {
  const st = state?.tasks?.[task.id];
  if (st && st.modelOverride) return st.modelOverride;        // UI assign ชนะสุด
  if (task.model) return CONFIG.models[task.model] || task.model; // backlog pin (ชื่อ tier เช่น 'local' หรือ literal 'ollama:x')
  const role = CONFIG.routing[task.type];
  if (role === null) return null;
  return CONFIG.models[role] || CONFIG.models.coder;
}
export function roleFor(task) { return CONFIG.routing[task.type] ?? "manual"; }

// ---------- file lock (atomic claim, single-host) ----------
export function withLock(fn) {
  let fd, tries = 0;
  while (true) {
    try { fd = openSync(PATHS.LOCK, "wx"); break; }
    catch (e) {
      if (e.code !== "EEXIST") throw e;
      if (++tries > 200) throw new Error("ไม่สามารถจับ lock state.json ได้ (ลบ .state.lock ถ้าค้าง)");
      const until = now() + 25; while (now() < until) { /* spin */ }
    }
  }
  try { return fn(); }
  finally { try { closeSync(fd); unlinkSync(PATHS.LOCK); } catch { /* ignore */ } }
}

// ---------- state ----------
export function freshState() {
  const tasks = {};
  for (const t of BACKLOG) tasks[t.id] = { status: "todo", worker: null, claimedAt: null, modelOverride: null, attempts: 0 };
  return { tasks, authMode: CONFIG.auth?.mode || "plan", updatedAt: now() };
}
export function loadState() {
  if (!existsSync(PATHS.STATE)) { const s = freshState(); saveState(s); return s; }
  const s = loadJson(PATHS.STATE);
  for (const t of BACKLOG) if (!s.tasks[t.id]) s.tasks[t.id] = { status: "todo", worker: null, claimedAt: null, modelOverride: null, attempts: 0 };
  if (!s.authMode) s.authMode = CONFIG.auth?.mode || "plan";
  return s;
}

// ---------- auth (Plan quota ↔ API key) ----------
export function getAuthMode() { return loadState().authMode || "plan"; }
export function setAuthMode(mode) {
  if (!["plan", "apikey"].includes(mode)) return { ok: false, error: "mode ต้องเป็น plan|apikey" };
  withLock(() => { const s = loadState(); s.authMode = mode; saveState(s); });
  return { ok: true, mode };
}
export function apiKeyAvailable() { return !!(CONFIG.auth?.apiKey || process.env.ANTHROPIC_API_KEY); }
function childEnv(mode) {
  const env = { ...process.env };
  if (mode === "plan") { delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; }
  else { const k = CONFIG.auth?.apiKey || process.env.ANTHROPIC_API_KEY; if (k) env.ANTHROPIC_API_KEY = k; }
  return env;
}
export function saveState(s) { s.updatedAt = now(); writeFileSync(PATHS.STATE, JSON.stringify(s, null, 2)); }

export function reapStale(s) {
  let reaped = 0;
  for (const t of BACKLOG) {
    const st = s.tasks[t.id];
    if (ACTIVE.has(st.status) && st.claimedAt && now() - st.claimedAt > CONFIG.leaseMs) {
      st.status = "todo"; st.worker = null; st.claimedAt = null; reaped++;
    }
  }
  return reaped;
}

// ---------- dependency logic ----------
export function depsDone(t, s) { return (t.deps || []).every((d) => s.tasks[d]?.status === "done"); }
export function isReady(t, s) { return s.tasks[t.id].status === "todo" && depsDone(t, s); }
export function readyTasks(s) { return BACKLOG.filter((t) => isReady(t, s)); }
export function blockedTasks(s) { return BACKLOG.filter((t) => s.tasks[t.id].status === "todo" && !depsDone(t, s)); }

export function detectCycle() {
  const seen = {}, stack = {};
  const visit = (id, path) => {
    if (stack[id]) throw new Error(`cyclic dependency: ${[...path, id].join(" -> ")}`);
    if (seen[id]) return;
    seen[id] = stack[id] = true;
    for (const d of byId(id).deps || []) visit(d, [...path, id]);
    stack[id] = false;
  };
  for (const t of BACKLOG) visit(t.id, []);
}

export function waves() {
  const level = {};
  const calc = (id) => {
    if (level[id] != null) return level[id];
    const ds = byId(id).deps || [];
    level[id] = ds.length ? Math.max(...ds.map(calc)) + 1 : 0;
    return level[id];
  };
  for (const t of BACKLOG) calc(t.id);
  const max = Math.max(...Object.values(level), 0);
  const out = [];
  for (let i = 0; i <= max; i++) out.push(BACKLOG.filter((t) => level[t.id] === i));
  return out;
}

// ---------- mutations (return {ok,error}) ----------
export function claim(id, worker = "w1") {
  const t = byId(id); if (!t) return { ok: false, error: `ไม่พบ task ${id}` };
  return withLock(() => {
    const s = loadState(); reapStale(s);
    if (!isReady(t, s)) { saveState(s); return { ok: false, error: `${id} ยังไม่พร้อม (status=${s.tasks[id].status}, depsDone=${depsDone(t, s)})` }; }
    s.tasks[id] = { ...s.tasks[id], status: "claimed", worker, claimedAt: now(), attempts: s.tasks[id].attempts + 1 };
    saveState(s);
    return { ok: true, task: id, worker, model: modelFor(t, s) };
  });
}
export function setStatus(id, status, extra = {}) {
  const t = byId(id); if (!t) return { ok: false, error: `ไม่พบ task ${id}` };
  withLock(() => {
    const s = loadState();
    s.tasks[id] = { ...s.tasks[id], status, ...extra };
    if (status === "todo") { s.tasks[id].worker = null; s.tasks[id].claimedAt = null; }
    saveState(s);
  });
  return { ok: true, task: id, status };
}
export function assign(id, model) {
  if (!byId(id)) return { ok: false, error: `ไม่พบ task ${id}` };
  withLock(() => { const s = loadState(); s.tasks[id].modelOverride = model || null; saveState(s); });
  return { ok: true, task: id, model };
}
export function reset() { withLock(() => saveState(freshState())); return { ok: true }; }

// ---------- snapshot สำหรับ UI/API ----------
export function snapshot() {
  reload();                       // อ่าน backlog/config ล่าสุดจากดิสก์ทุกครั้งที่ UI poll
  const s = loadState();
  const reaped = withLock(() => { const st = loadState(); const r = reapStale(st); if (r) saveState(st); return r; });
  const cur = loadState();
  const counts = {};
  for (const t of BACKLOG) { const st = cur.tasks[t.id].status; counts[st] = (counts[st] || 0) + 1; }
  const total = BACKLOG.length, done = counts.done || 0;
  const tasks = BACKLOG.map((t) => {
    const st = cur.tasks[t.id];
    return {
      id: t.id, title: t.title, type: t.type, phase: t.phase,
      role: roleFor(t), model: modelFor(t, cur),
      status: st.status, worker: st.worker, claimedAt: st.claimedAt,
      attempts: st.attempts, modelOverride: st.modelOverride,
      deps: t.deps || [], depsDone: depsDone(t, cur), ready: isReady(t, cur),
      accept: t.accept, est: t.est,
    };
  });
  return {
    progress: { done, total, pct: total ? Math.round((done / total) * 100) : 0 },
    counts, reaped, updatedAt: cur.updatedAt,
    models: CONFIG.models, modelOptions: [...new Set(Object.values(CONFIG.models))],
    waves: waves().map((w) => w.map((t) => t.id)),
    pool: poolStatus(),
    auth: { mode: cur.authMode || "plan", apiKeyAvailable: apiKeyAvailable() },
    usage: readUsage(),
    usageLimits: { sessionUsd: CONFIG.usageLimits?.sessionUsd ?? null, weeklyUsd: CONFIG.usageLimits?.weeklyUsd ?? null },
    tasks,
  };
}

// ---------- doc registry + subagent scope (POLA, ตาม CONCEPT--SUBAGENT-CONTEXT-SCOPING) ----------
function docTier(path) { const e = (CONFIG.docsForContext || []).find((d) => (d.path || d) === path); return (e && e.tier) || "shared"; }
function isOrchestratorOnly(path) { return docTier(path) === "orchestrator-only"; }

// กฎโมเดลเล็ก (ย่อจาก GUIDE--SMALL-MODEL-PROMPTING) — inline ให้ ollama worker, ไม่โหลดทั้งไฟล์
const SMALL_MODEL_RULES = [
  "กฎโมเดลเล็ก (สำคัญ):",
  "- ทำทีละ 1 อย่าง โค้ดไม่เกิน ~150 บรรทัด/รอบ (micro-task)",
  "- อย่าพิมพ์ทุก property / exhaustive mock — ใช้ shortcut หรือ type-assertion",
  "- แก้เฉพาะบล็อกที่ให้ ไม่รื้อทั้งไฟล์ (focused input)",
  "- ตอบเฉพาะ code block ที่ใช้ได้ทันที ห้ามอธิบายยาว (strict output)",
  "- ถ้าข้อมูล/บริบทไม่พอ ตอบ \"BLOCKED: <สิ่งที่ขาด>\" ห้ามเดา (escalate)",
].join("\n");

// parent ประกาศ scope; subagent ไม่ตั้งเอง. merge: task.scope > byPhase > default. orchestrator-only ถูกกรองออกเสมอ
export function scopeFor(task) {
  const sc = CONFIG.scope || {};
  const base = sc.default || {}, byPhase = (sc.byPhase && sc.byPhase[task.phase]) || {}, own = task.scope || {};
  const docs = (own.docs || byPhase.docs || base.docs || []).filter((d) => !isOrchestratorOnly(d));
  return {
    docs, needs: own.needs || [], excludes: own.excludes || [],
    budgetTokens: own.budgetTokens || byPhase.budgetTokens || base.budgetTokens || 8000,
    scaffold: own.scaffold || null,
    profile: own.profile || CONFIG.ollama?.defaultProfile || "balanced",
  };
}

export function buildPrompt(t, model, provider = "claude", reworkNote = null) {
  const s = scopeFor(t);
  const deps = (t.deps || []).join(", ") || "(none)";
  const head = [
    `คุณคือ worker agent ของโปรเจกต์ G-Maiden ทำงาน task เดียวให้เสร็จ`, ``,
    `# Task ${t.id}: ${t.title}`,
    `ประเภท: ${t.type} | model: ${model} | phase: ${t.phase}`,
    `Dependencies (เสร็จแล้ว): ${deps}`, ``,
    `## เกณฑ์ผ่าน (acceptance — ต้องครบ)`, t.accept, ``,
  ];
  if (reworkNote) head.push(reworkNote, ``);
  if (provider === "ollama") {
    const p = [...head];
    if (s.needs.length) p.push(`## บริบทที่เกี่ยวข้อง`, s.needs.map((n) => `- ${n}`).join("\n"), ``);
    if (s.scaffold) p.push(`## โครงเริ่มต้น (เติมไส้ในให้สมบูรณ์ — scaffold-first)`, "```", s.scaffold, "```", ``);
    p.push(`## วิธีตอบ`, SMALL_MODEL_RULES, ``,
      `อย่าอ้าง/โหลดไฟล์เอกสารทั้งไฟล์ (โมเดลเล็กจะเสียสมาธิ) — ทำตาม acceptance + บริบทด้านบนเท่านั้น.`);
    return p.join("\n");
  }
  // claude full-agent: ชี้ path เฉพาะที่อยู่ใน scope (orchestrator-only ถูกกรองออกแล้ว) ให้ agent ไปอ่านเอง
  const docs = s.docs.length ? s.docs.map((d) => `- ${d}`).join("\n") : "- (ไม่ระบุ — ถ้าต้องการบริบทเพิ่ม ให้ escalate ด้วย BLOCKED)";
  const p = [...head, `## อ่านก่อนเริ่ม (scope ที่ parent อนุญาตเท่านั้น — POLA)`, docs];
  if (s.excludes.length) p.push(`ห้ามแตะ/ดึง: ${s.excludes.join(", ")}`);
  if (s.scaffold) p.push(``, `## โครงเริ่มต้น`, "```", s.scaffold, "```");
  p.push(``, `## ข้อกำหนด`,
    `- ทำเฉพาะขอบเขต task นี้ + อ่านเฉพาะเอกสารใน scope ด้านบน`,
    `- เคารพ ADR/NFR (latency/CPU/RAM/FPS/privacy)`,
    `- ถ้าบริบทใน scope ไม่พอ: หยุดแล้วตอบ "BLOCKED: <สิ่งที่ขาด>" (escalate) — อย่าเดา`,
    `- จบด้วยสรุปสั้น ๆ ว่าทำอะไร ไฟล์ไหน ผ่าน acceptance อย่างไร`);
  return p.join("\n");
}

// provider detection: 'ollama:<name>' = local, อื่น ๆ = claude
export function parseModel(model) {
  if (typeof model === "string" && model.startsWith("ollama:")) return { provider: "ollama", name: model.slice(7) };
  return { provider: "claude", name: model };
}

export function runAgent(t, model, worker, opts = {}) {
  const { provider, name } = parseModel(model);
  return provider === "ollama" ? runOllama(t, name, model, worker, opts) : runClaude(t, name, model, worker, opts);
}

function runClaude(t, name, model, worker, opts = {}) {
  return new Promise((res) => {
    if (!existsSync(PATHS.LOGS)) mkdirSync(PATHS.LOGS, { recursive: true });
    const logFile = join(PATHS.LOGS, `${t.id}.${worker}.log`);
    const mode = getAuthMode();
    const ws = createWriteStream(logFile, { flags: "w" });
    ws.write(`# ${t.id} · ${worker} · ${model} · auth=${mode} · started ${new Date().toISOString()}\n\n`);
    // prompt ส่งทาง stdin (ไม่ใช่ arg) — กัน shell metachar (| ` { } ( )) ทำ prompt พังใต้ shell:true
    const args = [...CONFIG.executor.baseArgs, "--model", name, ...CONFIG.executor.extraArgs];
    const child = spawn(CONFIG.executor.command, args, { cwd: PATHS.ROOT, shell: true, env: childEnv(mode) });
    child.stdin.write(buildPrompt(t, model, "claude", opts.reworkNote)); child.stdin.end();
    let lineBuf = "", resultLine = null;
    child.stdout.on("data", (d) => {
      ws.write(d); lineBuf += d; let i;
      while ((i = lineBuf.indexOf("\n")) >= 0) { const ln = lineBuf.slice(0, i); lineBuf = lineBuf.slice(i + 1); if (ln.includes('"type":"result"')) resultLine = ln; }
    });
    child.stderr.on("data", (d) => ws.write(d));
    child.on("close", (code) => {
      let cost = 0, u = {}, blocked = false;
      if (resultLine) { try { const o = JSON.parse(resultLine); cost = o.total_cost_usd || 0; u = o.usage || {}; if (/^[\s>*-]*BLOCKED:/m.test(o.result || "")) blocked = true; } catch { /* */ } }
      if (blocked) ws.write(`\n# ⚠ ESCALATION: agent ตอบ BLOCKED (บริบทใน scope ไม่พอ) — surface ไม่ใช่เดาเงียบ\n`);
      ws.write(`\n# exit ${code}\n`); ws.end();
      recordUsage({ id: t.id, model, mode, cost, inTok: u.input_tokens || 0, outTok: u.output_tokens || 0, cache: (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) });
      res({ ok: code === 0 && !blocked, blocked, logFile, code });
    });
    child.on("error", (e) => { ws.write("\n# spawn error: " + e + "\n"); ws.end(); res({ ok: false, logFile, code: -1 }); });
  });
}

// Ollama: ยิง /api/chat แบบ stream → เขียนลง log สดให้ Agent Room tail ได้ (cost $0)
async function runOllama(t, name, model, worker, opts = {}) {
  if (!existsSync(PATHS.LOGS)) mkdirSync(PATHS.LOGS, { recursive: true });
  const logFile = join(PATHS.LOGS, `${t.id}.${worker}.log`);
  const ws = createWriteStream(logFile, { flags: "w" });
  ws.write(`# ${t.id} · ${worker} · ${model} · provider=ollama(local) · started ${new Date().toISOString()}\n# ● ollama ${name} (no quota / $0)\n\n`);
  const host = (CONFIG.ollama?.host || "http://127.0.0.1:11434").replace(/\/$/, "");
  const options = (CONFIG.ollama?.profiles || {})[scopeFor(t).profile] || {};
  let inTok = 0, outTok = 0, ok = false, acc = "", blocked = false, empty = false;
  try {
    const payload = { model: name, stream: true, options, messages: [{ role: "user", content: buildPrompt(t, model, "ollama", opts.reworkNote) }] };
    if (typeof CONFIG.ollama?.think === "boolean") payload.think = CONFIG.ollama.think; // ปิด thinking สำหรับงาน draft -> ตอบ content ตรง
    const resp = await fetch(`${host}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok || !resp.body) throw new Error(`ollama HTTP ${resp.status}`);
    const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = "";
    let inThink = false, sawContent = false;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const ln = buf.slice(0, i); buf = buf.slice(i + 1); if (!ln.trim()) continue;
        let o; try { o = JSON.parse(ln); } catch { continue; }
        const think = o.message?.thinking, content = o.message?.content;
        if (think) { if (!inThink) { ws.write("# ── reasoning (thinking) ──\n"); inThink = true; } ws.write(think); }
        if (content) { if (inThink && !sawContent) ws.write("\n\n# ── answer ──\n"); sawContent = true; ws.write(content); acc += content; if (acc.length > 6000) acc = acc.slice(-6000); }
        if (o.error) ws.write(`\n# ollama error: ${o.error}\n`);
        if (o.done) { inTok = o.prompt_eval_count || 0; outTok = o.eval_count || 0; ok = true; }
      }
    }
    if (/^[\s>*-]*BLOCKED:/m.test(acc)) { blocked = true; ws.write(`\n# ⚠ ESCALATION: worker ตอบ BLOCKED (บริบทไม่พอ) — surface ไม่ใช่เดา\n`); }
    if (ok && !acc.trim()) { empty = true; ws.write(`\n# ⚠ ไม่มี answer/content (โมเดลใช้โทเค็นไปกับ reasoning จน num_predict หมด หรือเป็น thinking model) — ถือว่าไม่สำเร็จ. ลอง profile ใหญ่ขึ้น หรือสลับเป็น non-thinking model เช่น ollama:gemma4:latest\n`); }
    ws.write(`\n\n# done · ${inTok} in / ${outTok} out tokens (local, $0) · profile=${scopeFor(t).profile}${empty ? " · EMPTY" : ""}\n`);
  } catch (e) {
    ws.write(`\n# ollama error: ${e.message}\n# ตรวจว่า ollama รันอยู่ (ollama serve) และมี model '${name}' (ollama pull ${name})\n`);
  }
  ws.end();
  recordUsage({ id: t.id, model, mode: "ollama", cost: 0, inTok, outTok, cache: 0 });
  const good = ok && !blocked && !empty;
  return { ok: good, blocked, empty, logFile, code: good ? 0 : 1 };
}

// เช็คว่า ollama พร้อมไหม + list models
export async function ollamaInfo() {
  if (!CONFIG.ollama?.enabled) return { enabled: false, up: false, models: [] };
  const host = (CONFIG.ollama?.host || "http://127.0.0.1:11434").replace(/\/$/, "");
  try {
    const r = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return { enabled: true, up: false, host, models: [] };
    const j = await r.json();
    return { enabled: true, up: true, host, models: (j.models || []).map((m) => m.name) };
  } catch { return { enabled: true, up: false, host, models: [] }; }
}

// ---------- usage ledger (token + cost ต่อ agent) ----------
const USAGE = join(PATHS.__dir, "usage.jsonl");
function recordUsage({ id, model, mode, cost = 0, inTok = 0, outTok = 0, cache = 0 }) {
  const rec = { t: now(), id, model, mode, cost, in: inTok, out: outTok, cache };
  try { appendFileSync(USAGE, JSON.stringify(rec) + "\n"); } catch { /* ignore */ }
}
const SESSION_MS = 5 * 3600 * 1000, WEEK_MS = 7 * 24 * 3600 * 1000;
export function readUsage() {
  const empty = () => ({ agents: 0, cost: 0, in: 0, out: 0, cache: 0, byModel: {} });
  const out = { session: empty(), weekly: empty(), sessionWindowH: 5, weekWindowD: 7 };
  if (!existsSync(USAGE)) return out;
  const nowT = now();
  let lines = [];
  try { lines = readFileSync(USAGE, "utf8").split("\n").filter(Boolean); } catch { return out; }
  for (const ln of lines) {
    let r; try { r = JSON.parse(ln); } catch { continue; }
    const add = (b) => { b.agents++; b.cost += r.cost || 0; b.in += r.in || 0; b.out += r.out || 0; b.cache += r.cache || 0; (b.byModel[r.model] ||= { agents: 0, cost: 0 }); b.byModel[r.model].agents++; b.byModel[r.model].cost += r.cost || 0; };
    if (nowT - r.t <= WEEK_MS) add(out.weekly);
    if (nowT - r.t <= SESSION_MS) add(out.session);
  }
  return out;
}

// ---------- worker pool (Run wave / Auto-run / Stop) ----------
let POOL = { active: false, stop: false, running: 0, mode: null, started: null, max: 0 };
export function poolStatus() { return { active: POOL.active, running: POOL.running, mode: POOL.mode, max: POOL.max }; }
export function stopPool() { POOL.stop = true; return { ok: true }; }

/**
 * runPool — ปล่อยงานให้ worker หลายตัวพร้อมกัน (non-blocking; วิ่งใน process ที่เรียก)
 *   mode "wave" = ปล่อยเฉพาะ task ที่ ready ตอนนี้ (snapshot ครั้งเดียว) ไม่ cascade
 *   mode "auto" = ปล่อยต่อเนื่อง เมื่อ dep เคลียร์ task ใหม่ ready ก็ดึงมาทำจนกว่าจะหมด/กด stop
 */
export function runPool({ mode = "wave", max = CONFIG.concurrency, worker = "pool" } = {}) {
  if (POOL.active) return { ok: false, error: "pool กำลังทำงานอยู่ (กด stop ก่อน)" };
  POOL = { active: true, stop: false, running: 0, mode, started: now(), max };
  let idx = 0;
  const inflight = new Set();
  const target = mode === "wave" ? new Set(readyTasks(loadState()).filter((t) => modelFor(t, loadState()) !== null).map((t) => t.id)) : null;

  const tick = () => {
    while (POOL.running < max && !POOL.stop) {
      const s = loadState(); reapStale(s);
      const cand = readyTasks(s).filter((t) => modelFor(t, s) !== null && (!target || target.has(t.id)));
      if (!cand.length) break;
      const t = cand[0];
      const w = `${worker}-${++idx}`;
      const c = claim(t.id, w);
      if (!c.ok) continue;
      setStatus(t.id, "running", { worker: w, claimedAt: now() });
      POOL.running++;
      const p = executeWithReview(byId(t.id), c.model, w).then(() => {
        POOL.running--; inflight.delete(p);
        if (!POOL.stop) tick();           // เมื่อมีคนว่าง ดึงงานต่อ (auto = cascade, wave = ในชุดเดิม)
      });
      inflight.add(p);
    }
    if (POOL.running === 0 && (POOL.stop || !readyHasWork(target))) {
      POOL.active = false; POOL.mode = null;
    }
  };
  const readyHasWork = (tg) => {
    const s = loadState();
    return readyTasks(s).some((t) => modelFor(t, s) !== null && (!tg || tg.has(t.id)));
  };
  tick();
  return { ok: true, started: true, mode, max };
}

// ---------- Verify Gate (ADR-O-001 / SPEC--VERIFY-GATE) ----------
function reviewerTierFor(workerModel) {
  const map = CONFIG.review?.reviewerByTier || {};
  const key = (typeof workerModel === "string" && workerModel.startsWith("ollama:")) ? "ollama" : workerModel;
  return map[key] || "sonnet";
}
export function requireReviewFor(t) {
  if (!CONFIG.review?.enabled) return false;
  if (typeof t.requireReview === "boolean") return t.requireReview;
  const m = modelFor(t, loadState());
  if (CONFIG.review?.skipForDraft && typeof m === "string" && m.startsWith("ollama:")) return false;
  return CONFIG.review?.requireReviewDefault !== false;
}
function parseVerdict(text) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { const o = JSON.parse(m[0]); return o.verdict ? o : null; } catch { return null; }
}
function buildReviewPrompt(t, output) {
  const s = scopeFor(t);
  const docs = s.docs.length ? s.docs.map((d) => `- ${d}`).join("\n") : "(none)";
  return [
    `คุณคือ reviewer อิสระ ตรวจ output ของ task เทียบ acceptance อย่างเข้มงวด — พยายามหาข้อผิดก่อน ไม่ใช่หาเหตุผลให้ผ่าน. ไม่มั่นใจให้ fail.`, ``,
    `# Task ${t.id}: ${t.title}`,
    `## Acceptance (เกณฑ์ผ่าน)`, t.accept, ``,
    `## บริบทอ้างอิง (อ่านได้ถ้าจำเป็น)`, docs, ``,
    `## OUTPUT ที่ worker ผลิต (ตรวจอันนี้)`, "```", String(output || "(ว่าง)").slice(-6000), "```", ``,
    `## ตอบเป็น JSON ล้วนเท่านั้น (ห้ามมีข้อความนอก JSON) ตาม schema:`,
    `{"verdict":"pass|fail","score":0,"issues":[{"severity":"critical|major|minor","area":"correctness|security|nfr|style","detail":"...","fix":"..."}],"summary":"หนึ่งบรรทัด"}`, ``,
    `เกณฑ์: ถ้ามีข้อผิดที่ทำให้ไม่ผ่าน acceptance หรือเป็นของปลอม/ใช้ไม่ได้จริง (เช่น GitHub Action ที่ไม่มีอยู่จริง) -> verdict=fail + issue severity critical.`,
  ].join("\n");
}
function runReview(t, workerModel, worker) {
  return new Promise((res) => {
    const reviewerModel = reviewerTierFor(workerModel);
    const output = readLog(t.id)?.text || "";
    const logFile = join(PATHS.LOGS, `${t.id}.${worker}.review.log`);
    const ws = createWriteStream(logFile, { flags: "w" });
    const mode = getAuthMode();
    ws.write(`# REVIEW ${t.id} · reviewer=${reviewerModel} (worker=${workerModel}) · auth=${mode} · ${new Date().toISOString()}\n\n`);
    const args = [...CONFIG.executor.baseArgs, "--model", reviewerModel, ...CONFIG.executor.extraArgs];
    const child = spawn(CONFIG.executor.command, args, { cwd: PATHS.ROOT, shell: true, env: childEnv(mode) });
    child.stdin.write(buildReviewPrompt(t, output)); child.stdin.end();   // prompt ทาง stdin กัน shell metachar
    let lineBuf = "", resultLine = null;
    child.stdout.on("data", (d) => { ws.write(d); lineBuf += d; let i; while ((i = lineBuf.indexOf("\n")) >= 0) { const ln = lineBuf.slice(0, i); lineBuf = lineBuf.slice(i + 1); if (ln.includes('"type":"result"')) resultLine = ln; } });
    child.stderr.on("data", (d) => ws.write(d));
    child.on("close", (code) => {
      let text = "", cost = 0, u = {};
      if (resultLine) { try { const o = JSON.parse(resultLine); text = o.result || ""; cost = o.total_cost_usd || 0; u = o.usage || {}; } catch { /* */ } }
      recordUsage({ id: t.id + "#review", model: reviewerModel, mode, cost, inTok: u.input_tokens || 0, outTok: u.output_tokens || 0, cache: (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) });
      if (code !== 0 || !text) { ws.write(`\n# ⚠ reviewer ใช้ไม่ได้ (exit ${code}) — ไม่ auto-pass (fail-safe)\n`); ws.end(); return res({ ran: false }); }
      const v = parseVerdict(text);
      if (!v) { ws.write(`\n# ⚠ verdict UNPARSEABLE -> fail-safe (needs-rework)\n`); ws.end(); return res({ ran: true, pass: false, issues: [{ severity: "major", area: "review", detail: "reviewer output ไม่เป็น JSON" }], summary: "unparseable" }); }
      const failOn = CONFIG.review?.failOn || "critical";
      const issues = v.issues || [];
      const bad = issues.some((i) => i.severity === "critical" || (failOn === "major" && i.severity === "major"));
      const pass = v.verdict === "pass" && !bad;
      ws.write(`\n\n# verdict: ${v.verdict} · ${issues.length} issues · pass=${pass} · ${v.summary || ""}\n`);
      ws.end();
      res({ ran: true, pass, verdict: v.verdict, issues, summary: v.summary, reviewerModel });
    });
    child.on("error", (e) => { ws.write("\n# reviewer spawn error: " + e + "\n"); ws.end(); res({ ran: false }); });
  });
}
function formatReworkNote(review, attempt) {
  const lines = (review.issues || []).map((i) => `- [${i.severity || "?"}] ${i.area || ""}: ${i.detail || ""}${i.fix ? " → " + i.fix : ""}`);
  return `## ROUND ${attempt} — reviewer ตีกลับ แก้ตาม issues ให้ครบ:\n${lines.join("\n")}\n(reviewer summary: ${review.summary || ""})`;
}

// produce -> (review) -> done | needs-rework. จัดการ state เองทั้งหมด. ใช้โดย dispatchOne และ runPool
export async function executeWithReview(t, model, worker) {
  let round = 0, reworkNote = null;
  while (true) {
    const r = await runAgent(t, model, worker, { reworkNote });
    if (!r.ok) { setStatus(t.id, "failed"); return "failed"; }              // empty/blocked/exit≠0
    if (!requireReviewFor(t)) { setStatus(t.id, "done"); return "done"; }
    setStatus(t.id, "reviewing");
    const review = await runReview(t, model, worker);
    if (!review.ran) return "reviewing";                                    // reviewer ใช้ไม่ได้ -> ค้าง (lease reclaim ภายหลัง)
    if (review.pass) { setStatus(t.id, "done"); return "done"; }
    if (CONFIG.review?.autoRework && round < (CONFIG.review?.maxReworkRounds || 0)) {
      round++;
      reworkNote = formatReworkNote(review, round + 1);
      setStatus(t.id, "running", { worker, claimedAt: now() });
      continue;
    }
    setStatus(t.id, "needs-rework");
    return "needs-rework";
  }
}

// review output ที่ worker ผลิตไว้แล้ว (ไม่รัน worker ซ้ำ) — ใช้กรณีงานเสร็จแล้วแต่ยังไม่ผ่าน gate
export async function reviewExisting(id) {
  const t = byId(id); if (!t) return { ok: false, error: `ไม่พบ task ${id}` };
  const m = modelFor(t, loadState());
  if (!requireReviewFor(t)) { setStatus(id, "done"); return { ok: true, status: "done", skipped: true }; }
  setStatus(id, "reviewing");
  const review = await runReview(t, m, "reviewonly");
  if (!review.ran) { return { ok: true, status: "reviewing", review }; }
  const status = review.pass ? "done" : "needs-rework";
  setStatus(id, status);
  return { ok: true, status, review };
}

// dispatch หนึ่ง task แบบ async (claim->running->produce->review->done/needs-rework). ใช้โดย UI ปุ่ม ▶
export function dispatchOne(id, worker = "ui") {
  const t = byId(id); if (!t) return { ok: false, error: `ไม่พบ task ${id}` };
  const cur = loadState().tasks[id]?.status;
  if (["needs-rework", "failed", "reviewing"].includes(cur)) setStatus(id, "todo"); // re-dispatch
  const c = claim(id, worker);
  if (!c.ok) return c;
  const model = c.model;
  setStatus(id, "running", { worker, claimedAt: now() });
  executeWithReview(t, model, worker);   // ทำงานเบื้องหลัง + จัดการ review/state เอง
  return { ok: true, task: id, model, dispatched: true };
}

function latestLogFile(id) {
  if (!existsSync(PATHS.LOGS)) return null;
  const f = readdirSync(PATHS.LOGS).filter((n) => n.startsWith(id + "."));
  if (!f.length) return null;
  // เลือกไฟล์ที่แก้ล่าสุด (mtime) ไม่ใช่เรียงตามชื่อ — กันหยิบผิดเมื่อมีหลาย worker
  let best = null, bestT = -1;
  for (const n of f) { const p = join(PATHS.LOGS, n); const m = statSync(p).mtimeMs; if (m > bestT) { bestT = m; best = p; } }
  return best;
}
export function readLog(id) {
  const full = latestLogFile(id);
  if (!full) return null;
  return { file: full.split(/[\\/]/).pop(), text: readFileSync(full, "utf8") };
}
// อ่านเฉพาะส่วนใหม่จาก byte offset -> ใช้ tail/stream แบบ incremental
export function readLogChunk(id, offset = 0) {
  const full = latestLogFile(id);
  if (!full) return { file: null, size: 0, text: "", offset: 0 };
  const size = statSync(full).size;
  if (offset >= size) return { file: full.split(/[\\/]/).pop(), size, text: "", offset: size };
  const len = size - offset;
  const buf = Buffer.alloc(len);
  const fd = openSync(full, "r");
  try { readSync(fd, buf, 0, len, offset); } finally { closeSync(fd); }
  return { file: full.split(/[\\/]/).pop(), size, text: buf.toString("utf8"), offset: size };
}
