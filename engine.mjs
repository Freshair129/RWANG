/**
 * G-Maiden Orchestrator — shared engine
 * ใช้ร่วมกันโดย orchestrator.mjs (CLI) และ server.mjs (web UI).
 * ฟังก์ชันทั้งหมด return ค่าแบบ structured (ไม่ print) เพื่อให้ทั้ง CLI/HTTP ใช้ได้.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, openSync, closeSync, unlinkSync, readdirSync, createWriteStream, statSync, readSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getStore } from "./store/knowledge.mjs";
import { parseModel, resolveForRole, runProvider, listProviders, checkHealth, childEnvFor } from "./providers.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
// Alternate backlog (e.g. the self-hosting G-Orchestra build): GORCH_BACKLOG=gks/backlog.gorch.json
// keeps its OWN isolated state/lock so it never pollutes the default G-Maiden backlog.json/state.json.
export const BACKLOG_PATH = process.env.GORCH_BACKLOG ? resolve(__dir, process.env.GORCH_BACKLOG) : join(__dir, "backlog.json");
const STATE_PATH = process.env.GORCH_BACKLOG ? BACKLOG_PATH.replace(/\.json$/, ".state.json") : join(__dir, "state.json");
const LOCK_PATH = process.env.GORCH_BACKLOG ? STATE_PATH + ".lock" : join(__dir, ".state.lock");
export const PATHS = {
  __dir, ROOT,
  STATE: STATE_PATH,
  LOCK: LOCK_PATH,
  LOGS: join(__dir, "logs"),
};

export let CONFIG = loadJson(join(__dir, "config.json"));
export let BACKLOG = loadJson(BACKLOG_PATH).tasks;
// hot-reload: อ่าน config/backlog ใหม่จากดิสก์ (เรียกตอน snapshot) -> แก้ไฟล์แล้วเห็นผลทันทีไม่ต้อง restart
export function reload() {
  try { CONFIG = loadJson(join(__dir, "config.json")); BACKLOG = loadJson(BACKLOG_PATH).tasks; } catch { /* keep last good */ }
}

export const ACTIVE = new Set(["claimed", "running", "reviewing"]);

function loadJson(p) { return JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, "")); }
export function now() { return Date.now(); }
export function byId(id) { return BACKLOG.find((t) => t.id === id); }

export function modelFor(task, state) {
  const st = state?.tasks?.[task.id];
  if (st && st.modelOverride) return st.modelOverride;
  if (task.model) {
    const parsed = parseModel(task.model);
    return parsed ? `${parsed.provider}:${parsed.model}` : task.model;
  }
  const role = ownerRole(st?.owner) || roleFor(task);
  if (role === "manual" || role === null) return null;
  const resolved = resolveForRole(role, CONFIG);
  if (!resolved) return null;
  const base = `${resolved.provider}:${resolved.model}`;
  // planner-tiering: auto-downgrade to cheaper model when nearing cost cap (>80% spent)
  return tierDowngrade(base, role, state) || base;
}
// algo--planner-tiering: if session or weekly spend > 80% of cap, downgrade expensive models
function tierDowngrade(model, role, state) {
  const lim = effectiveLimits(state);
  const u = readUsage();
  const sessionPct = lim.sessionUsd ? u.session.cost / lim.sessionUsd : 0;
  const weeklyPct = lim.weeklyUsd ? u.weekly.cost / lim.weeklyUsd : 0;
  const pressure = Math.max(sessionPct, weeklyPct);
  if (pressure < 0.8) return null;
  // >80%: downgrade opus->sonnet, sonnet->haiku; keep local models as-is
  const DOWNGRADE = { "claude:opus": "claude:sonnet", "claude:sonnet": "claude:haiku" };
  if (DOWNGRADE[model]) return DOWNGRADE[model];
  // >90%: prefer local models over cloud entirely
  if (pressure >= 0.9) {
    const localResolved = resolveForRole(role, CONFIG, true);
    if (localResolved) return `${localResolved.provider}:${localResolved.model}`;
  }
  return null;
}
export function roleFor(task) { return CONFIG.routing[task.type] ?? "manual"; }
// owner/persona routing (config--persona-presets): an assigned owner overrides the task's
// type-routed role, so dispatch resolves the persona's role model (ARCHON -> architect -> opus).
let PERSONAS_CACHE = null;
function personaList() {
  if (PERSONAS_CACHE) return PERSONAS_CACHE;
  try { PERSONAS_CACHE = JSON.parse(readFileSync(new URL("./personas.json", import.meta.url), "utf8")).personas || []; }
  catch { PERSONAS_CACHE = []; }
  return PERSONAS_CACHE;
}
export function ownerRole(owner) { if (!owner) return null; const p = personaList().find((x) => x.id === owner); return p ? p.role : null; }
// DACI borrow capability (algo--ownership-borrow-checker): "exclusive" (&mut, a doer) | "shared"
// (& only, a reviewer/auditor — may NOT claim/dispatch). Reviewer/Informed personas are shared.
export function personaBorrow(owner) { if (!owner) return null; const p = personaList().find((x) => x.id === owner); return p ? (p.borrow || null) : null; }
// re-export for other modules
export { parseModel, resolveForRole, listProviders, checkHealth, childEnvFor };

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
  for (const t of BACKLOG) tasks[t.id] = { status: "todo", worker: null, claimedAt: null, modelOverride: null, attempts: 0, confirmed: false };
  return { tasks, authMode: CONFIG.auth?.mode || "plan", updatedAt: now() };
}
export function loadState() {
  if (!existsSync(PATHS.STATE)) { const s = freshState(); saveState(s); return s; }
  const s = loadJson(PATHS.STATE);
  for (const t of BACKLOG) if (!s.tasks[t.id]) s.tasks[t.id] = { status: "todo", worker: null, claimedAt: null, modelOverride: null, attempts: 0, confirmed: false };
  if (!s.authMode) s.authMode = CONFIG.auth?.mode || "plan";
  return s;
}

