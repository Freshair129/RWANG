# SPEC â€” GoVibe â‡„ G-Orchestration Integration

> **Status:** Approved (2026-06-21, USER/Boss Â· RUNBOOK Gate 2) â€” à¸à¸³à¸à¸±à¸šà¸à¸²à¸£à¸ªà¸£à¹‰à¸²à¸‡
> **Direction:** **G-Orchestration à¹€à¸›à¹‡à¸™à¹à¸à¸™ (execution core)** â€” "à¸”à¸¹à¸”" à¸„à¸§à¸²à¸¡à¸ªà¸²à¸¡à¸²à¸£à¸–à¸—à¸µà¹ˆà¸‚à¸²à¸”à¸‚à¸­à¸‡ GoVibe à¹€à¸‚à¹‰à¸²à¸¡à¸²
> à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ merge à¸ªà¸¡à¸¡à¸²à¸•à¸£ à¹à¸¥à¸°à¹„à¸¡à¹ˆà¸¢à¹‰à¸²à¸¢à¹à¸à¸™à¹„à¸›à¸­à¸¢à¸¹à¹ˆ GoVibe
> **Scope:** `orchestration/` (engine.mjs à¸¯à¸¥à¸¯). à¸­à¹‰à¸²à¸‡à¸­à¸´à¸‡à¸£à¸°à¸šà¸š GoVibe à¸—à¸µà¹ˆ `G:\govibe`
> **Governed by:** [ADR-O-002](ADR-O-002--govibe-integration.md)
> **à¸­à¹‰à¸²à¸‡à¸­à¸´à¸‡:** [SPEC--VERIFY-GATE.md](SPEC--VERIFY-GATE.md), [ADR-O-001](ADR-O-001--verify-gate.md),
> `docs/research/concepts/subagent-context-scoping.md`, GoVibe `scripts/mcp/registry.mjs`,
> GoVibe `covibe-roadmap-export.json`, GoVibe `.brain/masterblock/*`

---

## 1. à¸«à¸¥à¸±à¸à¸à¸²à¸£à¸•à¸±à¸”à¸ªà¸´à¸™à¹ƒà¸ˆ (à¸—à¸³à¹„à¸¡ G-Orch à¹€à¸›à¹‡à¸™à¹à¸à¸™)

à¸—à¸±à¹‰à¸‡à¸ªà¸­à¸‡à¸£à¸°à¸šà¸šà¸­à¸¢à¸¹à¹ˆ **à¸„à¸™à¸¥à¸°à¸Šà¸±à¹‰à¸™à¸‚à¸­à¸‡ stack** à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¸„à¸¹à¹ˆà¹à¸‚à¹ˆà¸‡à¸à¸±à¸™:

| à¸£à¸°à¸šà¸š | à¸šà¸—à¸šà¸²à¸—à¸ˆà¸£à¸´à¸‡ | à¸ˆà¸¸à¸”à¹à¸‚à¹‡à¸‡à¸—à¸µà¹ˆà¸—à¸”à¹à¸—à¸™à¹„à¸¡à¹ˆà¹„à¸”à¹‰ |
| --- | --- | --- |
| **G-Orchestration** (`orchestration/`) | **execution engine** â€” à¸£à¸±à¸™à¸‡à¸²à¸™à¸«à¸¥à¸²à¸¢ agent à¸ˆà¸£à¸´à¸‡ | worker-pool + atomic claim/lease, DAG gating, wave parallelization, model routing, **Verify Gate** (reviewer à¸­à¸´à¸ªà¸£à¸° + needs-rework), cost ledger, zero-dep |
| **GoVibe** (`G:\govibe`) | **control plane** â€” à¸§à¸²à¸‡à¹à¸œà¸™/à¸à¸³à¸à¸±à¸š/à¸ˆà¸”à¸ˆà¸³ | roadmap model + temporal versioning, `.brain` memory, governance gates, RICE/MoSCoW, requirement traceability, MCP server, Mission Control |

**à¹€à¸«à¸•à¸¸à¸œà¸¥à¸—à¸µà¹ˆà¹€à¸¥à¸·à¸­à¸ G-Orch à¹€à¸›à¹‡à¸™à¹à¸à¸™:**
1. à¸‚à¸­à¸‡à¸—à¸µà¹ˆ "à¸—à¸³à¸‡à¸²à¸™à¸ˆà¸£à¸´à¸‡à¸•à¸­à¸™ runtime" (à¸£à¸±à¸™ agent, à¸•à¸£à¸§à¸ˆà¸„à¸¸à¸“à¸ à¸²à¸ž, à¸à¸±à¸™ race) à¸­à¸¢à¸¹à¹ˆà¸—à¸µà¹ˆ G-Orch à¹à¸¥à¹‰à¸§ à¹à¸¥à¸° **à¸—à¸”à¹à¸—à¸™à¸¢à¸²à¸à¸à¸§à¹ˆà¸²** â€” GoVibe à¹€à¸£à¸µà¸¢à¸ agent à¸œà¹ˆà¸²à¸™ PowerShell à¹à¸¢à¸à¸•à¸±à¸§ (`run-ather.ps1`, `run-lyra.ps1`) à¹„à¸¡à¹ˆà¸¡à¸µ pool/claim/lease/verify
2. G-Orch à¹€à¸›à¹‡à¸™ **zero external dependency** (Node built-in à¸¥à¹‰à¸§à¸™) â€” à¸”à¸¹à¸” feature à¹€à¸‚à¹‰à¸²à¸¡à¸²à¹„à¸”à¹‰à¹‚à¸”à¸¢à¹„à¸¡à¹ˆà¸¥à¸²à¸ React/Vite/ws à¸‚à¸­à¸‡ GoVibe à¹€à¸‚à¹‰à¸²à¸¡à¸²
3. GoVibe à¸­à¸­à¸à¹à¸šà¸šà¹ƒà¸«à¹‰à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¸œà¹ˆà¸²à¸™ **MCP** à¸­à¸¢à¸¹à¹ˆà¹à¸¥à¹‰à¸§ (`govibe-mcp-server.mjs`) â†’ integration surface à¸¡à¸²à¸•à¸£à¸à¸²à¸™à¸¡à¸µà¹ƒà¸«à¹‰à¹ƒà¸Šà¹‰ à¹„à¸¡à¹ˆà¸•à¹‰à¸­à¸‡ fork

