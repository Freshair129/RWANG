// image.mjs — image-generation providers for RWANG (logos, icons, component art, img2img).
//
// Per the workload-split insight (agent/chat = sticky-account for cache; image = round-robin
// load-balance across accounts to spread quota + fire parallel): image providers are dispatched
// like any other provider, but the account layer rotates them round-robin (config), and these
// runners fire the actual Images API.
//
// Two backends, chosen by `providers.<name>.imageBackend`:
//   "openai-compatible"  → POST {host}/images/generations  and  {host}/images/edits  (img2img).
//                          Works for OpenAI (gpt-image-*), OpenRouter, and any codex-lb-style
//                          OpenAI-compatible Images gateway — differ only by host + key + model.
//   "a1111"              → local Automatic1111 / Forge / SD.Next  /sdapi/v1/txt2img|img2img
//                          (RTX 3060, quota-free). ComfyUI is a future adapter.
//
// Pure backend fns take an injectable `fetchFn` so they unit-test without a live API. Motion is NOT
// here — "logo motion" is code-generated (Lottie/CSS/Framer) by the coder role, per product choice.
// Zero-dependency Node ESM (uses global fetch / FormData / Blob, Node 18+).

import { existsSync, mkdirSync, writeFileSync, readFileSync, createWriteStream } from "node:fs";
import { join, dirname } from "node:path";

export function parseSize(size = "1024x1024") {
  const m = String(size).match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  return m ? { width: Number(m[1]), height: Number(m[2]), size: `${m[1]}x${m[2]}` }
           : { width: 1024, height: 1024, size: "1024x1024" };
}

// ── save a list of {b64}|{url} outputs to disk; returns written file paths ────────────────────
export async function saveImageOutputs(outputs, dir, base, { fetchFn = fetch } = {}) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const files = [];
  for (let i = 0; i < outputs.length; i++) {
    const o = outputs[i];
    const path = join(dir, `${base}-${i + 1}.png`);
    if (o.b64) {
      writeFileSync(path, Buffer.from(o.b64, "base64"));
    } else if (o.url) {
      const r = await fetchFn(o.url);
      if (!r.ok) throw new Error(`download image failed: HTTP ${r.status}`);
      writeFileSync(path, Buffer.from(await r.arrayBuffer()));
    } else { continue; }
    files.push(path);
  }
  return files;
}

// ── OpenAI-compatible Images API (generations + edits/img2img) ────────────────────────────────
export async function openAIImage(
  { host, apiKey, model, prompt, refImage = null, n = 1, size = "1024x1024", fetchFn = fetch } = {},
) {
  const base = (host || "https://api.openai.com/v1").replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${apiKey}` };
  let resp;
  if (refImage) {
    // edit / img2img — multipart with the reference image
    const buf = readFileSync(refImage);
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("n", String(n));
    form.append("size", parseSize(size).size);
    form.append("image", new Blob([buf], { type: "image/png" }), "reference.png");
    resp = await fetchFn(`${base}/images/edits`, { method: "POST", headers, body: form });
  } else {
    resp = await fetchFn(`${base}/images/generations`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, n, size: parseSize(size).size }),
    });
  }
  if (!resp.ok) throw new Error(`images API HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const j = await resp.json();
  const outputs = (j.data || []).map((d) => (d.b64_json ? { b64: d.b64_json } : { url: d.url })).filter((o) => o.b64 || o.url);
  return { outputs, raw: j };
}

