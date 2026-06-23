# SPEC â€” Local-Model Anti-Error Loop (knowledge-grounded dispatch)

> **Status:** Approved (2026-06-21, USER/Boss Â· RUNBOOK Gate 2) â€” à¸à¸³à¸à¸±à¸šà¸à¸²à¸£à¸ªà¸£à¹‰à¸²à¸‡
> **Scope:** `orchestration/` â€” à¹ƒà¸Šà¹‰ GenesisDB à¹€à¸›à¹‡à¸™ knowledge backend à¹€à¸žà¸·à¹ˆà¸­ **à¸¥à¸” failure à¸‚à¸­à¸‡ local model /
> microtask** (à¹€à¸›à¹‰à¸²à¸«à¸¡à¸²à¸¢à¸«à¸¥à¸±à¸ à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ generic memory)
> **Governed by:** [ADR-O-001](ADR-O-001--verify-gate.md) (Verify Gate), [ADR-O-003](ADR-O-003--backend-store.md)
> (GenesisDB = optional knowledge backend)
> **à¸­à¹‰à¸²à¸‡à¸­à¸´à¸‡ failure à¸ˆà¸£à¸´à¸‡:** `docs/guides/small-model-prompting.md`,
> [REPORT--prompt-fix-before-after.md](REPORT--prompt-fix-before-after.md)

---

## 1. à¸›à¸±à¸à¸«à¸² â€” failure mode à¸—à¸µà¹ˆà¸¢à¸±à¸‡à¹€à¸«à¸¥à¸·à¸­à¸«à¸¥à¸±à¸‡ Verify Gate

à¸ˆà¸²à¸ GUIDE + REPORT (à¸ à¸²à¸„à¸ªà¸™à¸²à¸¡à¸ˆà¸£à¸´à¸‡) local model / microtask à¸œà¸´à¸”à¸žà¸¥à¸²à¸”à¹à¸šà¸šà¸™à¸µà¹‰:

| Failure mode | mitigation à¸›à¸±à¸ˆà¸ˆà¸¸à¸šà¸±à¸™ | **à¸Šà¹ˆà¸­à¸‡à¸§à¹ˆà¸²à¸‡à¸—à¸µà¹ˆà¸¢à¸±à¸‡à¹€à¸«à¸¥à¸·à¸­** |
| --- | --- | --- |
| Hallucinate API à¸ˆà¸£à¸´à¸‡ (`setup-rust@v3`), à¸¥à¸·à¸¡ `pnpm` | Verify Gate à¸ˆà¸±à¸š â†’ needs-rework | âŒ **à¸£à¸­à¸šà¸«à¸™à¹‰à¸²à¸—à¸³à¸œà¸´à¸”à¹€à¸”à¸´à¸¡à¸‹à¹‰à¸³** â€” à¹„à¸¡à¹ˆà¸¡à¸µ memory à¸‚à¸­à¸‡à¸„à¸§à¸²à¸¡à¸œà¸´à¸” |
| Context overflow / attention collapse (à¸ªà¹ˆà¸‡à¹„à¸Ÿà¸¥à¹Œà¹€à¸•à¹‡à¸¡ â†’ à¹à¸à¹‰à¸¡à¸±à¹ˆà¸§) | POLA `scope.docs` + `budgetTokens` (à¹€à¸”à¸²à¹€à¸­à¸‡) | âŒ scope **à¸”à¹‰à¸§à¸¢à¸¡à¸·à¸­** à¹„à¸¡à¹ˆà¹à¸¡à¹ˆà¸™; budget à¹€à¸à¸´à¸™à¸ˆà¸£à¸´à¸‡à¸šà¹ˆà¸­à¸¢ |
| Blank-page syndrome (from-scratch â†’ pattern à¸‚à¸¢à¸°) | GUIDE: scaffolding-first | âŒ scaffold static; **à¹„à¸¡à¹ˆà¸¡à¸µ exemplar à¸ˆà¸£à¸´à¸‡**à¸ˆà¸²à¸à¸‡à¸²à¸™à¸—à¸µà¹ˆà¹€à¸„à¸¢à¸œà¹ˆà¸²à¸™ |
| Repetition loop / forgetting | GUIDE: micro-task, anti-loop prompt | âš ï¸ à¸¥à¸”à¹„à¸”à¹‰à¹à¸•à¹ˆà¸¢à¸±à¸‡à¹€à¸à¸´à¸”à¹€à¸¡à¸·à¹ˆà¸­ context à¹„à¸¡à¹ˆà¸„à¸¡ |
| Empty counted as done | Verify Gate content-check (à¹à¸à¹‰à¹à¸¥à¹‰à¸§) | âœ… à¸›à¸´à¸”à¹à¸¥à¹‰à¸§ |