// ---------- auth (Plan quota ↔ API key — claude provider) ----------
export function getAuthMode() { return loadState().authMode || CONFIG.providers?.claude?.auth?.mode || "plan"; }
export function setAuthMode(mode) {
  if (!["plan", "apikey"].includes(mode)) return { ok: false, error: "mode ต้องเป็น plan|apikey" };
  withLock(() => {
    const s = loadState(); s.authMode = mode; saveState(s);
    // sync to live config so childEnvFor picks it up
    if (CONFIG.providers?.claude?.auth) CONFIG.providers.claude.auth.mode = mode;
  });
  return { ok: true, mode };
}
export function apiKeyAvailable() { return !!(CONFIG.providers?.claude?.auth?.apiKey || process.env.ANTHROPIC_API_KEY); }
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

// ---------- governance gate (guard--governance-gate / ADR B4) ----------
const AUTO_GATE_TYPES = new Set(["safety", "guard", "audit"]);
export function needsConfirm(t) {
  if (t.requiresConfirm) return true;
  // auto-gate by original atom type (encoded in id prefix: "guard--foo" → "guard")
  const atomType = t.id?.split("--")[0];
  if (atomType && AUTO_GATE_TYPES.has(atomType)) return true;
  if (AUTO_GATE_TYPES.has(t.type)) return true;
  return false;
}
export function isConfirmed(t, s) {
  return !!s.tasks[t.id]?.confirmed;
}
export function confirmAtom(id) {
  const t = byId(id); if (!t) return { ok: false, error: `ไม่พบ task ${id}` };
  if (!needsConfirm(t)) return { ok: true, id, alreadyOpen: true };
  withLock(() => { const s = loadState(); s.tasks[id].confirmed = true; saveState(s); });
  return { ok: true, id, confirmed: true };
}
export function unconfirmAtom(id) {
  const t = byId(id); if (!t) return { ok: false, error: `ไม่พบ task ${id}` };
  withLock(() => { const s = loadState(); s.tasks[id].confirmed = false; saveState(s); });
  return { ok: true, id, confirmed: false };
}

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
    const owner = s.tasks[id]?.owner;
    if (owner && personaBorrow(owner) === "shared") {
      saveState(s);
      return { ok: false, error: `⛔ DACI borrow: owner ${owner} is review-only (shared &) — cannot claim/&mut. Reassign to a doer (architect/coder/worker).` };
    }
    if (!isReady(t, s)) { saveState(s); return { ok: false, error: `${id} ยังไม่พร้อม (status=${s.tasks[id].status}, depsDone=${depsDone(t, s)})` }; }
    s.tasks[id] = { ...s.tasks[id], status: "claimed", worker, claimedAt: now(), attempts: s.tasks[id].attempts + 1 };
    saveState(s);
    return { ok: true, task: id, worker, model: modelFor(t, s) };
  });
}
export function setStatus(id, status, extra = {}) {
  const t = byId(id); if (!t) return { ok: false, error: `ไม่พบ task ${id}` };
  return withLock(() => {
    const s = loadState();
    // governance gate (guard--governance-gate): gated atoms cannot transition to running without confirm
    if (status === "running" && needsConfirm(t) && !isConfirmed(t, s)) {
      return { ok: false, error: `⛔ governance gate: ${id} ต้อง confirm ก่อน running (requiresConfirm / auto-gate type=${t.type})` };
    }
    s.tasks[id] = { ...s.tasks[id], status, ...extra };
    if (status === "todo") { s.tasks[id].worker = null; s.tasks[id].claimedAt = null; }
    saveState(s);
    return { ok: true, task: id, status };
  });
}
export function assign(id, model) {
  if (!byId(id)) return { ok: false, error: `ไม่พบ task ${id}` };
  withLock(() => { const s = loadState(); s.tasks[id].modelOverride = model || null; saveState(s); });
  return { ok: true, task: id, model };
}
// assign an owner / persona (DevProgress agent assignment, config--persona-presets) — a planning/
// ownership label, independent of claim/worker (which the engine sets on claim/dispatch).
export function assignOwner(id, owner) {
  if (!byId(id)) return { ok: false, error: `ไม่พบ task ${id}` };
  withLock(() => { const s = loadState(); s.tasks[id].owner = owner || null; saveState(s); });
  return { ok: true, task: id, owner: owner || null };
}
export function reset() { withLock(() => saveState(freshState())); return { ok: true }; }