**à¸«à¸¥à¸±à¸à¸à¸²à¸£à¸à¸³à¸à¸±à¸šà¸à¸²à¸£à¸”à¸¹à¸” (3 à¸‚à¹‰à¸­ â€” à¸«à¹‰à¸²à¸¡à¸¥à¸°à¹€à¸¡à¸´à¸”):**
- **P1 â€” à¹„à¸¡à¹ˆà¸—à¸³à¸¥à¸²à¸¢à¸‚à¸­à¸‡à¹€à¸”à¸´à¸¡:** zero-dep, file-based state, Verify Gate, POLA scoping à¸•à¹‰à¸­à¸‡à¸„à¸‡à¹€à¸”à¸´à¸¡. field à¹ƒà¸«à¸¡à¹ˆà¸—à¸¸à¸à¸•à¸±à¸§ **optional** (backlog/state à¹€à¸”à¸´à¸¡à¸£à¸±à¸™à¸•à¹ˆà¸­à¹„à¸”à¹‰à¹„à¸¡à¹ˆà¹à¸•à¸°)
- **P2 â€” à¸”à¸¹à¸”à¹€à¸‰à¸žà¸²à¸°à¸—à¸µà¹ˆà¸‚à¸²à¸”:** absorb à¹€à¸›à¹‡à¸™ "à¹„à¸­à¹€à¸”à¸µà¸¢+à¸‚à¹‰à¸­à¸¡à¸¹à¸¥" à¸¡à¸²à¹€à¸‚à¸µà¸¢à¸™à¹ƒà¸«à¸¡à¹ˆà¸”à¹‰à¸§à¸¢ Node built-in â€” **à¹„à¸¡à¹ˆ import à¹‚à¸„à¹‰à¸” GoVibe à¸•à¸£à¸‡ à¹†** (à¸à¸±à¸™à¸¥à¸²à¸ dependency)
- **P3 â€” à¹€à¸Šà¸·à¹ˆà¸­à¸¡ à¹„à¸¡à¹ˆà¸à¸¥à¸·à¸™:** GoVibe à¸¢à¸±à¸‡à¸£à¸±à¸™à¹€à¸›à¹‡à¸™à¸£à¸°à¸šà¸šà¸‚à¸­à¸‡à¸•à¸±à¸§à¹€à¸­à¸‡à¹„à¸”à¹‰ (Mission Control, MCP). G-Orch à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¸œà¹ˆà¸²à¸™ adapter/contract à¸—à¸µà¹ˆà¸£à¸°à¸šà¸¸à¸Šà¸±à¸” à¹„à¸¡à¹ˆà¸œà¸¹à¸à¸•à¸²à¸¢

---

## 2. Capability map â€” à¸­à¸°à¹„à¸£à¸„à¸‡à¹„à¸§à¹‰ / à¸­à¸°à¹„à¸£à¸”à¸¹à¸”à¹€à¸‚à¹‰à¸²à¸¡à¸² / à¸­à¸°à¹„à¸£à¹€à¸Šà¸·à¹ˆà¸­à¸¡

| Capability | à¹€à¸ˆà¹‰à¸²à¸‚à¸­à¸‡à¹€à¸”à¸´à¸¡ | à¹à¸œà¸™ | à¹‚à¸¡à¸”à¸¹à¸¥à¸›à¸¥à¸²à¸¢à¸—à¸²à¸‡à¹ƒà¸™ G-Orch |
| --- | --- | --- | --- |
| Worker pool, claim/lease, DAG, wave | G-Orch | **KEEP** (à¹à¸à¸™) | `engine.mjs` (à¹€à¸”à¸´à¸¡) |
| Model routing (typeâ†’tier) | G-Orch | **KEEP** | `engine.mjs` `roleFor/modelFor` |
| Verify Gate (reviewer + rework) | G-Orch | **KEEP** + à¸›à¹‰à¸­à¸™ outcome à¹€à¸‚à¹‰à¸² brain | `engine.mjs` `executeWithReview` |
| Cost/usage ledger | G-Orch | **KEEP** + sync à¹€à¸‚à¹‰à¸² roadmap `tokensUsed` | `usage.jsonl` |
| POLA per-task scope | G-Orch | **KEEP** + à¹€à¸›à¸´à¸”à¹€à¸›à¹‡à¸™ MCP `docs.resolve` | `scopeFor` |
| **Roadmap model + temporal versioning** | GoVibe | **ABSORB** | Â§4.1 `roadmap/` layer |
| **`.brain` memory (masterblock/session/rca)** | GoVibe | **ABSORB** | Â§4.2 `brain/` layer |
| **Governance gates (validate/diff/baseline)** | GoVibe | **ABSORB** | Â§4.3 pre/post hooks |
| **RICE / MoSCoW prioritization** | GoVibe | **ABSORB** | Â§4.4 ranking |
| **Agent-role fleet (AGENT.md + policy)** | GoVibe | **ABSORB** (map à¹€à¸‚à¹‰à¸² routing) | Â§4.5 role registry |
| **Requirement traceability** | GoVibe | **ABSORB** (à¹€à¸›à¹‡à¸™ field à¹ƒà¸™ task) | Â§3 schema |
| **MCP server interface** | GoVibe | **BRIDGE** (à¸«à¹ˆà¸­ engine à¹€à¸›à¹‡à¸™ MCP) | Â§5 MCP surface |
| Mission Control dashboard (React) | GoVibe | **BRIDGE** (à¸­à¹ˆà¸²à¸™ snapshot à¸œà¹ˆà¸²à¸™ MCP) | à¸„à¸‡à¹„à¸§à¹‰à¸à¸±à¹ˆà¸‡ GoVibe |

---

## 3. Data model unification â€” à¸‚à¸¢à¸²à¸¢ backlog task schema

à¸›à¸±à¸à¸«à¸²: task schema à¸‚à¸­à¸‡à¹€à¸£à¸² (`id,title,type,phase,deps,est,accept,model,scope,requireReview`)
**à¹à¸šà¸™à¸à¸§à¹ˆà¸²** à¸‚à¸­à¸‡ GoVibe à¸¡à¸²à¸. GoVibe roadmap task à¸¡à¸µ field à¸—à¸µà¹ˆà¹€à¸£à¸²à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¹à¸¥à¸°à¸¡à¸µà¸„à¹ˆà¸²:

### 3.1 à¹€à¸—à¸µà¸¢à¸š field (GoVibe roadmap task â†’ G-Orch task)