**à¹à¸à¹ˆà¸™à¸Šà¹ˆà¸­à¸‡à¸§à¹ˆà¸²à¸‡:** à¸£à¸°à¸šà¸š **"à¸ˆà¸±à¸š" error à¹„à¸”à¹‰** (Verify Gate) à¹à¸•à¹ˆ local model **"à¹€à¸£à¸µà¸¢à¸™à¸£à¸¹à¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰"** â€”
RCA à¸–à¸¹à¸à¹€à¸‚à¸µà¸¢à¸™à¹€à¸›à¹‡à¸™ `.md` à¹à¸•à¹ˆà¹„à¸¡à¹ˆà¹€à¸„à¸¢à¸–à¸¹à¸ **à¸”à¸¶à¸‡à¸à¸¥à¸±à¸šà¹€à¸‚à¹‰à¸² prompt** à¸‚à¸­à¸‡à¸£à¸­à¸šà¸–à¸±à¸”à¹„à¸›. à¸šà¸§à¸à¸à¸±à¸š `maxReworkRounds: 1`
(à¸¥à¸­à¸‡à¸£à¸­à¸šà¹€à¸”à¸µà¸¢à¸§à¹à¸¥à¹‰à¸§ escalate) â†’ à¸„à¸§à¸²à¸¡à¸œà¸´à¸”à¹€à¸”à¸´à¸¡à¸§à¸™à¸à¸¥à¸±à¸šà¸¡à¸²à¹€à¸£à¸·à¹ˆà¸­à¸¢ à¹†.

---

## 2. à¹à¸™à¸§à¸„à¸´à¸” â€” closed anti-error loop

à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™ knowledge backend (GenesisDB, ADR-O-003) à¸ˆà¸²à¸ "à¸—à¸µà¹ˆà¹€à¸à¹‡à¸šà¸„à¸§à¸²à¸¡à¸ˆà¸³à¹€à¸‰à¸¢ à¹†" à¹€à¸›à¹‡à¸™ **à¸§à¸‡à¸›à¸´à¸”à¸à¸±à¸™à¸œà¸´à¸”à¸‹à¹‰à¸³**:

```
   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ inject grounded context â—„â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
   â–¼                                                               â”‚
dispatch(local/microtask) â”€â”€â–º produce â”€â”€â–º Verify Gate â”€â”€passâ”€â”€â–º done
                                              â”‚ fail                â”‚
                                              â–¼                     â”‚
                                  store failure as node+embedding â”€â”€â”˜
                                  (task à¸„à¸¥à¹‰à¸²à¸¢à¸£à¸­à¸šà¸«à¸™à¹‰à¸² â†’ retrieve "âŒ X")
```

3 à¸à¸¥à¹„à¸ (map à¸•à¸£à¸‡à¸à¸±à¸š GenesisDB API à¸ˆà¸²à¸ `index.d.ts`):

| à¸à¸¥à¹„à¸ | à¹à¸à¹‰ failure | GenesisDB primitive |
| --- | --- | --- |
| **G1 â€” Ground:** à¸”à¸¶à¸‡ context à¸—à¸µà¹ˆà¸„à¸¡à¸žà¸­à¸”à¸µ budget | overflow, blank-page | `retrieveContext(targetId, tier, budget, fuzzy)` â†’ `ContextPackage{tokenEstimate, reasoningPath}` (GRL H0â€“H5) |
| **G2 â€” Remember:** à¹€à¸à¹‡à¸šà¸„à¸§à¸²à¸¡à¸œà¸´à¸”à¸—à¸¸à¸à¸„à¸£à¸±à¹‰à¸‡à¸—à¸µà¹ˆ Verify Gate à¸•à¸µà¸à¸¥à¸±à¸š | à¸—à¸³à¸œà¸´à¸”à¸‹à¹‰à¸³ | `addNode{labels:["failure"], embedding, props:{issue, fix}}` + `addEdge{rel:"failed_with"}` |
| **G3 â€” Retrieve:** à¸à¹ˆà¸­à¸™ dispatch à¸”à¸¶à¸‡ "à¸„à¸§à¸²à¸¡à¸œà¸´à¸”/à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡" à¸—à¸µà¹ˆà¸„à¸¥à¹‰à¸²à¸¢ task à¸™à¸µà¹‰ | à¸—à¸³à¸œà¸´à¸”à¸‹à¹‰à¸³, hallucinate | `hybridSearch{queryVector, k, alpha}` à¸šà¸™ failure/passed nodes |