// ---------- editable deps (feature--graph-editable) — writes back to the atom SOURCE + recompiles ----------
const GKS_BACKLOG = join(__dir, "gks", "backlog.gorch.json");
const GKS_ATOMS = join(__dir, "gks", "atoms.gorch.json");
export async function setDeps(id, deps) {
  deps = Array.isArray(deps) ? [...new Set(deps)] : [];
  const ids = new Set(BACKLOG.map((t) => t.id));
  if (!ids.has(id)) return { ok: false, error: `unknown atom ${id}` };
  if (deps.includes(id)) return { ok: false, error: "self-dependency not allowed" };
  for (const d of deps) if (!ids.has(d)) return { ok: false, error: `unknown dep ${d}` };
  const isGks = BACKLOG_PATH === GKS_BACKLOG && existsSync(GKS_ATOMS);
  if (isGks) {
    const src = JSON.parse(readFileSync(GKS_ATOMS, "utf8"));
    const atom = src.atoms.find((a) => a.id === id);
    if (!atom) return { ok: false, error: `atom ${id} not in source` };
    const prev = atom.deps || [];
    atom.deps = deps;
    const { validateSet, toBacklogTask } = await import("./gks/atom-schema.mjs");
    const { errors } = validateSet(src.atoms);
    if (errors.length) { atom.deps = prev; return { ok: false, error: errors[0] }; } // GKS-002 cycle etc -> reject, no write
    writeFileSync(GKS_ATOMS, JSON.stringify(src, null, 2) + "\n");
    writeFileSync(GKS_BACKLOG, JSON.stringify({ $schema: "engine backlog (compiled from gks/atoms.gorch.json)", block: src.block, tasks: src.atoms.map(toBacklogTask) }, null, 2) + "\n");
    reload();
    return { ok: true, id, deps };
  }
  // default backlog.json: edit task.deps in place; guard acyclic via detectCycle (revert on cycle)
  const bl = JSON.parse(readFileSync(BACKLOG_PATH, "utf8"));
  const t = bl.tasks.find((x) => x.id === id);
  if (!t) return { ok: false, error: `atom ${id} not in backlog` };
  const prev = t.deps || [];
  t.deps = deps; writeFileSync(BACKLOG_PATH, JSON.stringify(bl, null, 2) + "\n"); reload();
  try { detectCycle(); } catch (e) { t.deps = prev; writeFileSync(BACKLOG_PATH, JSON.stringify(bl, null, 2) + "\n"); reload(); return { ok: false, error: String(e.message || e) }; }
  return { ok: true, id, deps };
}