| GoVibe field | à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡à¸ˆà¸£à¸´à¸‡ | à¸ªà¸–à¸²à¸™à¸°à¹ƒà¸™ G-Orch | à¹à¸œà¸™ |
| --- | --- | --- | --- |
| `id` | `p0-s0-1` | âœ… à¸¡à¸µ (`G0.1`) | à¸„à¸‡à¸‚à¸­à¸‡à¹€à¸£à¸²; à¹€à¸à¹‡à¸š id GoVibe à¸—à¸µà¹ˆ `sourceId` |
| `code` | `TSK-CVB01P00010` | âŒ | **à¹€à¸žà¸´à¹ˆà¸¡** `code` (traceability key) |
| `text` | "Prototype YouTube IFrameâ€¦" | âœ… (`title`) | map `title`â†”`text` |
| `symbolLink` | `src/App.tsx` | âŒ | **à¹€à¸žà¸´à¹ˆà¸¡** `symbolLink` (taskâ†’à¹„à¸Ÿà¸¥à¹Œà¹€à¸›à¹‰à¸²à¸«à¸¡à¸²à¸¢) |
| `complexity` | `high` / `nomal` | âš ï¸ (à¸¡à¸µà¹à¸„à¹ˆ `est`) | **à¹€à¸žà¸´à¹ˆà¸¡** `complexity`; à¹€à¸à¹‡à¸š `est` à¹„à¸§à¹‰ |
| `type` | `FR` / `NFR` | âš ï¸ (type à¹€à¸£à¸²à¹ƒà¸Šà¹‰ routing) | **à¹€à¸žà¸´à¹ˆà¸¡** `frnfr`; `type` à¹€à¸”à¸´à¸¡à¸¢à¸±à¸‡à¸„à¸¸à¸¡ routing |
| `status` | `stable` | âœ… (runtime status) | à¸„à¸™à¸¥à¸°à¸„à¸§à¸²à¸¡à¸«à¸¡à¸²à¸¢ â€” à¹€à¸à¹‡à¸š governance status à¸—à¸µà¹ˆ `lifecycle` |
| `version` | `1.0.0` | âŒ | **à¹€à¸žà¸´à¹ˆà¸¡** `version` (semver à¸•à¹ˆà¸­ task) |
| `created_at`/`last_update` | `ts,actor,commit` | âš ï¸ (à¸¡à¸µ `claimedAt`) | **à¹€à¸žà¸´à¹ˆà¸¡** `audit{created,updated}` (ts+actor+commit) |
| `changelog` | "Added iframe sandboxâ€¦" | âŒ | **à¹€à¸žà¸´à¹ˆà¸¡** `changelog[]` (append per mutation) |
| `tokensUsed` | `12040` | âš ï¸ (à¸¡à¸µà¹ƒà¸™ usage.jsonl) | **sync** à¸ˆà¸²à¸ ledger â†’ `tokensUsed` à¸šà¸™ task |

### 3.2 field à¸—à¸µà¹ˆà¹€à¸žà¸´à¹ˆà¸¡ (à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸” **optional** â€” backward compatible)

à¹€à¸žà¸´à¹ˆà¸¡à¹ƒà¸™ `backlog.json` task object (à¹à¸¥à¸° mirror à¹ƒà¸™ `state.json` runtime):

```jsonc
{
  // --- à¹€à¸”à¸´à¸¡ (à¹„à¸¡à¹ˆà¹à¸•à¸°) ---
  "id": "G0.1", "title": "...", "type": "scaffold", "phase": "0",
  "deps": ["S-1"], "est": 1, "accept": "...", "model": "...", "scope": {...},

  // --- absorb à¸ˆà¸²à¸ GoVibe (optional à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”) ---
  "code": "TSK-GVM00P00010",        // traceability key (à¸ªà¹€à¸à¸¥à¸•à¸²à¸¡à¹‚à¸›à¸£à¹€à¸ˆà¸à¸•à¹Œ)
  "symbolLink": "src-tauri/src/main.rs", // à¹„à¸Ÿà¸¥à¹Œ/symbol à¹€à¸›à¹‰à¸²à¸«à¸¡à¸²à¸¢à¸«à¸¥à¸±à¸à¸‚à¸­à¸‡ task
  "complexity": "high",              // low|nomal|high  (signal à¸‚à¸­à¸‡ routing + RICE effort)
  "frnfr": "FR",                     // FR|NFR  (à¸à¸³à¸à¸±à¸š traceability à¹„à¸› SRS)
  "version": "1.0.0",                // semver à¸•à¹ˆà¸­ task; bump à¹€à¸¡à¸·à¹ˆà¸­ done/rework
  "lifecycle": "draft",              // draft|approved|stable|deprecated (governance status)
  "rice": { "reach": 3, "impact": 2, "confidence": 0.8, "effort": 1 }, // Â§4.4
  "moscow": "must",                  // must|should|could|wont
  "trace": {                         // Â§8 requirement traceability
    "prd": ["PRD Â§G-Signal"],
    "srs": ["R-02", "latency budget Â§1"],
    "test": ["G3.6"]
  },
  "audit": {                         // bitemporal-lite
    "created": { "at": "2026-06-21T09:00:00+07:00", "by": "EVA", "commit": "a3f2b1c" },
    "updated": { "at": "2026-06-21T16:22:00+07:00", "by": "orch", "commit": "d4e5f6g" }
  },
  "changelog": [                     // append-only; à¹€à¸‚à¸µà¸¢à¸™à¹‚à¸”à¸¢ engine à¸•à¸­à¸™à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™ lifecycle/version
    { "v": "1.0.0", "at": "...", "by": "sonnet", "note": "first pass passed Verify Gate" }
  ],
  "tokensUsed": 12040                // sync à¸ˆà¸²à¸ usage.jsonl (à¸ªà¸°à¸ªà¸¡à¸•à¹ˆà¸­ task)
}
```

> **à¸à¸•à¸´à¸à¸² backward-compat:** engine à¸­à¹ˆà¸²à¸™ task à¸—à¸µà¹ˆà¹„à¸¡à¹ˆà¸¡à¸µ field à¹ƒà¸«à¸¡à¹ˆà¹„à¸”à¹‰à¸•à¸²à¸¡à¹€à¸”à¸´à¸¡. field à¹ƒà¸«à¸¡à¹ˆà¸¡à¸µà¸œà¸¥à¹€à¸‰à¸žà¸²à¸°à¹€à¸¡à¸·à¹ˆà¸­à¹‚à¸¡à¸”à¸¹à¸¥ Â§4 à¹€à¸›à¸´à¸”à¹ƒà¸Šà¹‰.
> à¹„à¸¡à¹ˆà¸¡à¸µ field à¹ƒà¸«à¸¡à¹ˆà¸•à¸±à¸§à¹ƒà¸”à¸—à¸µà¹ˆ "à¸šà¸±à¸‡à¸„à¸±à¸š" à¸ªà¸³à¸«à¸£à¸±à¸š dispatch/verify à¸‚à¸­à¸‡à¹€à¸”à¸´à¸¡.

