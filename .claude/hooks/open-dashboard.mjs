#!/usr/bin/env node
/**
 * SessionStart hook — auto-open the Rwang dashboard so it updates alongside the session.
 *
 * On every session start/resume at the repo root: ensure the orchestrator UI server is running
 * (spawn it detached if the port is closed), then open the dashboard in the default browser the
 * FIRST time the server comes up (so you get one live tab, not a new tab every session/compact).
 * Prints a one-line context note either way. Never blocks or fails the session — best-effort.
 *
 * Env knobs:
 *   RWANG_DASH_PORT   dashboard port (default 4577)
 *   RWANG_DASH_OPEN   auto (default: open only when we just started the server) | always | never
 *   RWANG_DASH        off  -> skip entirely
 *
 * Zero-dependency Node ESM. Registered in .claude/settings.json.
 */
import net from "node:net";
import { spawn } from "node:child_process";
import { existsSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = Number(process.env.RWANG_DASH_PORT) || 4577;
const URL = `http://localhost:${PORT}`;
const OPEN_MODE = (process.env.RWANG_DASH_OPEN || "auto").toLowerCase();

function log(msg) { try { appendFileSync(join(ROOT, "store", "dashboard.log"), `[${new Date().toISOString()}] ${msg}\n`); } catch { /* store/ may not exist yet */ } }
function note(line) { process.stdout.write(line + "\n"); } // SessionStart stdout is injected as context

function portOpen(port, timeout = 400) {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port }, () => { s.destroy(); resolve(true); });
    s.on("error", () => resolve(false));
    s.setTimeout(timeout, () => { s.destroy(); resolve(false); });
  });
}
async function waitPort(port, ms = 3000) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await portOpen(port, 300)) return true; await new Promise((r) => setTimeout(r, 150)); }
  return false;
}
function openBrowser(url) {
  const plat = process.platform;
  const [cmd, args] = plat === "win32" ? ["cmd", ["/c", "start", "", url]]
    : plat === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try { spawn(cmd, args, { detached: true, stdio: "ignore" }).unref(); } catch (e) { log("openBrowser failed: " + e.message); }
}

(async () => {
  if ((process.env.RWANG_DASH || "").toLowerCase() === "off") return;
  try {
    let up = await portOpen(PORT);
    let justStarted = false;
    if (!up) {
      const server = join(ROOT, "server.mjs");
      if (!existsSync(server)) { note(`📊 Dashboard: server.mjs not found — skipped`); return; }
      spawn("node", ["server.mjs", "--port", String(PORT)], { cwd: ROOT, detached: true, stdio: "ignore" }).unref();
      up = await waitPort(PORT, 3000);
      justStarted = up;
      log(up ? "server started" : "server did not come up in 3s");
    }
    const shouldOpen = OPEN_MODE === "always" || (OPEN_MODE !== "never" && justStarted);
    if (up && shouldOpen) openBrowser(URL);
    const state = justStarted ? (shouldOpen ? "started + opened" : "started")
      : (shouldOpen ? "reopened" : "already running");
    note(up
      ? `📊 Rwang dashboard: ${URL} — ${state}`
      : `📊 Rwang dashboard: could not start on ${PORT} (run \`node server.mjs\` manually)`);
  } catch (e) { log("hook error: " + e.message); }
})();
