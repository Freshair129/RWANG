/**
 * Pre-warm local Ollama models referenced in config roles, so the first real
 * dispatch doesn't pay the cold-load (≈5min for an 11GB model on this box).
 * Pairs with providers.ollama.keepAlive — once warm, the model stays resident.
 *
 * Usage:  node prewarm.mjs            # warm every distinct ollama:* model in roles
 *         node prewarm.mjs <model>... # warm specific model(s)
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dir, "config.json"), "utf8").replace(/^﻿/, ""));
const prov = config.providers?.ollama || {};
const host = (prov.host || "http://127.0.0.1:11434").replace(/\/$/, "");
const keepAlive = prov.keepAlive || "30m";
const num_ctx = (prov.profiles?.[prov.defaultProfile || "balanced"] || {}).num_ctx || 8192;

// collect ollama:* models from roles (CLI args override)
const fromArgs = process.argv.slice(2);
const fromRoles = [...new Set(
  Object.values(config.roles || {})
    .flatMap((r) => r.preferred || [])
    .filter((m) => m.startsWith("ollama:"))
    .map((m) => m.slice("ollama:".length))
)];
const models = fromArgs.length ? fromArgs : fromRoles;

if (!models.length) { console.log("no ollama models to warm"); process.exit(0); }

// only warm models that actually exist locally
let installed = new Set();
try {
  const r = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(2000) });
  installed = new Set(((await r.json()).models || []).map((m) => m.name));
} catch (e) { console.error(`! ollama not reachable at ${host}: ${e.message}`); process.exit(1); }

for (const model of models) {
  if (!installed.has(model)) { console.log(`- skip ${model} (not pulled)`); continue; }
  process.stdout.write(`• warming ${model} (ctx ${num_ctx}, keep_alive ${keepAlive}) ... `);
  const t0 = Date.now();
  try {
    const resp = await fetch(`${host}/api/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: "ok", stream: false, keep_alive: keepAlive, options: { num_predict: 1, num_ctx } }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    await resp.json();
    console.log(`ready in ${Math.round((Date.now() - t0) / 1000)}s`);
  } catch (e) { console.log(`FAILED: ${e.message}`); }
}