### 3.3 Temporal versioning (bitemporal-lite)

GoVibe à¹ƒà¸Šà¹‰ bitemporal (`asOfValidAt` / `asOfRecordedAt`). à¹€à¸£à¸²à¸”à¸¹à¸”à¸¡à¸²à¹à¸šà¸šà¹€à¸šà¸²:
- **à¹€à¸à¹‡à¸šà¸›à¸£à¸°à¸§à¸±à¸•à¸´à¸—à¸µà¹ˆ append-only log** `orchestration/roadmap/history.jsonl` (1 à¸šà¸£à¸£à¸—à¸±à¸” = 1 mutation: `{taskId, field, old, new, validAt, recordedAt, by, commit}`)
- snapshot "as-of" à¸„à¸³à¸™à¸§à¸“à¹‚à¸”à¸¢ replay log à¸ˆà¸™à¸–à¸¶à¸‡ `recordedAt` à¸—à¸µà¹ˆà¸‚à¸­ â€” à¹„à¸¡à¹ˆà¹€à¸à¹‡à¸š full copy à¸—à¸¸à¸ version (à¸à¸±à¸™ state à¹‚à¸•)
- à¸£à¸­à¸‡à¸£à¸±à¸šà¸„à¸³à¸–à¸²à¸¡à¹à¸šà¸š GoVibe: *"roadmap à¹€à¸›à¹‡à¸™à¸¢à¸±à¸‡à¹„à¸‡ à¸“ commit X / à¸§à¸±à¸™à¸—à¸µà¹ˆ Y"*

---

## 4. à¹‚à¸¡à¸”à¸¹à¸¥à¹ƒà¸«à¸¡à¹ˆà¹ƒà¸™ G-Orch (à¸”à¸¹à¸”à¸ˆà¸²à¸ GoVibe)

à¸—à¸¸à¸à¹‚à¸¡à¸”à¸¹à¸¥à¹€à¸›à¹‡à¸™ **à¹„à¸Ÿà¸¥à¹Œ .mjs à¹à¸¢à¸** + à¹€à¸£à¸µà¸¢à¸à¸ˆà¸²à¸ `engine.mjs` à¸œà¹ˆà¸²à¸™ hook â€” à¹„à¸¡à¹ˆà¸šà¸§à¸¡à¹à¸à¸™à¹€à¸”à¸´à¸¡, à¹€à¸›à¸´à¸”/à¸›à¸´à¸”à¹„à¸”à¹‰à¸—à¸µà¹ˆ `config.json`.

### 4.1 Roadmap layer â†’ generate backlog
**à¹„à¸Ÿà¸¥à¹Œ:** `orchestration/roadmap/roadmap.json` (source of truth à¸£à¸°à¸”à¸±à¸šà¹à¸œà¸™), `roadmap/importer.mjs`, `roadmap/exporter.mjs`

- **importer:** à¸­à¹ˆà¸²à¸™ GoVibe export (`covibe-roadmap-export.json` shape: `phases.{pN}.tasks[]`) â†’ à¹à¸›à¸¥à¸‡à¹€à¸›à¹‡à¸™ `backlog.json` (map field à¸•à¸²à¸¡ Â§3.1) + à¸•à¸±à¹‰à¸‡ `code/symbolLink/frnfr/trace`
- **exporter:** à¸­à¹ˆà¸²à¸™ `state.json` (à¸ªà¸–à¸²à¸™à¸°à¸£à¸±à¸™ + verdict + tokensUsed) â†’ à¹€à¸‚à¸µà¸¢à¸™à¸à¸¥à¸±à¸šà¹€à¸›à¹‡à¸™ roadmap snapshot (Markdown + JSON) à¹à¸šà¸š `govibe.roadmap.export`
- **closed loop:** roadmap â†’ backlog â†’ (dispatch/verify) â†’ state â†’ exporter â†’ roadmap (à¸­à¸±à¸›à¹€à¸”à¸• `status/version/changelog/tokensUsed`)

config:
```jsonc
"roadmap": { "enabled": true, "source": "roadmap/roadmap.json", "codePrefix": "TSK-GVM" }
```

### 4.2 Brain / memory layer
**à¹„à¸Ÿà¸¥à¹Œ:** `orchestration/brain/` â€” à¹‚à¸„à¸£à¸‡à¸•à¸²à¸¡ GoVibe `.brain`:
- `masterblock/` â€” à¸à¸£à¸­à¸šà¸„à¸´à¸”à¸–à¸²à¸§à¸£ (RICE, MoSCoW, scope-creep, small-model-prompting) â€” **copy à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡ à¹„à¸¡à¹ˆà¸¥à¸´à¸‡à¸à¹Œà¹‚à¸„à¹‰à¸”**
- `session/<date>-<topic>.md` â€” à¸ªà¸£à¸¸à¸› session (à¹€à¸‚à¸µà¸¢à¸™**à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´**à¸•à¸­à¸™à¸ˆà¸š pool: task à¸—à¸µà¹ˆ done/rework, cost, lesson)
- `rca/<taskId>-<n>.md` â€” à¹€à¸‚à¸µà¸¢à¸™**à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´**à¹€à¸¡à¸·à¹ˆà¸­ Verify Gate à¸•à¸µ `needs-rework`/`failed`: à¹€à¸à¹‡à¸š verdict issues + reject reason à¹€à¸›à¹‡à¸™ RCA
- `inbound/` â€” à¸„à¸´à¸§à¸„à¸§à¸²à¸¡à¸£à¸¹à¹‰à¸£à¸­à¸›à¸£à¸°à¸¡à¸§à¸¥

**feedback hook:** à¹ƒà¸™ `executeWithReview()` (Verify Gate) à¹€à¸¡à¸·à¹ˆà¸­ verdict = fail â†’ `brain/writeRca(task, verdict)`; à¹€à¸¡à¸·à¹ˆà¸­à¸ˆà¸š `runPool()` â†’ `brain/writeSession(summary)`.
à¸™à¸µà¹ˆà¸„à¸·à¸­ G-Log à¸‚à¸­à¸‡ orchestrator à¹€à¸­à¸‡ (à¹à¸¢à¸à¸ˆà¸²à¸ G-Log à¸‚à¸­à¸‡à¸•à¸±à¸§à¹€à¸à¸¡ â€” privacy-first à¸¢à¸±à¸‡à¸„à¸‡ local).