---

## 3. Prompt-injection contract (à¸•à¹ˆà¸­à¸¢à¸­à¸” `buildPrompt`)

à¸à¹ˆà¸­à¸™ dispatch local/microtask, à¸›à¸£à¸°à¸à¸­à¸š prompt à¸ˆà¸²à¸ (à¸•à¸²à¸¡à¸¥à¸³à¸”à¸±à¸š):

```
[ROLE / SMALL_MODEL_RULES]          â† à¹€à¸”à¸´à¸¡ (GUIDE: one-action, â‰¤150 à¸šà¸£à¸£à¸—à¸±à¸”, surgical, escalate)
[SCAFFOLD]                          â† à¹€à¸”à¸´à¸¡ (task.scope.scaffold)
[GROUNDED CONTEXT]                  â† G1: retrieveContext(budget = scope.budgetTokens)
[âŒ PAST MISTAKES â€” à¸«à¹‰à¸²à¸¡à¸—à¸³]          â† G3: top-k failure nodes à¸—à¸µà¹ˆà¸„à¸¥à¹‰à¸²à¸¢ task à¸™à¸µà¹‰ (à¹€à¸Šà¹ˆà¸™ "à¸«à¹‰à¸²à¸¡à¹ƒà¸Šà¹‰ actions/setup-rust@vN â€” à¹„à¸¡à¹ˆà¸¡à¸µà¸ˆà¸£à¸´à¸‡; à¹ƒà¸Šà¹‰ dtolnay/rust-toolchain")
[âœ… EXEMPLAR (optional)]             â† G3: passed task à¸—à¸µà¹ˆà¸„à¸¥à¹‰à¸²à¸¢ à¹€à¸›à¹‡à¸™ few-shot
[TASK + ACCEPTANCE]                 â† à¹€à¸”à¸´à¸¡
```

**à¸à¸•à¸´à¸à¸²à¸„à¸¸à¸¡ overflow (à¹à¸à¹‰ failure mode à¸«à¸¥à¸±à¸):** à¸œà¸¥à¸£à¸§à¸¡ token à¸‚à¸­à¸‡ prompt **à¸•à¹‰à¸­à¸‡ â‰¤ `scope.budgetTokens`**
à¹‚à¸”à¸¢à¹ƒà¸Šà¹‰ `ContextPackage.tokenEstimate` à¹€à¸›à¹‡à¸™à¸¡à¸²à¸•à¸£à¸§à¸±à¸”. à¸–à¹‰à¸²à¹€à¸à¸´à¸™ â†’ à¸•à¸±à¸” EXEMPLAR à¸à¹ˆà¸­à¸™, à¹à¸¥à¹‰à¸§ GROUNDED CONTEXT
(à¹€à¸¥à¸·à¹ˆà¸­à¸™ tier à¸¥à¸‡ H0â†’H1), à¹€à¸à¹‡à¸š PAST MISTAKES à¹„à¸§à¹‰à¹€à¸ªà¸¡à¸­ (à¸ªà¸³à¸„à¸±à¸à¸ªà¸¸à¸”à¸•à¹ˆà¸­à¸à¸²à¸£à¸à¸±à¸™à¸œà¸´à¸”à¸‹à¹‰à¸³).

---

## 4. Data model â€” failure/task à¹€à¸›à¹‡à¸™ node à¹ƒà¸™ GenesisDB

map à¸œà¹ˆà¸²à¸™ adapter `store/knowledge.mjs` (ADR-O-003) à¹„à¸¡à¹ˆà¸œà¸¹à¸ engine à¸à¸±à¸š backend à¸•à¸£à¸‡:

