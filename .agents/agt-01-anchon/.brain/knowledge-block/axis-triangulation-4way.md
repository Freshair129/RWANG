# Knowledge — 4-way axis triangulation (cross-model, cold)

Four independent cold reads of SPEC-KN-2026-ROOT (each formed without seeing the others' answers).
Method: anti-anchoring — cold critique first, reveal second. Robust where ≥2 models agree independently.

| Finding | fable-5 | gpt-5.5 | gpt-5.6-sol | Rwang |
|---|:--:|:--:|:--:|:--:|
| Single H0–H6 ladder overloaded → **split into axes** | ✅ | ✅ | ✅ ("conflates ≥4 things") | ✅ RFC 0.6.0 |
| Caught schema H0–4 vs table H0–6 contradiction | ✅ | – | ✅ | n/a |
| **Mock / AI content must be quarantined, never satisfy gates** | ✅ #1 | ✅ | ✅ ("actively unsafe") | ~ status lifecycle |
| Markdown **must not mutate canonical directly → submit patch** | ✅ | ✅ | ✅ (+optimistic lock / 3-way merge) | n/a |
| Keep H only as **presets / pedagogy**, not governance truth | ✅ | ✅ | ✅ | ✅ |
| **Write / mutation authority = its own axis** | ✅ | ✅ | ✅ | ⚠️ latent |
| **Provenance / Trust** as an axis | ~ | ✅ | ✅ | ❌ |

## Unanimous 4/4 (treat as settled)
1. Un-fuse the single H ladder — it is an anti-pattern.
2. Quarantine mock / AI-drafted content; it must never enter context-assembly or a release gate as fact.
3. Views submit patches; they do not directly mutate the canonical store.
4. H survives only as convenience presets over the real multi-axis model.

## Extra axes proposed (candidates beyond the consensus)
- gpt-5.6-sol: **Sensitivity** (public/internal/confidential/restricted — ACL) and **Freshness** (source-hash / validity-window — anti-stale).
- gpt-5.5: **Evidence level** (code-derived / test-backed / human-approved / AI-drafted / stale).
- fable-5: **Budget** (token budget with summary-degradation).

## Distilled axis set (from all 4)
Radius (→R) · Altitude (→D) · Complexity (→C, spine) · Write-authority (new) · Risk · Provenance/Trust (new) · Completeness (status) — with **quarantine-mock as the first thing to build**.
