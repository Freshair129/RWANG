# FEAT — Image providers + workload-aware rotation

Adds image generation to RWANG so the orchestrator can produce visual assets for components
(logos, icons, component art, img2img) — and applies the **cache-vs-quota routing split**: agent/chat
work stays sticky on one account (to reuse the prompt cache), while image work round-robins across
accounts to spread quota and fire parallel. Motion (e.g. logo motion) is **not** an image model —
it's code-generated (Lottie/CSS/Framer) by the `coder` role.

## Two axes now govern dispatch

1. **cloud vs local** (existing `routingCloudLocal`) — where a role runs.
2. **sticky vs spread** (NEW, per-role `rotation`) — how its accounts rotate:
   - **cache-heavy** roles (`architect`, `coder`, `reviewer`) → `failover` (sticky): stay on one
     account until it limits, so Claude/Codex **prompt caching** keeps hitting (rotating accounts =
     cache miss every call = slower + pricier; our `runClaude` already counts `cache_read`/`creation`).
   - **quota-heavy / parallel** roles (`worker`, `scout`, `designer`) → `round-robin`: spread across
     accounts to dodge rate limits when firing a batch.

   Wired in `accounts.pickAccount(provider, st, { rotationOverride })`; `providers.runProvider` reads
   the task's role (`routing[type]`) → `roles[role].rotation` and passes it as the override. Provider
   default still applies when a role sets none.

## Image providers (all `enabled:false` until you configure)

| provider | backend | endpoint | notes |
|---|---|---|---|
| `openai-image` | OpenAI-compatible | `/v1/images/generations` + `/v1/images/edits` | gpt-image-1; best quality; multi-key round-robin; `costPerImage` est. |
| `local-image` | Automatic1111 / Forge / SD.Next | `/sdapi/v1/txt2img` + `/img2img` | **RTX 3060, quota-free**; run `webui --api` (:7860) first; no accounts needed |
| `openrouter-image` | OpenAI-compatible | via `openrouter.ai/api/v1` | 1 key; ⚠ confirm the chosen model actually supports image output |

The `openai-image` / `openrouter-image` runners share one OpenAI-compatible code path (host + key +
model differ) — so a self-hosted **codex-lb-style** Images gateway drops in by pointing `host` at it.
`local-image` targets the Automatic1111 JSON API (ComfyUI is a future adapter). Reference-image
**img2img/edit** is supported on all three (`opts.refImage` / task `image.ref`). Outputs are written
to `store/assets/<taskId>.<worker>-N.png`.

## Routing

`config.routing`: `image` / `logo` / `icon` / `asset` / `texture` / `graphic` → **`designer`** role
(→ image providers, cloud-first: openai → local → openrouter). `motion` / `animation` → **`coder`**
(code-generated animation from the generated logo — Lottie/CSS/Framer).

## Setup

1. **OpenAI**: put one key per seat in `accounts.local.json` (or paste in the Account Pool UI) under
   `openai-image` (ids `oai-1`, `oai-2`), then `enabled:true`. Round-robin spreads image quota.
2. **Local**: launch A1111/Forge with `--api` on `:7860`, set `local-image.enabled:true`. No key.
   Tune `a1111.steps/cfg_scale/denoising_strength` in config.
3. **OpenRouter**: reuse your OR key; set a model that emits images; `enabled:true`.

> Cost: `costPerImage` is a rough per-image estimate for the cost meter (OpenAI bills per image, not
> per token) — set it to your plan's real number. Local = $0.

## Tests

`image.test.mjs` (8): `parseSize`, backend selection, OpenAI generations (JSON) + edits (multipart
img2img), A1111 txt2img, `saveImageOutputs` (b64 + url download), `runImage` end-to-end (injected
`fetch`, tmp assets), and clean no-key failure. `accounts.test.mjs` adds the `rotationOverride`
(sticky-vs-spread) case. Full suite green.