```jsonc
// task â†’ node
addNode({ labels:["task"], lang:"th",
  props:{ id:"G0.3", type:"config", title:"...", accept:"..." },
  embedding: embed(title + accept) })          // à¹ƒà¸Šà¹‰à¸„à¹‰à¸™à¸«à¸² "task à¸„à¸¥à¹‰à¸²à¸¢"

// Verify Gate fail â†’ failure node + edge
addNode({ labels:["failure"],
  props:{ issue:"hallucinated actions/setup-rust@v3", severity:"critical",
          fix:"à¹ƒà¸Šà¹‰ dtolnay/rust-toolchain à¹à¸—à¸™", model:"ollama:gemma4-rust-coder" },
  embedding: embed(issue + task.title) })
addEdge({ from:"G0.3", to:<failureId>, rel:"failed_with", causedBy:<reviewVerdictId> })
```

- **bitemporal** (`validFrom`/`asOf`/`supersedeNode`): à¹€à¸¡à¸·à¹ˆà¸­ fix à¹à¸¥à¹‰à¸§ â†’ `supersedeNode` à¸„à¸§à¸²à¸¡à¸œà¸´à¸”à¹€à¸à¹ˆà¸² â†’
  retrieve à¹€à¸«à¹‡à¸™à¸§à¹ˆà¸² "à¹€à¸„à¸¢à¸œà¸´à¸” à¹à¸•à¹ˆ fix à¹à¸¥à¹‰à¸§à¹€à¸›à¹‡à¸™ Y" (à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¹à¸„à¹ˆ "à¹€à¸„à¸¢à¸œà¸´à¸”")
- **community/drift** (`detectCommunities`, `SuperNode.drift`): à¸ˆà¸±à¸”à¸à¸¥à¸¸à¹ˆà¸¡à¸„à¸§à¸²à¸¡à¸œà¸´à¸”à¸—à¸µà¹ˆà¹€à¸à¸´à¸”à¸šà¹ˆà¸­à¸¢ â†’ à¸ªà¸±à¸à¸à¸²à¸“à¸§à¹ˆà¸²
  à¸„à¸§à¸£à¹à¸à¹‰à¸—à¸µà¹ˆ scaffold/GUIDE à¸£à¸°à¸”à¸±à¸šà¸£à¸°à¸šà¸š à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¸£à¸²à¸¢ task

---

## 5. à¸—à¸³à¹„à¸¡à¸•à¹‰à¸­à¸‡ vector/embedding à¸•à¸±à¹‰à¸‡à¹à¸•à¹ˆà¹€à¸Ÿà¸ªà¹à¸£à¸ (à¸•à¸­à¸šà¸„à¸³à¸–à¸²à¸¡à¸—à¸µà¹ˆà¸„à¹‰à¸²à¸‡)

à¸à¸¥à¹„à¸ G3 "à¸”à¸¶à¸‡à¸„à¸§à¸²à¸¡à¸œà¸´à¸”/à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡à¸—à¸µà¹ˆ**à¸„à¸¥à¹‰à¸²à¸¢** task à¸™à¸µà¹‰" = **semantic similarity** à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ graph traversal â€”
graph-only à¸•à¸­à¸š "task à¹„à¸«à¸™à¸œà¸´à¸”à¹à¸šà¸šà¹€à¸›à¹Šà¸° à¹† id à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸™" à¹„à¸”à¹‰ à¹à¸•à¹ˆà¸•à¸­à¸š "task à¸­à¸·à¹ˆà¸™à¸—à¸µà¹ˆà¸‡à¸²à¸™à¸„à¸¥à¹‰à¸²à¸¢à¸à¸±à¸™à¹€à¸„à¸¢à¸œà¸´à¸”à¸¢à¸±à¸‡à¹„à¸‡" à¹„à¸¡à¹ˆà¹„à¸”à¹‰.
à¸”à¸±à¸‡à¸™à¸±à¹‰à¸™ **à¸•à¹‰à¸­à¸‡à¸¡à¸µ `hybridSearch` (vector + lexical) à¸•à¸±à¹‰à¸‡à¹à¸•à¹ˆ L1** â€” embedding à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¸‚à¸­à¸‡ optional à¹ƒà¸™à¸ªà¹€à¸›à¸à¸™à¸µà¹‰.