// ── Automatic1111 / Forge / SD.Next local API ─────────────────────────────────────────────────
export async function a1111Image(
  { host, model = null, prompt, refImage = null, n = 1, size = "1024x1024", fetchFn = fetch, options = {} } = {},
) {
  const base = (host || "http://127.0.0.1:7860").replace(/\/$/, "");
  const { width, height } = parseSize(size);
  const body = {
    prompt, batch_size: n, width, height,
    steps: options.steps ?? 28, cfg_scale: options.cfg_scale ?? 5,
    ...(model ? { override_settings: { sd_model_checkpoint: model } } : {}),
    ...(options.extra || {}),
  };
  let endpoint = "/sdapi/v1/txt2img";
  if (refImage) {
    endpoint = "/sdapi/v1/img2img";
    body.init_images = [readFileSync(refImage).toString("base64")];
    body.denoising_strength = options.denoising_strength ?? 0.6;
  }
  const resp = await fetchFn(`${base}${endpoint}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`A1111 HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const j = await resp.json();
  return { outputs: (j.images || []).map((b64) => ({ b64 })), raw: { info: j.info } };
}

// pick backend from provider config (explicit imageBackend wins; else infer from host)
export function imageBackendOf(prov = {}) {
  if (prov.imageBackend) return prov.imageBackend;
  const host = prov.host || "";
  if (/127\.0\.0\.1|localhost/.test(host)) return "a1111";
  return "openai-compatible";
}

// ── runner (standard provider-runner signature) — used by providers.mjs RUNNERS ───────────────
// opts.providerName selects the provider config; opts.account carries the rotated key;
// opts.refImage / t.image?.ref = optional reference for edit/img2img.
export async function runImage(t, model, worker, prompt, config, paths, opts = {}) {
  const providerName = opts.providerName || "openai-image";
  const prov = config.providers?.[providerName] || {};
  const fetchFn = opts.fetchFn || fetch;
  const backend = imageBackendOf(prov);
  const mdl = (model && model !== "default" ? model : null) || prov.model || (backend === "a1111" ? null : "gpt-image-1");
  const apiKey = opts.account?.apiKey || (prov.apiKeyEnv ? process.env[prov.apiKeyEnv] : null) || prov.auth?.apiKey || process.env.OPENAI_API_KEY;
  const n = opts.n || prov.defaultN || 1;
  const size = opts.size || prov.defaultSize || "1024x1024";
  const refImage = opts.refImage || t?.image?.ref || null;
  const outDir = join(paths.ROOT, prov.outDir || "store/assets");
  const base = `${t.id}.${worker}`;

  if (!existsSync(paths.LOGS)) mkdirSync(paths.LOGS, { recursive: true });
  const logFile = join(paths.LOGS, `${t.id}.${worker}.log`);
  const ws = createWriteStream(logFile, { flags: "w" });
  ws.write(`# ${t.id} · ${worker} · ${providerName}:${mdl || "default"} · backend=${backend}${refImage ? " · img2img" : ""} · started ${new Date().toISOString()}\n`);
  ws.write(`# prompt: ${String(prompt).slice(0, 400)}\n\n`);

  try {
    if (backend === "openai-compatible" && !apiKey) throw new Error(`no API key (${prov.apiKeyEnv || "OPENAI_API_KEY"}) for ${providerName}`);
    const gen = backend === "a1111"
      ? await a1111Image({ host: prov.host, model: mdl, prompt, refImage, n, size, fetchFn, options: prov.a1111 || {} })
      : await openAIImage({ host: prov.host, apiKey, model: mdl, prompt, refImage, n, size, fetchFn });
    if (!gen.outputs.length) throw new Error("API returned no images");
    const files = await saveImageOutputs(gen.outputs, outDir, base, { fetchFn });
    for (const f of files) ws.write(`# ✅ saved ${f}\n`);
    ws.write(`\n# done · ${files.length} image(s) · ${providerName}\n`); ws.end();
    return { ok: files.length > 0, logFile, code: 0, provider: providerName, files,
      usage: { cost: (prov.costPerImage || 0) * files.length, inTok: 0, outTok: 0, cache: 0 } };
  } catch (e) {
    ws.write(`\n# image error: ${e.message}\n`); ws.end();
    return { ok: false, logFile, code: 1, provider: providerName, files: [], usage: {} };
  }
}