// ---------- knowledge / MemoryOS read (feature--memoryos) — the L0/L1 anti-error memory ----------
export function knowledgeOutcomes(limit = 200) {
  const BRAIN = join(__dir, "brain", "failures.jsonl");
  const mode = CONFIG.store?.knowledge || "file";
  if (!existsSync(BRAIN)) return { mode, count: 0, rows: [] };
  let rows = [];
  try { rows = readFileSync(BRAIN, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { /* */ }
  return { mode, count: rows.length, rows: rows.slice(-limit).reverse() };
}

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
      role: ownerRole(st.owner) || roleFor(t), model: modelFor(t, cur), perm: permissionFor(t),
      status: st.status, worker: st.worker, claimedAt: st.claimedAt,
      attempts: st.attempts, modelOverride: st.modelOverride,
      deps: t.deps || [], depsDone: depsDone(t, cur), ready: isReady(t, cur),
      accept: t.accept, est: t.est, state: t.state, moscow: t.moscow, rice: t.rice,
      gated: needsConfirm(t), confirmed: !!st.confirmed, owner: st.owner ?? null,
    };
  });
  // build model options from all enabled providers' models
  const modelOptions = [];
  for (const [pName, pDef] of Object.entries(CONFIG.providers || {})) {
    if (pDef.enabled === false) continue;
    if (pDef.tiers) for (const tier of Object.keys(pDef.tiers)) modelOptions.push(`${pName}:${pDef.tiers[tier]}`);
    else modelOptions.push(`${pName}:default`);
  }
  return {
    progress: { done, total, pct: total ? Math.round((done / total) * 100) : 0 },
    counts, reaped, updatedAt: cur.updatedAt,
    providers: listProviders(CONFIG),
    roles: CONFIG.roles || {},
    modelOptions,
    waves: waves().map((w) => w.map((t) => t.id)),
    pool: poolStatus(),
    auth: { mode: cur.authMode || CONFIG.providers?.claude?.auth?.mode || "plan", apiKeyAvailable: apiKeyAvailable() },
    usage: readUsage(),
    usageLimits: effectiveLimits(cur),
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
    profile: own.profile || (CONFIG.providers?.ollama?.tools ? CONFIG.providers?.ollama?.defaultToolsProfile : CONFIG.providers?.ollama?.defaultProfile) || "balanced",
  };
}

// L1 (SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP) — format "❌ past mistakes" คุม budget (~4 ตัวอักษร/token, ≤15% ของ budget)
function pastMistakesBlock(pastMistakes, budgetTokens) {
  if (!pastMistakes?.length) return null;
  const cap = Math.max(240, Math.floor((budgetTokens || 8000) * 0.15) * 4);
  const lines = [];
  for (const m of pastMistakes) {
    if (!m.issue) continue;
    const line = `- ❌ ${m.issue}${m.fix ? `  →  ✅ ${m.fix}` : ""}`;
    if (lines.join("\n").length + line.length + 1 > cap) break;
    lines.push(line);
  }
  return lines.length ? [`## ❌ ความผิดที่เคยเกิดกับงานคล้ายกัน — ห้ามทำซ้ำ (anti-error loop)`, ...lines].join("\n") : null;
}

// L2 — grounded context (GRL): "งานที่เกี่ยวข้อง" จาก retrieveContext (เสริม past-mistakes ไม่ซ้ำ)
function groundedBlock(grounded) {
  if (!grounded?.lines?.length) return null;
  return [`## บริบทงานที่เกี่ยวข้อง (grounded · ~${grounded.tokenEstimate ?? "?"} tok)`, ...grounded.lines.slice(0, 8).map((l) => `- ${l}`)].join("\n");
}