### 4.3 Governance gates (pre-dispatch / post-done hooks)
à¸”à¸¹à¸”à¸ˆà¸²à¸ GoVibe `scripts/docs/*` (`validate-docs`, `diff-check`, `validate-roadmap-containers`, `baseline:check`) â€” à¹€à¸‚à¸µà¸¢à¸™à¹ƒà¸«à¸¡à¹ˆà¹€à¸›à¹‡à¸™ Node built-in:
**à¹„à¸Ÿà¸¥à¹Œ:** `orchestration/gates/` â€” `docsValidate.mjs`, `diffCheck.mjs`, `roadmapValidate.mjs`

- **pre-dispatch gate:** à¸à¹ˆà¸­à¸™ `dispatchOne` â€” à¹€à¸Šà¹‡à¸„ task à¸¡à¸µ `accept`/`trace` à¸„à¸£à¸š (doc-first), `symbolLink` à¸Šà¸µà¹‰à¹„à¸Ÿà¸¥à¹Œà¸ˆà¸£à¸´à¸‡
- **post-done gate:** à¸«à¸¥à¸±à¸‡ Verify Gate pass â€” à¹€à¸Šà¹‡à¸„ diff à¸­à¸¢à¸¹à¹ˆà¹ƒà¸™à¸‚à¸­à¸šà¹€à¸‚à¸• `symbolLink`/`scope` (surgical-diff, à¸à¸±à¸™ scope creep), roadmap container à¸–à¸¹à¸à¸•à¹‰à¸­à¸‡
- gate fail â†’ task à¹„à¸¡à¹ˆà¹€à¸›à¹‡à¸™ `done` à¹à¸•à¹ˆà¹€à¸›à¹‡à¸™ `needs-rework` (à¸•à¹ˆà¸­à¸¢à¸­à¸” state machine à¹€à¸”à¸´à¸¡à¸‚à¸­à¸‡ Verify Gate)

config:
```jsonc
"gates": { "preDispatch": ["docsValidate"], "postDone": ["diffCheck", "roadmapValidate"], "blockOn": "error" }
```

### 4.4 Prioritization (RICE / MoSCoW)
**à¹„à¸Ÿà¸¥à¹Œ:** `orchestration/rank.mjs`
- à¸„à¸³à¸™à¸§à¸“ `riceScore = reach*impact*confidence/effort` à¸•à¹ˆà¸­ task (à¸ˆà¸²à¸ field Â§3.2)
- à¸›à¸£à¸±à¸š `readyTasks()` à¹ƒà¸«à¹‰ **à¹€à¸£à¸µà¸¢à¸‡à¸•à¸²à¸¡** `moscow` (mustâ†’shouldâ†’could) à¹à¸¥à¹‰à¸§ `riceScore` â€” à¸à¹ˆà¸­à¸™à¹à¸ˆà¸à¹€à¸‚à¹‰à¸² pool
- à¸‚à¸­à¸‡à¹€à¸”à¸´à¸¡ (deps gating, wave) à¸¢à¸±à¸‡à¹€à¸›à¹‡à¸™à¸•à¸±à¸§à¸à¸£à¸­à¸‡ "à¸—à¸³à¹„à¸”à¹‰à¹„à¸«à¸¡"; RICE/MoSCoW à¹€à¸›à¹‡à¸™à¸•à¸±à¸§à¸à¸³à¸«à¸™à¸” "à¸—à¸³à¸­à¸±à¸™à¹„à¸«à¸™à¸à¹ˆà¸­à¸™" à¸ à¸²à¸¢à¹ƒà¸™ wave à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸™

### 4.5 Agent-role fleet
à¸”à¸¹à¸”à¹à¸™à¸§à¸„à¸´à¸” `.agents/*/AGENT.md` à¸‚à¸­à¸‡ GoVibe (JANUS/ATHER/LYRA/THESEUS) à¹€à¸‚à¹‰à¸²à¸¡à¸²à¹€à¸›à¹‡à¸™ **role registry à¸šà¸²à¸‡ à¹†**:
**à¹„à¸Ÿà¸¥à¹Œ:** `orchestration/roles.json` â€” map `roleName â†’ { tier, systemPreamble, policyDocs[] }`
- routing à¸›à¸±à¸ˆà¸ˆà¸¸à¸šà¸±à¸™ (typeâ†’architect/coder/worker) à¸¢à¸±à¸‡à¸­à¸¢à¸¹à¹ˆ à¹à¸•à¹ˆ role à¹€à¸žà¸´à¹ˆà¸¡ **persona/policy preamble** à¹€à¸‚à¹‰à¸² prompt (à¹€à¸Šà¹ˆà¸™ auditor à¹ƒà¸Šà¹‰ `RCA-Standard`, devops à¹ƒà¸Šà¹‰ release-gate checklist)
- à¹„à¸¡à¹ˆà¸ªà¸£à¹‰à¸²à¸‡ agent process à¹ƒà¸«à¸¡à¹ˆ â€” à¹à¸„à¹ˆà¸›à¸£à¸±à¸š `buildPrompt()` à¹ƒà¸«à¹‰à¹à¸—à¸£à¸ role preamble + policy à¸—à¸µà¹ˆ scope à¹ƒà¸«à¹‰

### 4.6 MCP server surface (BRIDGE)
**à¹„à¸Ÿà¸¥à¹Œ:** `orchestration/mcp/server.mjs` â€” JSON-RPC over stdio (à¹‚à¸„à¸£à¸‡à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸š GoVibe `govibe-mcp-server.mjs`, à¹à¸•à¹ˆà¸«à¹ˆà¸­ `engine.mjs`)
à¸—à¸³à¹ƒà¸«à¹‰ Mission Control / Claude / à¸£à¸°à¸šà¸šà¸­à¸·à¹ˆà¸™à¹€à¸£à¸µà¸¢à¸ orchestrator à¸œà¹ˆà¸²à¸™ MCP à¸¡à¸²à¸•à¸£à¸à¸²à¸™à¹„à¸”à¹‰ (à¸”à¸¹ Â§5)

---

## 5. Interface contract â€” MCP tools à¸—à¸µà¹ˆ G-Orch à¸ˆà¸° expose

à¸ˆà¸±à¸šà¸„à¸¹à¹ˆ tool à¸‚à¸­à¸‡ GoVibe à¹€à¸‚à¹‰à¸²à¸à¸±à¸š engine function à¹€à¸žà¸·à¹ˆà¸­à¹ƒà¸«à¹‰ **Mission Control à¹€à¸£à¸µà¸¢à¸ G-Orch à¹à¸—à¸™ PowerShell scripts à¹„à¸”à¹‰**:

