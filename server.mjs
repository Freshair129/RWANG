#!/usr/bin/env node
/**
 * G-Maiden Orchestrator — Web UI server
 *   node server.mjs [--port 4577]
 * เปิด http://localhost:4577 เพื่อ monitor + สั่งงาน (claim/done/fail/release/assign/dispatch/reset)
 * ไม่มี dependency ภายนอก (Node http ล้วน). ใช้ engine.mjs ร่วมกับ CLI.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as E from "./engine.mjs";
import { writeNode, writeEdge, queryNodes } from "./store/knowledge.mjs";
import { accountsStatus, fetchPlanQuotas, DEFAULT_STATE_PATH } from "./accounts.mjs";
import { resetAccountRegistry } from "./providers.mjs";
import {
  setAccountKey, resetCooldown, resetUsage,
  setProviderEnabled, setRotation, setUsageLimit, startLogin, clearAccount,
} from "./accounts-admin.mjs";

// Account-pool mutations touch secrets on disk — allow them from localhost only.
function isLocal(req) {
  const a = req.socket?.remoteAddress || "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}
// Keep engine's in-memory config in sync with an on-disk change so /api/accounts + dispatch reflect it now.
function syncProvider(provider, patch) {
  const p = E.CONFIG?.providers?.[provider];
  if (p) Object.assign(p, patch);
  resetAccountRegistry();
}

const PORT = Number((process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : 0)) || 4577;
const UI = join(E.PATHS.__dir, "public", "index.html");

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } }); });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      return send(res, 200, existsSync(UI) ? readFileSync(UI, "utf8") : "<h1>UI missing</h1>", "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/api/state") return send(res, 200, E.snapshot());
    if (req.method === "GET" && url.pathname === "/api/ollama") return send(res, 200, await E.ollamaInfo());
    if (req.method === "GET" && url.pathname === "/api/providers") return send(res, 200, await E.providersInfo());
    if (req.method === "GET" && url.pathname === "/api/accounts") {
      const status = accountsStatus(E.CONFIG, DEFAULT_STATE_PATH);
      // overlay the real subscribed-plan quota where the provider exposes one (OpenRouter today).
      const quotas = await fetchPlanQuotas(E.CONFIG).catch(() => ({}));
      for (const p of status) for (const a of p.accounts) {
        const q = quotas[`${p.provider}/${a.id}`];
        if (q) a.planQuota = q;
      }
      return send(res, 200, status);
    }
    // ── Account Pool write-side (localhost only): login / paste-key / manage ──
    if (req.method === "POST" && url.pathname.startsWith("/api/accounts/")) {
      if (!isLocal(req)) return send(res, 403, { ok: false, error: "account admin is localhost-only" });
      const body = await readBody(req);
      try {
        if (url.pathname === "/api/accounts/key") {
          const r = setAccountKey(body); resetAccountRegistry(); return send(res, 200, r);
        }
        if (url.pathname === "/api/accounts/login") {
          return send(res, 200, startLogin(body, { config: E.CONFIG }));
        }
        if (url.pathname === "/api/accounts/manage") {
          const { action, provider, id, rotation } = body;
          let r;
          switch (action) {
            case "enable":  r = setProviderEnabled({ provider, enabled: true }); syncProvider(provider, { enabled: true }); break;
            case "disable": r = setProviderEnabled({ provider, enabled: false }); syncProvider(provider, { enabled: false }); break;
            case "rotation": r = setRotation({ provider, rotation }); syncProvider(provider, { rotation }); break;
            case "set-limit": r = setUsageLimit({ provider, limit5h: body.limit5h, limit7d: body.limit7d }); syncProvider(provider, { usage: { limit5h: r.limit5h, limit7d: r.limit7d } }); break;
            case "reset-cooldown": r = resetCooldown({ provider, id }); break;
            case "reset-usage": r = resetUsage({ provider, id }); break;
            case "logout": r = clearAccount({ provider, id }); resetAccountRegistry(); break;
            default: return send(res, 400, { ok: false, error: "unknown manage action: " + action });
          }
          return send(res, 200, r);
        }
        return send(res, 404, { ok: false, error: "not found" });
      } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
    }
    if (req.method === "GET" && url.pathname === "/api/knowledge") return send(res, 200, E.knowledgeOutcomes());
    if (req.method === "GET" && url.pathname === "/api/personas") {
      try { const p = JSON.parse(readFileSync(new URL("./personas.json", import.meta.url), "utf8")); return send(res, 200, p.personas || []); }
      catch { return send(res, 200, []); }
    }
    if (req.method === "GET" && url.pathname === "/api/log") {
      const id = url.searchParams.get("id") || "";
      const offset = Number(url.searchParams.get("offset") || 0) || 0;
      return send(res, 200, E.readLogChunk(id, offset));
    }
    // Node↔DB canvas write endpoints (feature--node-db-canvas)
    if (req.method === "POST" && url.pathname === "/api/node") {
      const body = await readBody(req);
      try { return send(res, 200, await writeNode(E.CONFIG, body)); }
      catch (e) { return send(res, 500, { ok: false, error: e.message }); }
    }
    if (req.method === "POST" && url.pathname === "/api/edge") {
      const body = await readBody(req);
      try { return send(res, 200, await writeEdge(E.CONFIG, body)); }
      catch (e) { return send(res, 500, { ok: false, error: e.message }); }
    }
    if (req.method === "POST" && url.pathname === "/api/query-nodes") {
      const body = await readBody(req);
      try { return send(res, 200, await queryNodes(E.CONFIG, body)); }
      catch (e) { return send(res, 500, { ok: false, error: e.message }); }
    }
    if (req.method === "POST" && url.pathname === "/api/cmd") {
      const { action, id, worker, model, owner, mode, max, on, tier, deps } = await readBody(req);
      let r;
      switch (action) {
        case "claim": r = E.claim(id, worker || "ui"); break;
        case "done": r = E.setStatus(id, "done"); break;
        case "fail": r = E.setStatus(id, "failed"); break;
        case "release": r = E.setStatus(id, "todo"); break;
        case "assign": r = E.assign(id, model || null); break;
        case "assignowner": r = E.assignOwner(id, owner || null); break;
        case "dispatch": r = E.dispatchOne(id, worker || "ui"); break;
        case "run": r = E.runPool({ mode: mode || "wave", max: Number(max) || undefined }); break;
        case "stop": r = E.stopPool(); break;
        case "setauth": r = E.setAuthMode(mode); break;
        case "setmode": r = E.setMode(mode); break;
        case "reset": r = E.reset(); break;
        case "killswitch": r = E.setKillSwitch(!!on); break;
        case "settier": r = E.setTier(tier); break;
        case "setdeps": r = await E.setDeps(id, deps); break;
        case "confirm": r = E.confirmAtom(id); break;
        case "unconfirm": r = E.unconfirmAtom(id); break;
        default: r = { ok: false, error: "unknown action " + action };
      }
      return send(res, r.ok === false ? 400 : 200, r);
    }
    send(res, 404, { ok: false, error: "not found" });
  } catch (e) { send(res, 500, { ok: false, error: e.message }); }
});

server.listen(PORT, () => {
  console.log(`\n  G-Maiden Orchestrator UI → http://localhost:${PORT}\n  (Ctrl+C เพื่อหยุด)\n`);
});