**à¹à¸«à¸¥à¹ˆà¸‡ embedding** (à¸•à¹‰à¸­à¸‡à¸•à¸±à¸”à¸ªà¸´à¸™ â€” à¸”à¸¹à¸—à¹‰à¸²à¸¢à¹€à¸­à¸à¸ªà¸²à¸£): `bge-m3` 1024-dim (à¸•à¸£à¸‡à¸à¸±à¸š benchmark GenesisDB,
`vectorDim:1024`) à¸œà¹ˆà¸²à¸™ Ollama local (`/api/embeddings`) â€” à¸Ÿà¸£à¸µ, on-device, à¹„à¸¡à¹ˆà¸à¸´à¸™à¹‚à¸„à¸§à¸•à¹‰à¸² Claude.
GenesisDB à¸¡à¸µ Thai-aware lexical matching à¸­à¸¢à¸¹à¹ˆà¹à¸¥à¹‰à¸§ â†’ `alpha` à¸œà¸ªà¸¡ vectorâ†”lexical à¸Šà¹ˆà¸§à¸¢à¸‡à¸²à¸™à¹„à¸—à¸¢.

---

## 6. Degrade path (à¸£à¸±à¸à¸©à¸² P1 zero-dep à¸‚à¸­à¸‡à¹à¸à¸™)

`store.knowledge = "file"` (à¸”à¸µà¸Ÿà¸­à¸¥à¸•à¹Œ) â†’ à¸›à¸´à¸” G1/G2/G3, fallback à¹€à¸›à¹‡à¸™ **GUIDE static + Verify Gate à¹€à¸”à¸´à¸¡** â€”
orchestrator à¸¢à¸±à¸‡à¸£à¸±à¸™ pool+verify à¹„à¸”à¹‰à¸„à¸£à¸š (à¹„à¸¡à¹ˆà¸•à¹‰à¸­à¸‡à¸¡à¸µ GenesisDB/embedding). à¹€à¸›à¸´à¸” `genesisdb` à¹€à¸¡à¸·à¹ˆà¸­à¸žà¸£à¹‰à¸­à¸¡.
à¸«à¸¥à¸±à¸à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸š resilience à¸‚à¸­à¸‡ G-Signal: à¸Ÿà¸µà¹€à¸ˆà¸­à¸£à¹Œà¹€à¸ªà¸£à¸´à¸¡à¸«à¸²à¸¢à¹„à¸”à¹‰ à¹à¸à¸™à¸•à¹‰à¸­à¸‡à¸£à¸­à¸”.

---

## 7. Acceptance

- **à¸à¸±à¸™à¸œà¸´à¸”à¸‹à¹‰à¸³:** task à¸—à¸µà¹ˆà¹€à¸„à¸¢ fail à¸”à¹‰à¸§à¸¢ hallucinated API `X` â†’ à¸£à¸±à¸™ task **à¸„à¸¥à¹‰à¸²à¸¢à¸à¸±à¸™**à¸£à¸­à¸šà¸–à¸±à¸”à¹„à¸›, prompt à¸¡à¸µà¸šà¸£à¸£à¸—à¸±à¸”
  "âŒ à¸«à¹‰à¸²à¸¡à¹ƒà¸Šà¹‰ X" à¹à¸¥à¸° output à¹„à¸¡à¹ˆà¸—à¸³à¸œà¸´à¸”à¹€à¸”à¸´à¸¡ (à¸§à¸±à¸”à¹€à¸—à¸µà¸¢à¸š before/after à¹à¸šà¸š REPORT)
- **à¸à¸±à¸™ overflow:** prompt à¸—à¸µà¹ˆ inject à¹à¸¥à¹‰à¸§ `tokenEstimate â‰¤ scope.budgetTokens` à¸—à¸¸à¸à¸„à¸£à¸±à¹‰à¸‡
- **resilience:** `knowledge=file` â†’ pool + Verify Gate à¸œà¹ˆà¸²à¸™à¹€à¸«à¸¡à¸·à¸­à¸™à¹€à¸”à¸´à¸¡ (regression gate)
- **retrieval à¸•à¸£à¸‡:** `hybridSearch` à¸„à¸·à¸™ failure à¸—à¸µà¹ˆà¹€à¸à¸µà¹ˆà¸¢à¸§à¸ˆà¸£à¸´à¸‡ (à¸ªà¸¸à¹ˆà¸¡à¸•à¸£à¸§à¸ˆ top-k à¸”à¹‰à¸§à¸¢à¸¡à¸·à¸­)

---

## 8. Migration (à¹€à¸Ÿà¸ª L0â€“L3 â€” à¹€à¸ªà¸£à¸´à¸¡à¸ˆà¸²à¸ ADR-O-003 follow-ups)

