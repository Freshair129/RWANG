/**
 * Switch the Ollama VRAM budget between two modes on this 12GB RTX 3060, so the
 * local LLM never starves the game/stream stack (Dota2 + Unity overlay + Discord
 * + Chrome + Twitch). Sets OLLAMA_GPU_OVERHEAD (bytes Ollama must leave free) +
 * OLLAMA_MAX_LOADED_MODELS, persists via setx, then restarts the Ollama tray app.
 *
 *   node vram-mode.mjs build   # dev/codegen, no game running → Ollama gets ~9GB
 *   node vram-mode.mjs match   # live Dota match → reserve ~9GB for the game, Ollama ~3GB
 *   node vram-mode.mjs status  # show current persisted budget
 *
 * Budget (12GB total):
 *   build : reserve 3GB (OS+Chrome+Discord+Twitch baseline)  → Ollama ≤ ~9GB, MAX_LOADED=2
 *   match : reserve 9GB (Dota+Unity+stream+baseline)         → Ollama ≤ ~3GB, MAX_LOADED=1 (tiny SLM only)
 */
import { execSync, spawn } from "node:child_process";

const GB = 1024 ** 3;
const MODES = {
  build: { overhead: 3 * GB, maxLoaded: 2, note: "dev/codegen, no game — Ollama ~9GB" },
  match: { overhead: 9 * GB, maxLoaded: 1, note: "live Dota — reserve game stack, Ollama ~3GB (tiny SLM)" },
};

const mode = (process.argv[2] || "status").toLowerCase();
const OLLAMA_APP = "C:\\Users\\freshair\\AppData\\Local\\Programs\\Ollama\\ollama app.exe";

function reg(name) {
  try { const o = execSync(`reg query "HKCU\\Environment" /v ${name}`, { encoding: "utf8" }); return o.split(/\s+/).filter(Boolean).pop(); }
  catch { return "(unset)"; }
}

if (mode === "status") {
  const oh = reg("OLLAMA_GPU_OVERHEAD");
  const ml = reg("OLLAMA_MAX_LOADED_MODELS");
  const ohGb = /^\d+$/.test(oh) ? (Number(oh) / GB).toFixed(1) + "GB" : oh;
  console.log(`OLLAMA_GPU_OVERHEAD     = ${oh} (${ohGb} reserved for other apps)`);
  console.log(`OLLAMA_MAX_LOADED_MODELS= ${ml}`);
  console.log(`→ Ollama may use ~${/^\d+$/.test(oh) ? (12 - Number(oh) / GB).toFixed(0) : "?"}GB of 12GB`);
  process.exit(0);
}

const cfg = MODES[mode];
if (!cfg) { console.error(`unknown mode '${mode}' — use: build | match | status`); process.exit(2); }

console.log(`→ ${mode} mode: ${cfg.note}`);
execSync(`setx OLLAMA_GPU_OVERHEAD ${cfg.overhead}`, { stdio: "ignore" });
execSync(`setx OLLAMA_MAX_LOADED_MODELS ${cfg.maxLoaded}`, { stdio: "ignore" });
console.log(`  reserved ${(cfg.overhead / GB).toFixed(0)}GB for OS/Dota/Unity/Discord/Chrome/Twitch · MAX_LOADED=${cfg.maxLoaded}`);

// restart Ollama so the new budget takes effect.
// NOTE: setx only affects FUTURE logins; a relaunch from this (stale-env) process
// inherits the OLD env. So we inject the new values into the spawned env directly
// for immediate effect — setx still persists them for the next reboot.
for (const img of ['"ollama app.exe"', '"ollama.exe"', '"llama-server.exe"']) {
  try { execSync(`taskkill /F /IM ${img}`, { stdio: "ignore" }); } catch { /* not running */ }
}
const childEnv = {
  ...process.env,
  OLLAMA_GPU_OVERHEAD: String(cfg.overhead),
  OLLAMA_MAX_LOADED_MODELS: String(cfg.maxLoaded),
  OLLAMA_FLASH_ATTENTION: process.env.OLLAMA_FLASH_ATTENTION || "1",
  OLLAMA_KEEP_ALIVE: process.env.OLLAMA_KEEP_ALIVE || "30m",
  OLLAMA_LOAD_TIMEOUT: process.env.OLLAMA_LOAD_TIMEOUT || "15m",
};
spawn("cmd", ["/c", "start", "", OLLAMA_APP], { detached: true, stdio: "ignore", env: childEnv }).unref();
console.log("  restarted Ollama — new VRAM budget active (this session + persisted for reboot)");
