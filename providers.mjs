/**
 * G-Orch Provider Registry — role-based multi-agent dispatch
 *
 * Provider = ระบบ AI ที่รันได้ (Claude, Ollama, Codex, OpenRouter, Antigravity)
 * Role     = บทบาท (architect, coder, reviewer, scout, worker) — ผูก capability + fallback chain
 *
 * Flow: task.type → routing[type] → role → roles[role].preferred → first enabled & capable provider
 */
import { existsSync, mkdirSync, createWriteStream, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join, resolve, isAbsolute, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAccounts, applyAccount, selectAccount, parseLimit } from "./accounts.mjs";
import { runImage } from "./image.mjs";

const __accdir = dirname(fileURLToPath(import.meta.url));
const ACCOUNTS_STATE = join(__accdir, "store", ".accounts-state.json");
const ACCOUNTS_SECRETS = join(__accdir, "accounts.local.json");
let _ACCT_REG = null;
function accountRegistry(config) {
  if (!_ACCT_REG) _ACCT_REG = loadAccounts(config, { secretsPath: ACCOUNTS_SECRETS });
  return _ACCT_REG;
}
// Drop the cached registry so the next dispatch re-reads config.json + accounts.local.json.
// Called by the Account Pool admin routes after a key paste / enable / rotation change.
export function resetAccountRegistry() { _ACCT_REG = null; }

// ─── capability tags ───
export const CAPS = Object.freeze({
  FILE_EDIT:     "file_edit",
  SHELL_EXEC:    "shell_exec",
  CODE_REVIEW:   "code_review",
  TEXT_GEN:      "text_gen",
  STREAMING:     "streaming",
  VISION:        "vision",
  LONG_CONTEXT:  "long_context",
  SANDBOX:       "sandbox",
  IMAGE_GEN:     "image_gen",
});

// ─── model string parsing ───
// format: "provider:model" — e.g. "claude:opus", "ollama:gemma4", "openrouter:anthropic/claude-sonnet-4"
// legacy bare names ("opus", "sonnet", "haiku") → claude:name for backward compat
const KNOWN_PREFIXES = new Set(["claude", "ollama", "codex", "openrouter", "antigravity", "openai-image", "local-image", "openrouter-image"]);

export function parseModel(model) {
  if (!model || typeof model !== "string") return null;
  const idx = model.indexOf(":");
  if (idx > 0) {
    const prefix = model.slice(0, idx);
    if (KNOWN_PREFIXES.has(prefix)) return { provider: prefix, model: model.slice(idx + 1) };
    // "ollama:gemma4-rust-coder:latest" — colon in model name after provider
    if (prefix === "ollama") return { provider: "ollama", model: model.slice(7) };
  }
  // legacy bare name → claude
  return { provider: "claude", model };
}

// ─── resolve model for a role using fallback chain ───
// Local = zero-cost, on-box (the image local runner counts as local too).
const LOCAL_PROVIDERS = new Set(["ollama", "local-image"]);
export function isLocalProvider(p) { return LOCAL_PROVIDERS.has(p); }

// Cost-mode gate (config--cost-mode): constrain the preferred chain to $0 providers.
//   "normal" → everything · "local" → local providers only (fully offline) ·
//   "free"   → local + OpenRouter *:free* models (network but $0 billing). Paid providers
//   (claude / codex / openai-image / non-free openrouter) are excluded under free/local.
export function isAllowedUnderMode(pref, costMode = "normal") {
  if (!costMode || costMode === "normal") return true;
  const parsed = parseModel(pref);
  if (!parsed) return false;
  if (LOCAL_PROVIDERS.has(parsed.provider)) return true;
  if (costMode === "free" && (parsed.provider === "openrouter" || parsed.provider === "openrouter-image")) {
    return /:free$/i.test(parsed.model || "");
  }
  return false;
}