| MCP tool (à¹€à¸—à¸µà¸¢à¸š GoVibe) | engine.mjs à¸›à¸¥à¸²à¸¢à¸—à¸²à¸‡ | à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸ |
| --- | --- | --- |
| `orch.roadmap.load` (â‰ˆ`govibe.roadmap.load`) | `roadmap/importer` + `snapshot()` | à¸„à¸·à¸™ roadmap+à¸ªà¸–à¸²à¸™à¸°à¸£à¸±à¸™; à¸£à¸­à¸‡à¸£à¸±à¸š `asOf` |
| `orch.roadmap.update` (â‰ˆ`govibe.roadmap.update`) | `setStatus/assign` + `history.jsonl` | mutation: node.update/assignment/handoff/verification |
| `orch.roadmap.export` (â‰ˆ`govibe.roadmap.export`) | `roadmap/exporter` | à¹€à¸‚à¸µà¸¢à¸™ snapshot â†’ docs/roadmap |
| `orch.agent.run` (â‰ˆ`govibe.agent.run`) | `dispatchOne()` / `runAgent()` | à¸£à¸±à¸™ 1 task à¸ˆà¸£à¸´à¸‡ (à¸¡à¸µ Verify Gate); mode: doc/plan/audit/atomic |
| `orch.wave.run` *(à¹ƒà¸«à¸¡à¹ˆ)* | `runPool({mode,max})` | à¸£à¸±à¸™ wave/auto â€” à¸‚à¸­à¸‡à¸—à¸µà¹ˆ GoVibe à¹„à¸¡à¹ˆà¸¡à¸µ |
| `orch.docs.resolve` (â‰ˆ`govibe.docs.resolve`) | `scopeFor()` | à¸„à¸·à¸™ scoped docs (POLA, orchestrator-only à¸–à¸¹à¸à¸à¸£à¸­à¸‡) |
| `orch.snapshot` *(à¹ƒà¸«à¸¡à¹ˆ)* | `snapshot()` | progress/counts/waves/usage live |
| `orch.workspace.validate` (â‰ˆ`govibe.workspace.validate`) | `gates/*` | à¸£à¸±à¸™ governance gates |

> Mission Control à¸‚à¸­à¸‡ GoVibe (React + ws) à¸Šà¸µà¹‰à¸¡à¸²à¸—à¸µà¹ˆ MCP à¸™à¸µà¹‰à¹„à¸”à¹‰à¹€à¸¥à¸¢ â†’ à¹„à¸”à¹‰ roadmap viz à¸‚à¸­à¸‡ GoVibe + execution à¸ˆà¸£à¸´à¸‡à¸‚à¸­à¸‡ G-Orch à¹‚à¸”à¸¢à¹„à¸¡à¹ˆà¸•à¹‰à¸­à¸‡à¹€à¸‚à¸µà¸¢à¸™ UI à¹ƒà¸«à¸¡à¹ˆ

---

## 6. Flow à¸£à¸§à¸¡ â€” closed loop

