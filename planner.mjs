/**
 * planner.mjs — V1 hybrid planner (TASK-HYB-RM-002)
 * A frontier model atomizes a freeform task + repo summary into engine backlog tasks
 * (id/title/type/phase/deps/est/accept), the same schema runPool consumes.
 *
 *   node planner.mjs "add a /health endpoint that returns 200"        # plan, print
 *   PLAN_MODEL=claude:sonnet node planner.mjs "..."                   # override planner model
 *   node planner.mjs "..." --write                                    # also write backlog.plan.json
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG, PATHS } from "./engine.mjs";
import { resolveForRole, parseModel, runProvider } from "./providers.mjs";

// ── repo summary (a slice of TASK-HYB-RM-004: repo-agnostic context) ──
export function summarizeRepo(root) {
  const has = (f) => existsSync(join(root, f));
  const stack = [];
  if (has("Cargo.toml")) stack.push("Rust (Cargo)");
  if (has("src-tauri")) stack.push("Tauri");
  if (has("package.json")) {
    try { const p = JSON.parse(readFileSync(join(root, "package.json"), "utf8")); stack.push(`Node:${p.name || "pkg"}`); if (p.dependencies?.react) stack.push("React"); if (p.dependencies?.axum) stack.push("axum"); } catch { /* */ }
  }
  if (has("pyproject.toml") || has("requirements.txt")) stack.push("Python");
  const dirs = readdirSync(root).filter((n) => { try { return statSync(join(root, n)).isDirectory() && !n.startsWith(".") && n !== "node_modules"; } catch { return false; } }).slice(0, 14);
  return `stack: ${stack.join(", ") || "unknown"}\ntop-level dirs: ${dirs.join(", ")}\nroot: ${root}`;
}

// ── extract assistant text from a runProvider logFile ──
function extractText(logFile, provider) {
  const raw = readFileSync(logFile, "utf8");
  if (provider === "claude") {
    const line = raw.split("\n").find((l) => l.includes('"type":"result"'));
    if (line) { try { return JSON.parse(line).result || raw; } catch { /* */ } }
  }
  return raw; // ollama/openrouter: content is the body
}

// ── robust JSON-array extraction (handles ```json fences + surrounding prose) ──
function parseTasks(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  for (const c of [fence?.[1], text].filter(Boolean)) {
    const start = c.indexOf("[");
    if (start < 0) continue;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < c.length; i++) {
      const ch = c[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\" && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "[") depth++;
      else if (ch === "]" && --depth === 0) { try { return JSON.parse(c.slice(start, i + 1)); } catch { break; } }
    }
  }
  return null;
}

const PLAN_PROMPT = (task, repo) => `You are the planning architect for a hybrid coding agent. Decompose the user's request into a small set of bounded, atomic implementation tasks — each one a single concern a worker (often a local small model) can finish in one focused step.

# Repository
${repo}

# User request
${task}

# Output
Return ONLY a JSON array (no prose, no markdown fence) of tasks. Each task object:
{"id":"T1","title":"imperative one-line","type":"code|config|test|docs|scaffold","phase":"0","deps":[],"est":1,"accept":"a concrete, checkable criterion that proves this task is done"}
Rules: 3-7 tasks for a normal request; one concern per task; "accept" must be verifiable (a command, a test, an observable behaviour); order by dependency via "deps" (ids). Output the JSON array only.`;

export async function planTasks(taskText, repoSummary, config = CONFIG, paths = PATHS, { role = "architect", model } = {}) {
  let provider, mdl;
  if (model) { const p = parseModel(model); if (!p) return { ok: false, error: `bad model: ${model}` }; provider = p.provider; mdl = p.model; }
  else { const r = resolveForRole(role, config) || resolveForRole("coder", config); if (!r) return { ok: false, error: "no frontier model resolved for planning" }; provider = r.provider; mdl = r.model; }

  const prompt = PLAN_PROMPT(taskText, repoSummary);
  const r = await runProvider(provider, { id: "PLAN" }, mdl, "planner", prompt, config, paths, {});
  if (!r.logFile) return { ok: false, error: "planner produced no output", usage: r.usage };

  const text = extractText(r.logFile, provider);
  const raw = parseTasks(text);
  if (!raw?.length) return { ok: false, error: "could not parse a JSON task array from planner output", sample: text.slice(-600), usage: r.usage, model: `${provider}:${mdl}` };

  const tasks = raw.map((t, i) => ({
    id: t.id || `T${i + 1}`,
    title: String(t.title || "untitled").trim(),
    type: t.type || "code",
    phase: String(t.phase ?? "0"),
    deps: Array.isArray(t.deps) ? t.deps : [],
    est: Number(t.est) || 1,
    accept: String(t.accept || "task complete").trim(),
  }));
  return { ok: true, tasks, model: `${provider}:${mdl}`, usage: r.usage };
}

// ── CLI entry (self-test for TASK-HYB-RM-002) ──
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("planner.mjs");
if (isMain) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const taskText = args.join(" ").trim();
  if (!taskText) { console.error('usage: node planner.mjs "<task>" [--write]'); process.exit(1); }
  const repo = summarizeRepo(PATHS.ROOT);
  console.log("=== PLAN ===");
  console.log("task :", taskText);
  console.log("repo :", repo.replace(/\n/g, "  |  "));
  const res = await planTasks(taskText, repo, CONFIG, PATHS, process.env.PLAN_MODEL ? { model: process.env.PLAN_MODEL } : {});
  if (!res.ok) { console.error("\nFAILED:", res.error); if (res.sample) console.error("output tail:", res.sample); process.exit(1); }
  console.log(`\nplanner model: ${res.model}  ·  cost $${(res.usage?.cost || 0).toFixed(4)}`);
  console.log(`--- ${res.tasks.length} atomic tasks ---`);
  for (const t of res.tasks) console.log(`  ${t.id} [${t.type}]  ${t.title}   (deps: ${t.deps.join(",") || "-"})\n        accept: ${t.accept}`);
  if (process.argv.includes("--write")) {
    const out = join(PATHS.__dir, "backlog.plan.json");
    writeFileSync(out, JSON.stringify({ $generated: new Date().toISOString(), task: taskText, tasks: res.tasks }, null, 2));
    console.log(`\nwrote ${res.tasks.length} tasks → ${out}`);
  }
}
