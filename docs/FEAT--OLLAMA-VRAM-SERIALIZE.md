# FEAT — Serialized ollama model loading (VRAM-tight GPUs)

On a 12 GB GPU (RTX 3060), an autonomous run rotates through several big local models — a coder
worker (e.g. qwen 8B), then a reviewer (gemma-4-12B), while the knowledge store keeps `bge-m3`
resident for embeddings. With ollama's default `keep_alive`, these pile up in VRAM and the next
dispatch fails (`fetch failed` / OOM). This makes big-model loading **serial**: unload other resident
models before each dispatch, so only one big model is hot at a time.

**Exceptions (stay resident):** embedding/reranker models and anything **< 1B params** — they're cheap
to keep and the knowledge store needs its embedder loaded.

## How

`ollama-vram.mjs` `ensureVram({host, target})` runs before every ollama dispatch
(`runOllama` + `runOllamaTools`):

1. `GET /api/ps` → what's resident (with `parameter_size`).
2. For each model that isn't the target and isn't keep-resident →
   `POST /api/generate {model, keep_alive: 0}` (immediate unload).

`isKeepResident` = name matches an embed/reranker pattern (`bge`, `nomic`, `jina`, `reranker`,
`embed`, …) **or** `< 1B` params **or** an explicit `keepResidentPatterns` entry. Best-effort: a
failed `/api/ps` or a stuck unload never blocks the dispatch.

So a worker→reviewer round on one GPU now goes: unload stale → load worker → run → (next dispatch)
unload worker → load reviewer → run, with `bge-m3` untouched throughout.

## Config

```jsonc
"ollama": {
  "vram": {
    "serialize": true,            // false = leave ollama's own keep_alive to manage VRAM
    "keepResidentPatterns": []    // extra name substrings to never unload (embeds are auto-detected)
  }
}
```

## Notes

- Detection uses ollama's reported `parameter_size`; models that don't report it fall back to the
  name-pattern rule (so odd names may be treated as big — safe: they get unloaded when not the target).
- This is orthogonal to `OLLAMA_MAX_LOADED_MODELS` (a blunt server-wide cap that would also evict
  embeddings). The in-app guard keeps embeddings + sub-1B hot by design.
- Tests: `ollama-vram.test.mjs` (4) — `paramB` parsing, keep-resident rule, unload-others selection,
  best-effort no-op on API failure.