```
        GoVibe Mission Control (roadmap viz, React)
                    â”‚  à¹€à¸£à¸µà¸¢à¸à¸œà¹ˆà¸²à¸™ MCP (Â§5)
                    â–¼
 â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 â”‚  G-Orchestration (à¹à¸à¸™)                                     â”‚
 â”‚                                                            â”‚
 â”‚  roadmap.json â”€â”€importer(Â§4.1)â”€â”€â–º backlog.json             â”‚
 â”‚       â–²                              â”‚                     â”‚
 â”‚       â”‚                     rank(Â§4.4) RICE/MoSCoW         â”‚
 â”‚       â”‚                              â”‚                     â”‚
 â”‚       â”‚                     readyTasks â†’ claim/wave        â”‚
 â”‚       â”‚                              â”‚                     â”‚
 â”‚  exporter(Â§4.1)            pre-gate(Â§4.3) â”€â”€â–º dispatch      â”‚
 â”‚       â–²                              â”‚       (runAgent)    â”‚
 â”‚       â”‚                              â–¼                     â”‚
 â”‚       â”‚                     Verify Gate (à¹€à¸”à¸´à¸¡) â”€â”€passâ”€â”€â”    â”‚
 â”‚       â”‚                              â”‚ fail            â”‚    â”‚
 â”‚       â”‚                     post-gate(Â§4.3)            â”‚    â”‚
 â”‚       â”‚                              â”‚                 â–¼    â”‚
 â”‚  state.json â—„â”€â”€â”€â”€â”€â”€ done/version/changelog/tokensUsed â”€â”˜    â”‚
 â”‚       â”‚                              â”‚ fail                 â”‚
 â”‚       â””â”€â”€â–º brain(Â§4.2): session log  â””â”€â”€â–º brain: RCA        â”‚
 â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

à¸«à¸™à¸¶à¹ˆà¸‡à¸£à¸­à¸š: **roadmap (à¸§à¸²à¸‡à¹à¸œà¸™+à¸à¸³à¸à¸±à¸š) â†’ backlog (à¸ˆà¸±à¸”à¸¥à¸³à¸”à¸±à¸š) â†’ dispatch (à¸£à¸±à¸™) â†’ verify (à¸•à¸£à¸§à¸ˆ) â†’ state/roadmap (à¸šà¸±à¸™à¸—à¸¶à¸) â†’ brain (à¹€à¸£à¸µà¸¢à¸™à¸£à¸¹à¹‰)**

---

## 7. à¹à¸œà¸™ migrate à¹€à¸›à¹‡à¸™à¹€à¸Ÿà¸ª (M0â€“M5)

à¹à¸•à¹ˆà¸¥à¸°à¹€à¸Ÿà¸ª **à¸ªà¹ˆà¸‡à¸¡à¸­à¸šà¹„à¸”à¹‰à¹€à¸­à¸‡** à¹à¸¥à¸° **à¹„à¸¡à¹ˆà¸—à¸³à¸‚à¸­à¸‡à¹€à¸”à¸´à¸¡à¸žà¸±à¸‡** (Verify Gate + pool à¹€à¸”à¸´à¸¡à¸•à¹‰à¸­à¸‡à¸£à¸±à¸™à¸œà¹ˆà¸²à¸™à¸—à¸¸à¸à¹€à¸Ÿà¸ª).

| à¹€à¸Ÿà¸ª | à¸‚à¸­à¸šà¹€à¸‚à¸• | Acceptance | à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¹ˆà¸¢à¸‡à¸•à¹ˆà¸­à¸‚à¸­à¸‡à¹€à¸”à¸´à¸¡ |
| --- | --- | --- | --- |
| **M0 â€” Schema extend** | à¹€à¸žà¸´à¹ˆà¸¡ field Â§3.2 (optional) à¹ƒà¸™ schema + engine à¸­à¹ˆà¸²à¸™à¸œà¹ˆà¸²à¸™ | backlog à¹€à¸”à¸´à¸¡à¸£à¸±à¸™ pool+verify à¸œà¹ˆà¸²à¸™à¹„à¸¡à¹ˆà¹à¸•à¸°; task à¸—à¸µà¹ˆà¸¡à¸µ field à¹ƒà¸«à¸¡à¹ˆà¸à¹‡à¸£à¸±à¸™à¹„à¸”à¹‰ | à¸•à¹ˆà¸³ (optional à¸¥à¹‰à¸§à¸™) |
| **M1 â€” Roadmap importer/exporter (Â§4.1)** | GoVibe export â†’ backlog; state â†’ roadmap snapshot | import `covibe-roadmap-export.json` à¹„à¸”à¹‰ backlog à¸—à¸µà¹ˆ dispatch à¹„à¸”à¹‰à¸ˆà¸£à¸´à¸‡; export à¸à¸¥à¸±à¸šà¸„à¸£à¸š field | à¸•à¹ˆà¸³ (à¹‚à¸¡à¸”à¸¹à¸¥à¹à¸¢à¸) |
| **M2 â€” Brain feedback (Â§4.2)** | hook session log + RCA à¸ˆà¸²à¸ Verify Gate | à¸ˆà¸š pool à¸¡à¸µ session md; needs-rework à¸ªà¸£à¹‰à¸²à¸‡ RCA à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´ | à¸•à¹ˆà¸³ (write-only hook) |
| **M3 â€” Governance gates (Â§4.3)** | pre/post gate à¸•à¹ˆà¸­ state machine | task à¸‚à¸²à¸” trace à¸–à¸¹à¸ block à¸à¹ˆà¸­à¸™ dispatch; diff à¸™à¸­à¸ scope â†’ needs-rework | à¸à¸¥à¸²à¸‡ (à¹à¸—à¸£à¸ state) â€” à¸¡à¸µ `blockOn` à¸›à¸´à¸”à¹„à¸”à¹‰ |
| **M4 â€” RICE/MoSCoW ranking (Â§4.4)** | `readyTasks` à¹€à¸£à¸µà¸¢à¸‡à¸•à¸²à¸¡ priority | task `must` à¸­à¸­à¸à¸à¹ˆà¸­à¸™ `could` à¸ à¸²à¸¢à¹ƒà¸™ wave; à¹„à¸¡à¹ˆà¸¥à¸°à¹€à¸¡à¸´à¸” deps | à¸•à¹ˆà¸³ (à¸ˆà¸±à¸”à¸¥à¸³à¸”à¸±à¸šà¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™) |
| **M5 â€” MCP server (Â§4.6, Â§5)** | à¸«à¹ˆà¸­ engine à¹€à¸›à¹‡à¸™ MCP; Mission Control à¹€à¸Šà¸·à¹ˆà¸­à¸¡ | Mission Control à¹€à¸£à¸µà¸¢à¸ `orch.wave.run`/`orch.snapshot` à¹„à¸”à¹‰ | à¸•à¹ˆà¸³ (surface à¹ƒà¸«à¸¡à¹ˆ, à¹„à¸¡à¹ˆà¹à¸•à¸° core) |

> à¸¥à¸³à¸”à¸±à¸šà¸™à¸µà¹‰à¹€à¸­à¸² "à¸‚à¸­à¸‡à¸—à¸µà¹ˆà¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¹ˆà¸¢à¸‡à¸•à¹ˆà¸³ + à¸›à¸¥à¸”à¸¥à¹‡à¸­à¸à¸–à¸±à¸”à¹„à¸›" à¸à¹ˆà¸­à¸™. M0 à¹€à¸›à¹‡à¸™à¸à¸²à¸™à¸‚à¸­à¸‡à¸—à¸¸à¸à¹€à¸Ÿà¸ª. M5 à¸—à¸³à¹€à¸¡à¸·à¹ˆà¸­à¸­à¸¢à¸²à¸à¹ƒà¸«à¹‰ Mission Control à¸„à¸¸à¸¡à¸ˆà¸£à¸´à¸‡.

---

## 8. Requirement Traceability (à¸”à¸¹à¸”à¸ˆà¸²à¸ GoVibe governance)

à¸«à¹ˆà¸§à¸‡à¹‚à¸‹à¹ˆà¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸•à¸²à¸¡à¸£à¸­à¸¢à¹„à¸”à¹‰à¸•à¸±à¹‰à¸‡à¹à¸•à¹ˆà¸•à¹‰à¸™à¸™à¹‰à¸³à¸–à¸¶à¸‡à¸›à¸¥à¸²à¸¢à¸™à¹‰à¸³:

```
PRD/SRS  â”€â”€â–º  roadmap task (frnfr, code)  â”€â”€â–º  backlog task (trace.prd/srs)
   â–²                                                      â”‚
   â”‚                                              dispatch + Verify Gate
   â”‚                                                      â”‚