export function resolveForRole(roleName, config, preferLocal = false, { costMode = "normal" } = {}) {
  const role = config.roles?.[roleName];
  if (!role?.preferred?.length) return null;
  let prefs = preferLocal ? [...role.preferred].sort((a, b) => {
    const aLocal = LOCAL_PROVIDERS.has(parseModel(a)?.provider);
    const bLocal = LOCAL_PROVIDERS.has(parseModel(b)?.provider);
    return (bLocal ? 1 : 0) - (aLocal ? 1 : 0);
  }) : role.preferred;
  prefs = prefs.filter((pref) => isAllowedUnderMode(pref, costMode)); // cost-mode gate
  for (const pref of prefs) {
    const parsed = parseModel(pref);
    if (!parsed) continue;
    const provDef = config.providers?.[parsed.provider];
    if (!provDef || provDef.enabled === false) continue;
    const required = role.requires || [];
    const caps = provDef.capabilities || [];
    if (required.every((r) => caps.includes(r))) return { ...parsed, roleName };
  }
  return null;
}

// ─── provider health checks ───
export async function checkHealth(providerName, config) {
  const prov = config.providers?.[providerName];
  if (!prov || prov.enabled === false) return { up: false, reason: "disabled" };
  switch (providerName) {
    case "ollama": return checkOllamaHealth(prov);
    case "claude": return checkClaudeHealth(prov);
    case "codex": return checkSubprocessHealth(prov, "codex");
    case "openrouter": return checkOpenRouterHealth(prov);
    case "antigravity": return checkSubprocessHealth(prov, "antigravity");
    case "openai-image": case "openrouter-image": return checkImageHealth(prov);
    case "local-image": return checkA1111Health(prov);
    default: return { up: false, reason: "unknown provider" };
  }
}

async function checkOllamaHealth(prov) {
  const host = (prov.host || "http://127.0.0.1:11434").replace(/\/$/, "");
  try {
    const r = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return { up: false, reason: `HTTP ${r.status}` };
    const j = await r.json();
    return { up: true, models: (j.models || []).map((m) => m.name) };
  } catch (e) { return { up: false, reason: e.message }; }
}

function checkClaudeHealth(prov) {
  const cmd = prov.command || "claude";
  return new Promise((res) => {
    const child = spawn(cmd, ["--version"], { shell: true, timeout: 5000 });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", (code) => res(code === 0 ? { up: true, version: out.trim() } : { up: false, reason: `exit ${code}` }));
    child.on("error", (e) => res({ up: false, reason: e.message }));
  });
}