// provider groups: subprocess agents get doc paths, http-only agents get inline rules
// ollama is promoted to full-agent when tools:true (can read files directly)
const TEXT_ONLY_PROVIDERS = new Set(["ollama", "openrouter"]);
function isTextOnly(provider) {
  if (!TEXT_ONLY_PROVIDERS.has(provider)) return false;
  if (provider === "ollama" && CONFIG.providers?.ollama?.tools) return false;
  return true;
}

const FULL_PERM_TYPES = new Set(["code", "eval", "guard"]);
function permissionFor(t) {
  return FULL_PERM_TYPES.has(t.type) ? "full" : (CONFIG.providers?.claude?.defaultPermission || "safe");
}

export function buildPrompt(t, model, provider = "claude", reworkNote = null, pastMistakes = null, grounded = null) {
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
  const pm = pastMistakesBlock(pastMistakes, s.budgetTokens);
  if (pm) head.push(pm, ``);
  const gb = groundedBlock(grounded);
  if (gb) head.push(gb, ``);
  if (isTextOnly(provider)) {
    const p = [...head];
    if (s.needs.length) p.push(`## บริบทที่เกี่ยวข้อง`, s.needs.map((n) => `- ${n}`).join("\n"), ``);
    if (s.scaffold) p.push(`## โครงเริ่มต้น (เติมไส้ในให้สมบูรณ์ — scaffold-first)`, "```", s.scaffold, "```", ``);
    p.push(`## วิธีตอบ`, SMALL_MODEL_RULES, ``,
      `อย่าอ้าง/โหลดไฟล์เอกสารทั้งไฟล์ (โมเดลเล็กจะเสียสมาธิ) — ทำตาม acceptance + บริบทด้านบนเท่านั้น.`);
    return p.join("\n");
  }
  // full-agent providers (claude, codex, antigravity, ollama+tools): ชี้ path ให้ agent ไปอ่านเอง
  const ollamaHint = provider === "ollama" ? [
    `## โครงสร้างโปรเจกต์ (G-Maiden)`,
    `- ภาษาหลัก: Rust (src-tauri/src/) + React/TypeScript (src/src/)`,
    `- stack: Tauri v2, Axum, SQLite`,
    `- ไม่มีไฟล์ Python ในโปรเจกต์นี้`,
    `- root = G:/G-Maiden`,
    `- ใช้ tools (read_file, list_dir, bash, write_file) เพื่ออ่านและแก้ไขไฟล์จริงได้`, ``,
  ] : [];
  const docs = s.docs.length ? s.docs.map((d) => `- ${d}`).join("\n") : "- (ไม่ระบุ — ถ้าต้องการบริบทเพิ่ม ให้ escalate ด้วย BLOCKED)";
  const p = [...head, ...ollamaHint, `## อ่านก่อนเริ่ม (scope ที่ parent อนุญาตเท่านั้น — POLA)`, docs];
  if (s.excludes.length) p.push(`ห้ามแตะ/ดึง: ${s.excludes.join(", ")}`);
  if (s.scaffold) p.push(``, `## โครงเริ่มต้น`, "```", s.scaffold, "```");
  p.push(``, `## ข้อกำหนด`,
    `- ทำเฉพาะขอบเขต task นี้ + อ่านเฉพาะเอกสารใน scope ด้านบน`,
    `- เคารพ ADR/NFR (latency/CPU/RAM/FPS/privacy)`,
    `- ถ้าบริบทใน scope ไม่พอ: หยุดแล้วตอบ "BLOCKED: <สิ่งที่ขาด>" (escalate) — อย่าเดา`,
    `- จบด้วยสรุปสั้น ๆ ว่าทำอะไร ไฟล์ไหน ผ่าน acceptance อย่างไร`);
  return p.join("\n");
}