test (trace.test) â—„â”€â”€ verdict/changelog â—„â”€â”€ state â—„â”€â”€â”€â”€â”€â”€â”€â”˜
```

- `task.trace.srs` à¸œà¸¹à¸à¸à¸±à¸šà¹€à¸¥à¸‚ requirement à¸ˆà¸£à¸´à¸‡ (à¹€à¸Šà¹ˆà¸™ `R-02`, "latency budget Â§1" à¸—à¸µà¹ˆà¸¡à¸µà¹ƒà¸™ backlog à¹à¸¥à¹‰à¸§)
- `task.frnfr` à¹à¸¢à¸ FR/NFR à¹€à¸žà¸·à¹ˆà¸­à¹ƒà¸«à¹‰ NFR (à¹€à¸Šà¹ˆà¸™ latency/CPU gate) à¸•à¸²à¸¡à¸£à¸­à¸¢à¹„à¸› SRS Â§non-functional
- Verify Gate verdict + `changelog` = à¸«à¸¥à¸±à¸à¸à¸²à¸™à¸§à¹ˆà¸² acceptance à¸–à¸¹à¸à¸•à¸£à¸§à¸ˆ (à¸›à¸´à¸”à¸Šà¹ˆà¸­à¸‡ "done â‰  à¸œà¹ˆà¸²à¸™" à¸—à¸µà¹ˆ ADR-O-001 à¹à¸à¹‰)

---

## 9. à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¹ˆà¸¢à¸‡ & à¸à¸²à¸£à¸à¸±à¸™

| à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¹ˆà¸¢à¸‡ | à¸œà¸¥ | à¸à¸²à¸£à¸à¸±à¸™ |
| --- | --- | --- |
| à¸¥à¸²à¸ dependency à¸‚à¸­à¸‡ GoVibe (React/Vite/ws) à¹€à¸‚à¹‰à¸²à¹à¸à¸™ | à¸—à¸³à¸¥à¸²à¸¢ zero-dep | **P2:** à¹€à¸‚à¸µà¸¢à¸™à¹ƒà¸«à¸¡à¹ˆà¸”à¹‰à¸§à¸¢ Node built-in; à¸«à¹‰à¸²à¸¡ import à¹‚à¸„à¹‰à¸” GoVibe |
| field schema à¸šà¸§à¸¡ à¸—à¸³ state.json à¸«à¸™à¸±à¸ | I/O à¸Šà¹‰à¸² | bitemporal à¹€à¸à¹‡à¸šà¸—à¸µà¹ˆ `history.jsonl` (append) à¹„à¸¡à¹ˆ copy à¸—à¸¸à¸ version |
| governance gate à¹€à¸‚à¹‰à¸¡à¹„à¸› â†’ task à¸„à¹‰à¸²à¸‡ | progress à¸«à¸¢à¸¸à¸” | `gates.blockOn` à¸›à¸£à¸±à¸š `error|warn|off`; à¸„à¹ˆà¸²à¹€à¸£à¸´à¹ˆà¸¡ warn |
| roadmap à¸‚à¸­à¸‡ GoVibe (CoVibe demo) à¸„à¸™à¸¥à¸°à¹‚à¸›à¸£à¹€à¸ˆà¸à¸•à¹Œà¸à¸±à¸š G-Maiden | mapping à¹€à¸žà¸µà¹‰à¸¢à¸™ | importer à¹€à¸›à¹‡à¸™ adapter à¸•à¹ˆà¸­ schema; map à¸œà¹ˆà¸²à¸™ config `codePrefix`/field-map |
| MCP surface à¹€à¸›à¸´à¸”à¸Šà¹ˆà¸­à¸‡à¸ªà¸±à¹ˆà¸‡à¸‡à¸²à¸™à¹‚à¸”à¸¢à¹„à¸¡à¹ˆà¸•à¸±à¹‰à¸‡à¹ƒà¸ˆ | dispatch à¸«à¸¥à¸¸à¸” | MCP `actor` required (à¹€à¸«à¸¡à¸·à¸­à¸™ GoVibe); reuse auth-mode + permission à¸‚à¸­à¸‡ executor à¹€à¸”à¸´à¸¡ |
| 2 source of truth (roadmap.json vs backlog.json) à¸‚à¸±à¸”à¸à¸±à¸™ | à¸‡à¸‡à¸§à¹ˆà¸²à¹ƒà¸„à¸£à¸ˆà¸£à¸´à¸‡ | roadmap = à¹à¸œà¸™ (à¸„à¸™/Mission Control à¹à¸à¹‰); backlog = derived (importer à¸ªà¸£à¹‰à¸²à¸‡); à¸«à¹‰à¸²à¸¡à¹à¸à¹‰ backlog à¸¡à¸·à¸­à¹€à¸¡à¸·à¹ˆà¸­ roadmap à¹€à¸›à¸´à¸” |

---

## 10. Out of scope (à¸£à¸­à¸šà¸™à¸µà¹‰à¹„à¸¡à¹ˆà¸—à¸³)

- à¹„à¸¡à¹ˆà¸¢à¹‰à¸²à¸¢ Mission Control (React UI) à¸¡à¸²à¹€à¸‚à¸µà¸¢à¸™à¹ƒà¸«à¸¡à¹ˆà¹ƒà¸™ G-Orch â€” à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¸œà¹ˆà¸²à¸™ MCP à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™
- à¹„à¸¡à¹ˆà¸—à¸³ distributed/multi-host (lock à¸¢à¸±à¸‡à¹€à¸›à¹‡à¸™ single-host file lock à¹€à¸”à¸´à¸¡)
- à¹„à¸¡à¹ˆà¸”à¸¹à¸” GoVibe agent runner PowerShell scripts (`run-*.ps1`) â€” à¹à¸—à¸™à¸”à¹‰à¸§à¸¢ `orch.agent.run` à¸—à¸µà¹ˆà¸œà¹ˆà¸²à¸™ Verify Gate
- à¹„à¸¡à¹ˆà¹à¸•à¸° G-Log / privacy à¸‚à¸­à¸‡ **à¸•à¸±à¸§à¹€à¸à¸¡ G-Maiden** â€” brain à¸‚à¸­à¸‡ orchestrator à¹€à¸›à¹‡à¸™à¸„à¸™à¸¥à¸°à¸Šà¸±à¹‰à¸™ (à¹€à¸¡à¸•à¸²à¹€à¸£à¸·à¹ˆà¸­à¸‡à¸à¸²à¸£à¸žà¸±à¸’à¸™à¸² à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸œà¸¹à¹‰à¹€à¸¥à¹ˆà¸™)

---

## à¸ à¸²à¸„à¸œà¸™à¸§à¸ A â€” checklist à¹€à¸£à¸´à¹ˆà¸¡ M0 (schema extend)

- [ ] à¹€à¸žà¸´à¹ˆà¸¡ field Â§3.2 à¹€à¸›à¹‡à¸™ optional à¹ƒà¸™ `backlog.json` 1 task (à¹€à¸Šà¹ˆà¸™ `G3.4`) à¹€à¸žà¸·à¹ˆà¸­ smoke test
- [ ] `engine.mjs` à¸­à¹ˆà¸²à¸™ task à¸—à¸µà¹ˆà¸¡à¸µ field à¹ƒà¸«à¸¡à¹ˆà¹„à¸”à¹‰ à¹à¸¥à¸° task à¸—à¸µà¹ˆà¹„à¸¡à¹ˆà¸¡à¸µà¸à¹‡à¸¢à¸±à¸‡à¸£à¸±à¸™
- [ ] à¸£à¸±à¸™ Verify Gate à¹€à¸”à¸´à¸¡à¸šà¸™ task à¸—à¸µà¹ˆà¸¡à¸µ field à¹ƒà¸«à¸¡à¹ˆ â†’ à¸•à¹‰à¸­à¸‡ pass à¹€à¸«à¸¡à¸·à¸­à¸™à¹€à¸”à¸´à¸¡
- [ ] à¹€à¸‚à¸µà¸¢à¸™ `roadmap/SCHEMA.md` à¸™à¸´à¸¢à¸²à¸¡ field à¸à¸¥à¸²à¸‡ (à¹€à¸›à¹‡à¸™ `$schema` à¸‚à¸­à¸‡ backlog à¹ƒà¸«à¸¡à¹ˆ)

