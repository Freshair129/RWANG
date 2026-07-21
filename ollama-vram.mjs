// ollama-vram.mjs — serialize big-model loading on a VRAM-tight GPU (e.g. RTX 3060 12GB).
//
// Before dispatching a model, unload every OTHER currently-loaded model so only one big model is
// resident at a time — EXCEPT models that are cheap to keep hot: embeddings/rerankers (the knowledge
// store's bge-m3 must stay loaded) and anything under 1B params. Uses ollama's own API:
//   GET  /api/ps                      → what's resident (+ parameter_size)
//   POST /api/generate {model, keep_alive:0} → unload that model now
// Best-effort and injectable-fetch for tests. Zero-dependency Node ESM.

// name-based signal that a model is an embedder/reranker (keep it resident)
const EMBED_RE = /embed|reranker|rerank|bge|nomic|jina|voyage|retrieval|minilm|\bgte\b|\be5\b|omni/i;

// parameter count in billions from an /api/ps entry ("7.6B" -> 7.6, "600M" -> 0.6); null if unknown
export function paramB(entry) {
  const s = entry?.details?.parameter_size ?? entry?.parameter_size ?? "";
  const m = String(s).match(/([\d.]+)\s*([BM])/i);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2].toUpperCase() === "M" ? n / 1000 : n;
}

// keep resident iff: embedding/reranker by name, matches an explicit pattern, or < 1B params
export function isKeepResident(entry, patterns = []) {
  const name = typeof entry === "string" ? entry : (entry?.name || entry?.model || "");
  if (EMBED_RE.test(name)) return true;
  for (const p of patterns) if (p && name.includes(p)) return true;
  const b = paramB(entry);
  return b != null && b < 1;
}

// Unload every resident model that isn't the target and isn't keep-resident. Returns the names freed.
export async function ensureVram({ host, target, fetchFn = fetch, patterns = [], onLog = () => {} } = {}) {
  const base = (host || "http://127.0.0.1:11434").replace(/\/$/, "");
  let ps;
  try {
    const r = await fetchFn(`${base}/api/ps`);
    if (!r.ok) return { unloaded: [] };
    ps = await r.json();
  } catch { return { unloaded: [] }; }

  const unloaded = [];
  for (const m of ps.models || []) {
    const name = m.name || m.model;
    if (!name || name === target) continue;
    if (isKeepResident(m, patterns)) continue;
    try {
      await fetchFn(`${base}/api/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: name, keep_alive: 0 }),
      });
      unloaded.push(name);
      onLog(`unloaded ${name} (VRAM)`);
    } catch { /* best-effort — a stuck unload must not block the dispatch */ }
  }
  return { unloaded };
}