async function checkOpenRouterHealth(prov) {
  const host = (prov.host || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const key = prov.auth?.apiKey || process.env[prov.auth?.envKey || "OPENROUTER_API_KEY"];
  if (!key) return { up: false, reason: "no API key" };
  try {
    const r = await fetch(`${host}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    return r.ok ? { up: true } : { up: false, reason: `HTTP ${r.status}` };
  } catch (e) { return { up: false, reason: e.message }; }
}

// image providers: OpenAI-compatible = key present; A1111 = local API reachable.
function checkImageHealth(prov) {
  const key = prov.auth?.apiKey || process.env[prov.apiKeyEnv || prov.auth?.envKey || "OPENAI_API_KEY"];
  return Promise.resolve(key ? { up: true } : { up: false, reason: `no API key (${prov.apiKeyEnv || "OPENAI_API_KEY"})` });
}
async function checkA1111Health(prov) {
  const host = (prov.host || "http://127.0.0.1:7860").replace(/\/$/, "");
  try {
    const r = await fetch(`${host}/sdapi/v1/sd-models`, { signal: AbortSignal.timeout(1500) });
    return r.ok ? { up: true } : { up: false, reason: `HTTP ${r.status}` };
  } catch (e) { return { up: false, reason: `A1111 not reachable: ${e.message}` }; }
}

function checkSubprocessHealth(prov, name) {
  const cmd = prov.command || name;
  return new Promise((res) => {
    const child = spawn(cmd, ["--version"], { shell: true, timeout: 5000 });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", (code) => res(code === 0 ? { up: true, version: out.trim() } : { up: false, reason: `exit ${code}` }));
    child.on("error", (e) => res({ up: false, reason: `${name} not found: ${e.message}` }));
  });
}

// ─── list all providers with status ───
export function listProviders(config) {
  const providers = config.providers || {};
  return Object.entries(providers).map(([name, def]) => ({
    name,
    enabled: def.enabled !== false,
    capabilities: def.capabilities || [],
    transport: def.transport || "unknown",
  }));
}

// ─── provider auth env ───
export function childEnvFor(providerName, config, account = null, provReg = null) {
  const env = { ...process.env };
  const prov = config.providers?.[providerName];
  if (!prov) { if (account) applyAccount(account, provReg, env); return env; }

  if (providerName === "claude") {
    const mode = prov.auth?.mode || "plan";
    if (mode === "plan") {
      delete env.ANTHROPIC_API_KEY;
      delete env.ANTHROPIC_AUTH_TOKEN;
    } else {
      const k = prov.auth?.apiKey || process.env.ANTHROPIC_API_KEY;
      if (k) env.ANTHROPIC_API_KEY = k;
    }
  } else if (prov.auth?.envKey) {
    const k = prov.auth?.apiKey || process.env[prov.auth.envKey];
    if (k) env[prov.auth.envKey] = k;
  }
  if (account) applyAccount(account, provReg, env);
  return env;
}

// ─── main dispatch ───
const RUNNERS = {
  claude: runClaude, ollama: runOllama, codex: runCodex, openrouter: runOpenRouter, antigravity: runAntigravity,
  "openai-image": runImage, "local-image": runImage, "openrouter-image": runImage,
};

export async function runProvider(providerName, task, model, worker, prompt, config, paths, opts = {}) {
  const runner = RUNNERS[providerName];
  if (!runner) return { ok: false, error: `unknown provider: ${providerName}`, code: -1 };

  // providerName lets image (and other multi-name) runners resolve their own config block.
  opts = { ...opts, providerName };

  // Multi-account rotation: if this provider registered accounts, pick one (spreading quota,
  // skipping cooled-down ones), apply it to the child env, then record usage + cooldown after.
  // Per-role rotation override (article's cache-vs-quota split): the task's role can pin its own
  // policy — cache-heavy roles run sticky (failover), quota-heavy/parallel roles run round-robin.
  const provReg = accountRegistry(config)[providerName];
  let sel = null;
  if (provReg && provReg.accounts?.length) {
    const role = config.routing?.[task?.type];
    const rotationOverride = (role && config.roles?.[role]?.rotation) || null;
    sel = selectAccount(providerName, provReg, ACCOUNTS_STATE, { rotationOverride });
    if (!sel.account) {
      return { ok: false, blocked: true, code: -2, provider: providerName, usage: {},
        error: `all ${providerName} accounts are cooling down (quota) — downgrade or wait for reset` };
    }
    opts = { ...opts, account: sel.account, provReg };
  }

  const result = await runner(task, model, worker, prompt, config, paths, opts);

  if (sel) {
    let text = result.error || "";
    try { if (result.logFile && existsSync(result.logFile)) text += "\n" + readFileSync(result.logFile, "utf8").slice(-4000); }
    catch { /* log not readable */ }
    const lim = parseLimit(providerName, { code: result.code, status: result.status, text });
    const u = result.usage || {};
    sel.note({ cost: u.cost || 0, tokens: (u.inTok || 0) + (u.outTok || 0), limited: lim.limited, resetMs: lim.resetMs });
  }
  return result;
}

// ─────────────────────────────────────────────
//  CLAUDE — subprocess (claude CLI)
// ─────────────────────────────────────────────
function runClaude(t, model, worker, prompt, config, paths, opts) {
  return new Promise((res) => {
    if (!existsSync(paths.LOGS)) mkdirSync(paths.LOGS, { recursive: true });
    const logFile = join(paths.LOGS, `${t.id}.${worker}.log`);
    const prov = config.providers.claude;
    const mode = prov.auth?.mode || "plan";
    const ws = createWriteStream(logFile, { flags: "w" });
    const permKey = opts.permissionMode || prov.defaultPermission || "safe";
    const permArgs = prov.permissionModes?.[permKey] || prov.permissionModes?.safe || ["--permission-mode", "acceptEdits"];
    ws.write(`# ${t.id} · ${worker} · claude:${model} · auth=${mode} · perm=${permKey} · started ${new Date().toISOString()}\n\n`);
    const args = [...(prov.baseArgs || []), "--model", model, ...permArgs, ...(prov.extraArgs || [])];
    const child = spawn(prov.command || "claude", args, {
      cwd: paths.ROOT, shell: true, env: childEnvFor("claude", config, opts.account, opts.provReg),
    });
    child.stdin.write(prompt); child.stdin.end();
    let lineBuf = "", resultLine = null;
    child.stdout.on("data", (d) => {
      ws.write(d); lineBuf += d; let i;
      while ((i = lineBuf.indexOf("\n")) >= 0) {
        const ln = lineBuf.slice(0, i); lineBuf = lineBuf.slice(i + 1);
        if (ln.includes('"type":"result"')) resultLine = ln;
      }
    });
    child.stderr.on("data", (d) => ws.write(d));
    child.on("close", (code) => {
      let cost = 0, u = {}, blocked = false;
      if (resultLine) {
        try {
          const o = JSON.parse(resultLine);
          cost = o.total_cost_usd || 0; u = o.usage || {};
          if (/^[\s>*-]*BLOCKED:/m.test(o.result || "")) blocked = true;
        } catch { /* */ }
      }
      if (blocked) ws.write(`\n# ⚠ ESCALATION: agent ตอบ BLOCKED — surface ไม่ใช่เดาเงียบ\n`);
      ws.write(`\n# exit ${code}\n`); ws.end();
      res({
        ok: code === 0 && !blocked, blocked, logFile, code, provider: "claude",
        usage: { cost, inTok: u.input_tokens || 0, outTok: u.output_tokens || 0, cache: (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) },
      });
    });
    child.on("error", (e) => { ws.write("\n# spawn error: " + e + "\n"); ws.end(); res({ ok: false, logFile, code: -1, provider: "claude", usage: {} }); });
  });
}

// ─────────────────────────────────────────────
//  OLLAMA — HTTP streaming (/api/chat)
// ─────────────────────────────────────────────
async function runOllama(t, model, worker, prompt, config, paths, opts) {
  if (config.providers.ollama?.tools) return runOllamaTools(t, model, worker, prompt, config, paths, opts);
  if (!existsSync(paths.LOGS)) mkdirSync(paths.LOGS, { recursive: true });
  const logFile = join(paths.LOGS, `${t.id}.${worker}.log`);
  const ws = createWriteStream(logFile, { flags: "w" });
  const prov = config.providers.ollama;
  ws.write(`# ${t.id} · ${worker} · ollama:${model} · provider=ollama(local) · started ${new Date().toISOString()}\n# ● ollama ${model} (no quota / $0)\n\n`);
  const host = (prov.host || "http://127.0.0.1:11434").replace(/\/$/, "");
  const profile = opts.profile || prov.defaultProfile || "balanced";
  const options = (prov.profiles || {})[profile] || {};
  let inTok = 0, outTok = 0, ok = false, acc = "", blocked = false, empty = false;
  try {
    const payload = {
      model, stream: true, options,
      messages: [{ role: "user", content: prompt }],
    };
    if (prov.keepAlive) payload.keep_alive = prov.keepAlive;
    if (typeof prov.think === "boolean") payload.think = prov.think;
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
        if (content) {
          if (inThink && !sawContent) ws.write("\n\n# ── answer ──\n");
          sawContent = true; ws.write(content); acc += content;
          if (acc.length > 6000) acc = acc.slice(-6000);
        }
        if (o.error) ws.write(`\n# ollama error: ${o.error}\n`);
        if (o.done) { inTok = o.prompt_eval_count || 0; outTok = o.eval_count || 0; ok = true; }
      }
    }
    if (/^[\s>*-]*BLOCKED:/m.test(acc)) { blocked = true; ws.write(`\n# ⚠ ESCALATION: worker ตอบ BLOCKED\n`); }
    if (ok && !acc.trim()) { empty = true; ws.write(`\n# ⚠ ไม่มี answer/content — ถือว่าไม่สำเร็จ\n`); }
    ws.write(`\n\n# done · ${inTok} in / ${outTok} out tokens (local, $0) · profile=${profile}${empty ? " · EMPTY" : ""}\n`);
  } catch (e) {
    ws.write(`\n# ollama error: ${e.message}\n# ตรวจว่า ollama รันอยู่ (ollama serve) และมี model '${model}' (ollama pull ${model})\n`);
  }
  ws.end();
  const good = ok && !blocked && !empty;
  return {
    ok: good, blocked, empty, logFile, code: good ? 0 : 1, provider: "ollama",
    usage: { cost: 0, inTok, outTok, cache: 0 },
  };
}