// ─── provider-backed agent execution (dispatch via providers.mjs) ───
export function runAgent(t, model, worker, opts = {}) {
  const parsed = parseModel(model);
  if (!parsed) return Promise.resolve({ ok: false, error: `cannot parse model: ${model}`, code: -1 });
  // sync auth mode for claude
  if (parsed.provider === "claude" && CONFIG.providers?.claude?.auth) {
    CONFIG.providers.claude.auth.mode = getAuthMode();
  }
  const prompt = buildPrompt(t, model, parsed.provider, opts.reworkNote, opts.pastMistakes, opts.grounded);
  const permissionMode = permissionFor(t);
  const provOpts = { profile: scopeFor(t).profile, permissionMode };
  return runProvider(parsed.provider, t, parsed.model, worker, prompt, CONFIG, PATHS, provOpts)
    .then((r) => {
      const u = r.usage || {};
      recordUsage({ id: t.id, model, mode: r.provider || parsed.provider, cost: u.cost || 0, inTok: u.inTok || 0, outTok: u.outTok || 0, cache: u.cache || 0 });
      return r;
    });
}

// provider health check (replaces ollamaInfo for all providers)
export async function ollamaInfo() {
  const prov = CONFIG.providers?.ollama;
  if (!prov || prov.enabled === false) return { enabled: false, up: false, models: [] };
  const h = await checkHealth("ollama", CONFIG);
  return { enabled: true, up: h.up, host: prov.host, models: h.models || [] };
}
export async function providersInfo() {
  const results = {};
  for (const [name, def] of Object.entries(CONFIG.providers || {})) {
    if (def.enabled === false) { results[name] = { enabled: false }; continue; }
    results[name] = { enabled: true, capabilities: def.capabilities || [], ...(await checkHealth(name, CONFIG)) };
  }
  return results;
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

// ---------- cost-cap (config--cost-cap-tiers) ----------
export function effectiveLimits(s = loadState()) {
  const ul = CONFIG.usageLimits || {};
  const tiers = ul.tiers || {};
  const tier = s.tier || ul.tier || Object.keys(tiers)[0] || null;
  const caps = (tier && tiers[tier]) || { sessionUsd: ul.sessionUsd ?? null, weeklyUsd: ul.weeklyUsd ?? null };
  return { tier, sessionUsd: caps.sessionUsd ?? null, weeklyUsd: caps.weeklyUsd ?? null, killSwitch: !!s.killSwitch, tiers: Object.keys(tiers) };
}
// returns a human reason if token-spend is currently blocked, else null
export function capBlock(s = loadState()) {
  const lim = effectiveLimits(s);
  if (lim.killSwitch) return "kill-switch on";
  const u = readUsage();
  if (lim.sessionUsd != null && u.session.cost >= lim.sessionUsd) return `session cap $${lim.sessionUsd} reached ($${u.session.cost.toFixed(2)})`;
  if (lim.weeklyUsd != null && u.weekly.cost >= lim.weeklyUsd) return `weekly cap $${lim.weeklyUsd} reached ($${u.weekly.cost.toFixed(2)})`;
  return null;
}
export function setTier(tier) {
  const tiers = CONFIG.usageLimits?.tiers || {};
  if (!tiers[tier]) return { ok: false, error: `unknown tier ${tier}` };
  withLock(() => { const s = loadState(); s.tier = tier; saveState(s); });
  return { ok: true, tier };
}
export function setKillSwitch(on) { withLock(() => { const s = loadState(); s.killSwitch = !!on; saveState(s); }); return { ok: true, killSwitch: !!on }; }

// ---------- worker pool (Run wave / Auto-run / Stop) ----------
let POOL = { active: false, stop: false, running: 0, mode: null, started: null, max: 0, capReason: null };
export function poolStatus() { return { active: POOL.active, running: POOL.running, mode: POOL.mode, max: POOL.max, stop: POOL.stop, capReason: POOL.capReason }; }
export function stopPool() { POOL.stop = true; return { ok: true }; }

/**
 * runPool — ปล่อยงานให้ worker หลายตัวพร้อมกัน (non-blocking; วิ่งใน process ที่เรียก)
 *   mode "wave" = ปล่อยเฉพาะ task ที่ ready ตอนนี้ (snapshot ครั้งเดียว) ไม่ cascade
 *   mode "auto" = ปล่อยต่อเนื่อง เมื่อ dep เคลียร์ task ใหม่ ready ก็ดึงมาทำจนกว่าจะหมด/กด stop
 */
export function runPool({ mode = "wave", max = CONFIG.concurrency, worker = "pool" } = {}) {
  if (POOL.active) return { ok: false, error: "pool กำลังทำงานอยู่ (กด stop ก่อน)" };
  const block0 = capBlock();
  if (block0) return { ok: false, error: "cost cap: " + block0 };
  POOL = { active: true, stop: false, running: 0, mode, started: now(), max, capReason: null };
  let idx = 0;
  const inflight = new Set();
  const target = mode === "wave" ? new Set(readyTasks(loadState()).filter((t) => modelFor(t, loadState()) !== null).map((t) => t.id)) : null;

  const tick = () => {
    const blk = capBlock();
    if (blk) { POOL.stop = true; POOL.capReason = blk; }
    while (POOL.running < max && !POOL.stop) {
      const s = loadState(); reapStale(s);
      const cand = readyTasks(s).filter((t) => modelFor(t, s) !== null && (!target || target.has(t.id)) && (!needsConfirm(t) || isConfirmed(t, s)));
      if (!cand.length) break;
      const t = cand[0];
      const w = `${worker}-${++idx}`;
      const c = claim(t.id, w);
      if (!c.ok) continue;
      const rs = setStatus(t.id, "running", { worker: w, claimedAt: now() });
      if (!rs.ok) { setStatus(t.id, "todo"); continue; }  // gate fired after claim (race) → reset + skip
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
function reviewerModelFor(_workerModel) {
  const reviewerRole = CONFIG.review?.reviewerRole || "reviewer";
  const resolved = resolveForRole(reviewerRole, CONFIG);
  return resolved ? `${resolved.provider}:${resolved.model}` : "claude:sonnet";
}
export function requireReviewFor(t) {
  if (!CONFIG.review?.enabled) return false;
  if (typeof t.requireReview === "boolean") return t.requireReview;
  if (CONFIG.review?.skipForDraft) {
    const m = modelFor(t, loadState());
    const parsed = m ? parseModel(m) : null;
    if (parsed && TEXT_ONLY_PROVIDERS.has(parsed.provider)) return false;
  }
  return CONFIG.review?.requireReviewDefault !== false;
}
function jsonEnd(s) {
  // walk s from index 0, return index of matching closing } (handles strings correctly)
  let depth = 0, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\" && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") { if (--depth === 0) return i; }
  }
  return -1;
}
function parseVerdict(text) {
  if (!text) return null;
  // 1. prefer ```json ... ``` fenced block (models often wrap verdict in markdown)
  const fence = text.match(/```(?:json)?\s*\n?(\{[\s\S]*?\})\s*\n?```/);
  if (fence) {
    try { const o = JSON.parse(fence[1]); if (o.verdict) return o; } catch {}
  }
  // 2. find every { working right-to-left; parse the first one that has a verdict key
  const opens = [...text.matchAll(/\{/g)].map((m) => m.index);
  for (let i = opens.length - 1; i >= 0; i--) {
    const end = jsonEnd(text.slice(opens[i]));
    if (end < 0) continue;
    try { const o = JSON.parse(text.slice(opens[i], opens[i] + end + 1)); if (o.verdict) return o; } catch {}
  }
  return null;
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
async function runReview(t, workerModel, worker) {
  const reviewerFull = reviewerModelFor(workerModel);
  const parsed = parseModel(reviewerFull);
  if (!parsed) return { ran: false };
  const output = readLog(t.id)?.text || "";
  const prompt = buildReviewPrompt(t, output);
  // sync auth for claude
  if (parsed.provider === "claude" && CONFIG.providers?.claude?.auth) {
    CONFIG.providers.claude.auth.mode = getAuthMode();
  }
  const reviewTask = { ...t, id: `${t.id}#review` };
  const r = await runProvider(parsed.provider, reviewTask, parsed.model, `${worker}.review`, prompt, CONFIG, PATHS);
  const u = r.usage || {};
  recordUsage({ id: t.id + "#review", model: reviewerFull, mode: r.provider || parsed.provider, cost: u.cost || 0, inTok: u.inTok || 0, outTok: u.outTok || 0, cache: u.cache || 0 });
  if (!r.ok && !r.logFile) return { ran: false };
  const text = r.logFile ? readFileSync(r.logFile, "utf8") : "";
  // extract result text for claude (stream-json format)
  let resultText = text;
  const resultMatch = text.match(/"type":"result".*?"result":"([\s\S]*?)"/);
  if (resultMatch) {
    try { const o = JSON.parse(text.split("\n").find((l) => l.includes('"type":"result"'))); resultText = o.result || text; } catch { /* use full text */ }
  }
  const v = parseVerdict(resultText);
  if (!v) return { ran: true, pass: false, issues: [{ severity: "major", area: "review", detail: "reviewer output ไม่เป็น JSON" }], summary: "unparseable" };
  const failOn = CONFIG.review?.failOn || "critical";
  const issues = v.issues || [];
  const bad = issues.some((i) => i.severity === "critical" || (failOn === "major" && i.severity === "major"));
  const pass = v.verdict === "pass" && !bad;
  return { ran: true, pass, verdict: v.verdict, issues, summary: v.summary, reviewerModel: reviewerFull };
}
function formatReworkNote(review, attempt) {
  const lines = (review.issues || []).map((i) => `- [${i.severity || "?"}] ${i.area || ""}: ${i.detail || ""}${i.fix ? " → " + i.fix : ""}`);
  return `## ROUND ${attempt} — reviewer ตีกลับ แก้ตาม issues ให้ครบ:\n${lines.join("\n")}\n(reviewer summary: ${review.summary || ""})`;
}

// L0 (ADR-O-003 / SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP) — เก็บความผิดที่ Verify Gate ตีกลับ
// write-only, fire-and-forget, best-effort: ห้ามทำ Verify Gate/pool ช้าหรือพัง
function recordOutcome(t, model, worker, status, review) {
  Promise.resolve().then(() =>
    getStore(CONFIG).recordOutcome({
      taskId: t.id, taskTitle: t.title, type: t.type, model, worker, status,
      at: new Date().toISOString(), issues: review?.issues || [], summary: review?.summary || "",
    })
  ).catch(() => { /* knowledge store ล้ม -> เงียบ ไม่กระทบ execution */ });
}

// L1/L2 — ดึง context มา inject ก่อน dispatch (best-effort, ไม่บล็อก/ไม่ throw)
async function queryPastMistakes(t) {       // L1: ❌ ความผิดที่คล้าย
  try { return (await getStore(CONFIG).queryContext(t, { k: 3 })) || []; }
  catch { return []; }
}
async function queryGrounded(t) {           // L2: บริบทงานที่เกี่ยวข้อง (GRL; genesisdb เท่านั้น)
  try { return (await getStore(CONFIG).groundContext(t, { tier: "H1", budget: scopeFor(t).budgetTokens })) || null; }
  catch { return null; }
}

// produce -> (review) -> done | needs-rework. จัดการ state เองทั้งหมด. ใช้โดย dispatchOne และ runPool
export async function executeWithReview(t, model, worker) {
  let round = 0, reworkNote = null;
  const [pastMistakes, grounded] = await Promise.all([queryPastMistakes(t), queryGrounded(t)]);  // L1+L2
  while (true) {
    const r = await runAgent(t, model, worker, { reworkNote, pastMistakes, grounded });
    if (!r.ok) { setStatus(t.id, "failed"); recordOutcome(t, model, worker, "failed", null); return "failed"; } // empty/blocked/exit≠0
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
    recordOutcome(t, model, worker, "needs-rework", review);
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
  const block = capBlock();
  if (block) return { ok: false, error: "cost cap: " + block };
  // governance gate: requiresConfirm atoms need explicit human confirm before dispatch
  if (needsConfirm(t) && !isConfirmed(t, loadState())) {
    return { ok: false, error: `⛔ governance gate: ${id} ต้อง confirm ก่อน dispatch (requiresConfirm / auto-gate type=${t.type})` };
  }
  const cur = loadState().tasks[id]?.status;
  if (["needs-rework", "failed", "reviewing"].includes(cur)) setStatus(id, "todo"); // re-dispatch
  const c = claim(id, worker);
  if (!c.ok) return c;
  const model = c.model;
  const runRes = setStatus(id, "running", { worker, claimedAt: now() });
  if (!runRes.ok) { setStatus(id, "todo"); return runRes; }  // gate fired after claim (race) → reset
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