| à¹€à¸Ÿà¸ª | à¸‚à¸­à¸šà¹€à¸‚à¸• | à¹„à¸”à¹‰à¸­à¸°à¹„à¸£ | à¹à¸•à¸° prompt à¹„à¸«à¸¡ |
| --- | --- | --- | --- |
| **L0 â€” Failure write-only** | Verify Gate fail â†’ `addNode(failure)` + edge (G2) | à¹€à¸£à¸´à¹ˆà¸¡à¸ªà¸°à¸ªà¸¡à¸„à¸§à¸²à¸¡à¸ˆà¸³à¸„à¸§à¸²à¸¡à¸œà¸´à¸” | âŒ à¹„à¸¡à¹ˆà¹à¸•à¸° (à¸›à¸¥à¸­à¸”à¸ à¸±à¸¢à¸ªà¸¸à¸”) |
| **L1 â€” Failure retrieval** | à¸à¹ˆà¸­à¸™ dispatch â†’ `hybridSearch` â†’ inject "âŒ past mistakes" (G3) | **à¸à¸±à¸™à¸œà¸´à¸”à¸‹à¹‰à¸³** (à¸„à¸¸à¸“à¸„à¹ˆà¸²à¸«à¸¥à¸±à¸) | âœ… à¹€à¸žà¸´à¹ˆà¸¡ block à¹€à¸”à¸µà¸¢à¸§ |
| **L2 â€” Context grounding** | `retrieveContext(tier,budget)` à¹à¸—à¸™ manual `scope.docs` (G1) | context à¸„à¸¡, à¸à¸±à¸™ overflow | âœ… à¹à¸—à¸™ section |
| **L3 â€” Verified exemplar** | `hybridSearch` passed task â†’ few-shot (G3) | à¸à¸±à¸™ blank-page/hallucinate | âœ… optional block |

à¸¥à¸³à¸”à¸±à¸šà¸™à¸µà¹‰à¹€à¸­à¸² **L0 (à¹€à¸à¹‡à¸š à¹„à¸¡à¹ˆà¹€à¸ªà¸µà¹ˆà¸¢à¸‡) â†’ L1 (à¸à¸±à¸™à¸œà¸´à¸”à¸‹à¹‰à¸³ à¸œà¸¥à¸•à¸£à¸‡à¹€à¸›à¹‰à¸²à¸ªà¸¸à¸”)** à¸à¹ˆà¸­à¸™. L2/L3 à¹€à¸žà¸´à¹ˆà¸¡à¸„à¸§à¸²à¸¡à¸„à¸¡à¹€à¸¡à¸·à¹ˆà¸­à¸žà¸´à¸ªà¸¹à¸ˆà¸™à¹Œ L1 à¹à¸¥à¹‰à¸§.

---

## 9. à¸‚à¸­à¸‡à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸•à¸±à¸”à¸ªà¸´à¸™à¸à¹ˆà¸­à¸™à¹€à¸£à¸´à¹ˆà¸¡ L0

- **à¹à¸«à¸¥à¹ˆà¸‡ embedding:** `bge-m3` à¸œà¹ˆà¸²à¸™ Ollama local (à¹à¸™à¸°à¸™à¸³) à¸«à¸£à¸·à¸­à¹à¸«à¸¥à¹ˆà¸‡à¸­à¸·à¹ˆà¸™ â€” à¸•à¹‰à¸­à¸‡à¸¡à¸µà¸à¹ˆà¸­à¸™ L1
- **à¸™à¸´à¸¢à¸²à¸¡ "à¸„à¸¥à¹‰à¸²à¸¢":** `hybridSearch` `k` + `alpha` (à¸ªà¸±à¸”à¸ªà¹ˆà¸§à¸™ vectorâ†”lexical) à¹€à¸£à¸´à¹ˆà¸¡à¸—à¸µà¹ˆà¹€à¸—à¹ˆà¸²à¹„à¸£ (à¹€à¸ªà¸™à¸­ k=3, alpha=0.5)
- **threshold inject:** similarity à¸•à¹ˆà¸³à¸à¸§à¹ˆà¸²à¹€à¸—à¹ˆà¸²à¹„à¸£à¹„à¸¡à¹ˆ inject (à¸à¸±à¸™ noise) â€” à¹€à¸ªà¸™à¸­à¹€à¸£à¸´à¹ˆà¸¡ 0.6