// ─────────────────────────────────────────────
//  OLLAMA TOOL LOOP — function-calling mode
// ─────────────────────────────────────────────
const OLLAMA_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the full content of a file on disk.",
      parameters: { type: "object", properties: { path: { type: "string", description: "Absolute or project-relative path" } }, required: ["path"] },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write (overwrite) content to a file. Creates parent directories if needed.",
      parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and subdirectories at a path.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
  },
  {
    type: "function",
    function: {
      name: "bash",
      description: "Run a shell command in the project root directory. Avoid long-running processes.",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
    },
  },
];

function execOllamaTool(name, args, root) {
  // normalize model output: /G:/foo → G:/foo (model sometimes prepends / on Windows paths)
  const safePath = (p) => { const c = p.replace(/^\/([A-Za-z]:)/, "$1"); return isAbsolute(c) ? c : resolve(root, c); };
  try {
    switch (name) {
      case "read_file": {
        const p = safePath(args.path);
        if (!existsSync(p)) return `ERROR: file not found: ${p}`;
        const content = readFileSync(p, "utf8");
        return content.length > 12000 ? content.slice(0, 12000) + "\n... (truncated)" : content;
      }
      case "write_file": {
        const p = safePath(args.path);
        // Safety: refuse to silently shrink an existing file — model must read first then write full merged content
        if (existsSync(p)) {
          const existing = readFileSync(p, "utf8");
          if (existing.length > 300 && args.content.length < existing.length * 0.5) {
            return `ERROR: refusing to overwrite ${p} (existing ${existing.length} chars) with much smaller content (${args.content.length} chars). Use read_file first, then write the complete merged file.`;
          }
        }
        const dir = p.slice(0, p.lastIndexOf("/") < 0 ? p.lastIndexOf("\\") : p.lastIndexOf("/")) || ".";
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(p, args.content, "utf8");
        return `OK: wrote ${args.content.length} chars to ${p}`;
      }
      case "list_dir": {
        const p = safePath(args.path);
        if (!existsSync(p)) return `ERROR: path not found: ${p}`;
        const entries = readdirSync(p).map((n) => {
          try { return statSync(join(p, n)).isDirectory() ? n + "/" : n; } catch { return n; }
        });
        return entries.join("\n") || "(empty)";
      }
      case "bash": {
        // use bash explicitly so Unix commands (find, grep, ls) work on Windows
        const r = spawnSync("bash", ["-c", args.command], { cwd: root, timeout: 30000, encoding: "utf8" });
        const out = ((r.stdout || "") + (r.stderr || "")).slice(0, 8000);
        return out || `(exit ${r.status ?? r.error?.message ?? "?"})`;
      }
      default:
        return `ERROR: unknown tool ${name}`;
    }
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

async function runOllamaTools(t, model, worker, prompt, config, paths, opts) {
  if (!existsSync(paths.LOGS)) mkdirSync(paths.LOGS, { recursive: true });
  const logFile = join(paths.LOGS, `${t.id}.${worker}.log`);
  const ws = createWriteStream(logFile, { flags: "w" });
  const prov = config.providers.ollama;
  const host = (prov.host || "http://127.0.0.1:11434").replace(/\/$/, "");
  const profile = opts.profile || prov.defaultToolsProfile || prov.defaultProfile || "balanced";
  const options = (prov.profiles || {})[profile] || {};
  ws.write(`# ${t.id} · ${worker} · ollama:${model} · provider=ollama(tools) · profile=${profile} · started ${new Date().toISOString()}\n# ● ollama ${model} (no quota / $0)\n\n`);

  const messages = [{ role: "user", content: prompt }];
  let inTok = 0, outTok = 0, acc = "", blocked = false, ok = false;
  const maxIter = prov.toolsMaxIter || 20;

  try {
    for (let iter = 0; iter < maxIter; iter++) {
      const payload = { model, stream: false, tools: OLLAMA_TOOLS, messages, options };
      if (prov.keepAlive) payload.keep_alive = prov.keepAlive;
      if (typeof prov.think === "boolean") payload.think = prov.think;
      const resp = await fetch(`${host}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) { const err = await resp.text(); throw new Error(`ollama HTTP ${resp.status}: ${err.slice(0, 200)}`); }
      const o = await resp.json();
      inTok += o.prompt_eval_count || 0;
      outTok += o.eval_count || 0;

      const msg = o.message || {};
      messages.push(msg);

      // log thinking if present
      if (msg.thinking) ws.write(`# ── thinking (iter ${iter}) ──\n${msg.thinking}\n\n`);

      if (msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          const fn = tc.function?.name || tc.name;
          const fnArgs = tc.function?.arguments ?? tc.arguments ?? {};
          const parsed = typeof fnArgs === "string" ? JSON.parse(fnArgs) : fnArgs;
          ws.write(`# → tool: ${fn}(${JSON.stringify(parsed)})\n`);
          const result = execOllamaTool(fn, parsed, paths.ROOT);
          ws.write(`# ← ${result.slice(0, 300)}${result.length > 300 ? "..." : ""}\n\n`);
          messages.push({ role: "tool", content: result });
        }
      } else {
        // no more tool calls — final answer
        acc = msg.content || "";
        // Qwen3 sometimes returns only thinking with empty content — use thinking as fallback
        if (!acc && msg.thinking) { acc = msg.thinking; ws.write("# (thinking used as answer fallback)\n"); }
        ok = true;
        break;
      }
    }
    if (!ok) ws.write(`\n# ⚠ hit maxIter (${maxIter}) without final answer\n`);
    if (acc) ws.write(acc);
    if (/^[\s>*-]*BLOCKED:/m.test(acc)) { blocked = true; ws.write(`\n# ⚠ ESCALATION: worker ตอบ BLOCKED\n`); }
    const empty = ok && !acc.trim();
    if (empty) ws.write(`\n# ⚠ ไม่มี answer/content — ถือว่าไม่สำเร็จ\n`);
    ws.write(`\n\n# done · ${inTok} in / ${outTok} out tokens (local, $0) · profile=${profile}\n`);
    ws.end();
    const good = ok && !blocked && !empty;
    return { ok: good, blocked, empty, logFile, code: good ? 0 : 1, provider: "ollama",
      usage: { cost: 0, inTok, outTok, cache: 0 } };
  } catch (e) {
    ws.write(`\n# ollama error: ${e.message}\n`);
    ws.end();
    return { ok: false, logFile, code: 1, provider: "ollama", usage: { cost: 0, inTok, outTok, cache: 0 } };
  }
}

// ─────────────────────────────────────────────
//  CODEX — subprocess (codex CLI, OpenAI)
// ─────────────────────────────────────────────
function runCodex(t, model, worker, prompt, config, paths, opts) {
  return new Promise((res) => {
    if (!existsSync(paths.LOGS)) mkdirSync(paths.LOGS, { recursive: true });
    const logFile = join(paths.LOGS, `${t.id}.${worker}.log`);
    const prov = config.providers.codex;
    const ws = createWriteStream(logFile, { flags: "w" });
    ws.write(`# ${t.id} · ${worker} · codex:${model} · started ${new Date().toISOString()}\n\n`);
    const args = [...(prov.baseArgs || []), "--model", model, ...(prov.extraArgs || [])];
    const child = spawn(prov.command || "codex", args, {
      cwd: paths.ROOT, shell: true, env: childEnvFor("codex", config, opts.account, opts.provReg),
    });
    child.stdin.write(prompt); child.stdin.end();
    let stdout = "";
    child.stdout.on("data", (d) => { ws.write(d); stdout += d; });
    child.stderr.on("data", (d) => ws.write(d));
    child.on("close", (code) => {
      const blocked = /^[\s>*-]*BLOCKED:/m.test(stdout);
      ws.write(`\n# exit ${code}\n`); ws.end();
      res({
        ok: code === 0 && !blocked, blocked, logFile, code, provider: "codex",
        usage: { cost: 0, inTok: 0, outTok: 0, cache: 0 },
      });
    });
    child.on("error", (e) => { ws.write("\n# spawn error: " + e + "\n"); ws.end(); res({ ok: false, logFile, code: -1, provider: "codex", usage: {} }); });
  });
}

// ─────────────────────────────────────────────
//  OPENROUTER — HTTP (OpenAI-compatible API)
// ─────────────────────────────────────────────
async function runOpenRouter(t, model, worker, prompt, config, paths, opts) {
  if (!existsSync(paths.LOGS)) mkdirSync(paths.LOGS, { recursive: true });
  const logFile = join(paths.LOGS, `${t.id}.${worker}.log`);
  const ws = createWriteStream(logFile, { flags: "w" });
  const prov = config.providers.openrouter;
  const host = (prov.host || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const apiKey = opts.account?.apiKey || prov.auth?.apiKey || process.env[prov.auth?.envKey || "OPENROUTER_API_KEY"];
  ws.write(`# ${t.id} · ${worker} · openrouter:${model} · started ${new Date().toISOString()}\n\n`);
  if (!apiKey) {
    ws.write(`# ⚠ no API key for OpenRouter — set OPENROUTER_API_KEY or config.providers.openrouter.auth.apiKey\n`);
    ws.end();
    return { ok: false, logFile, code: -1, provider: "openrouter", usage: {} };
  }
  let acc = "", inTok = 0, outTok = 0, ok = false, blocked = false;
  try {
    const resp = await fetch(`${host}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/Freshair129/G-Maiden",
        "X-Title": "G-Maiden Orchestrator",
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) throw new Error(`OpenRouter HTTP ${resp.status}: ${await resp.text()}`);
    const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = "";
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const ln = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!ln.startsWith("data: ") || ln === "data: [DONE]") continue;
        let chunk; try { chunk = JSON.parse(ln.slice(6)); } catch { continue; }
        const delta = chunk.choices?.[0]?.delta?.content || "";
        if (delta) { ws.write(delta); acc += delta; }
        if (chunk.usage) { inTok = chunk.usage.prompt_tokens || 0; outTok = chunk.usage.completion_tokens || 0; }
      }
    }
    ok = true;
    if (/^[\s>*-]*BLOCKED:/m.test(acc)) { blocked = true; ws.write(`\n# ⚠ ESCALATION: agent ตอบ BLOCKED\n`); }
    ws.write(`\n\n# done · ${inTok} in / ${outTok} out tokens · openrouter:${model}\n`);
  } catch (e) {
    ws.write(`\n# openrouter error: ${e.message}\n`);
  }
  ws.end();
  const good = ok && !blocked && !!acc.trim();
  return {
    ok: good, blocked, logFile, code: good ? 0 : 1, provider: "openrouter",
    usage: { cost: 0, inTok, outTok, cache: 0 },
  };
}

// ─────────────────────────────────────────────
//  ANTIGRAVITY — subprocess
// ─────────────────────────────────────────────
function runAntigravity(t, model, worker, prompt, config, paths, opts) {
  return new Promise((res) => {
    if (!existsSync(paths.LOGS)) mkdirSync(paths.LOGS, { recursive: true });
    const logFile = join(paths.LOGS, `${t.id}.${worker}.log`);
    const prov = config.providers.antigravity;
    const ws = createWriteStream(logFile, { flags: "w" });
    ws.write(`# ${t.id} · ${worker} · antigravity:${model} · started ${new Date().toISOString()}\n\n`);
    // agy headless: pass the prompt via -p (the documented non-interactive mode). Set
    // providers.antigravity.promptMode="stdin" if your agy build reads the prompt on stdin instead.
    const promptMode = prov.promptMode || "arg";
    const args = [
      ...(prov.baseArgs || []),
      ...(promptMode === "arg" ? ["-p", prompt] : []),
      ...(model && model !== "default" ? ["--model", model] : []),
      ...(prov.extraArgs || []),
    ];
    const child = spawn(prov.command || "agy", args, {
      cwd: paths.ROOT, shell: true, env: childEnvFor("antigravity", config, opts.account, opts.provReg),
    });
    if (promptMode === "stdin") { child.stdin.write(prompt); child.stdin.end(); }
    else { try { child.stdin.end(); } catch { /* */ } }
    let stdout = "";
    child.stdout.on("data", (d) => { ws.write(d); stdout += d; });
    child.stderr.on("data", (d) => ws.write(d));
    child.on("close", (code) => {
      const blocked = /^[\s>*-]*BLOCKED:/m.test(stdout);
      ws.write(`\n# exit ${code}\n`); ws.end();
      res({
        ok: code === 0 && !blocked, blocked, logFile, code, provider: "antigravity",
        usage: { cost: 0, inTok: 0, outTok: 0, cache: 0 },
      });
    });
    child.on("error", (e) => { ws.write("\n# spawn error: " + e + "\n"); ws.end(); res({ ok: false, logFile, code: -1, provider: "antigravity", usage: {} }); });
  });
}
