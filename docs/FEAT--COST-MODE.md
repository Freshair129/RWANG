# FEAT — Cost mode (free / local): route to $0 providers only

A runtime switch that constrains dispatch to zero-cost providers — for burning down a backlog
without spending plan quota or API dollars.

| mode | who can run | cost | reach |
|---|---|---|---|
| **normal** (default) | every enabled provider | paid + free | cloud + local |
| **free** | local (ollama, local-image) **+ OpenRouter `:free` models** | **$0** | needs network for OR |
| **local** | local only (ollama + local SD) | **$0** | fully offline |

Paid providers — `claude`, `codex`, `openai-image`, and non-`:free` OpenRouter models — are
**excluded** under free/local. So an `auto-loop`/`run`/`auto-wave` under free mode spends nothing.

## How it works

The gate lives in `providers.resolveForRole(role, config, preferLocal, { costMode })`: the role's
`preferred` chain is filtered by `isAllowedUnderMode(model, mode)` before the first enabled+capable
provider is chosen. `engine.modelFor` and `runReview` pass the active mode, so **both** the worker
model and the Verify-Gate reviewer respect it. `free` keeps an OpenRouter model only when its id ends
in `:free`; `local` drops anything that isn't on-box.

Because the constraint is applied at model-selection, everything downstream (dispatch, auto-loop,
cost meter) is automatically $0 — no separate accounting needed.

## Self-sufficiency under free/local

`ollama` gained the `code_review` capability and the `reviewer` role a local fallback
(`ollama:…gemma-4-12b…`), so the Verify Gate still runs with a **local judge** when no cloud reviewer
is allowed (verify-gate-v2 already supports a local judge on offline/cap/pin). Set your local
`coder`/`worker` models at the front of the role chains if you want local-first even in normal mode.

## Use it

```bash
node orchestrator.mjs mode            # show current cost-mode
node orchestrator.mjs mode free       # local + OpenRouter :free  ($0)
node orchestrator.mjs mode local      # offline only              ($0)
node orchestrator.mjs mode normal     # back to all providers
node orchestrator.mjs auto-loop <goalId> --execute   # now runs on $0 providers
```

Dashboard (:4577) → the **cost** segmented control next to `auth` (normal / 🆓 free / 🖥 local);
`GET /api/state.mode` reflects it, `POST /api/cmd {action:"setmode",mode}` sets it. State persists in
`state.json` (`mode`).

## Notes

- **free still hits the network** (OpenRouter) — `:free` models are rate-limited and can queue; for
  hard-offline use **local**.
- Under **local**, roles with no on-box option resolve to `null` (task stays manual/blocked) — that's
  intentional: it surfaces what can't run offline rather than silently falling back to a paid model.
- Tests: `providers-costmode.test.mjs` (5) — mode predicate + role-chain filtering + reviewer-goes-local.
