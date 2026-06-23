# G-Maiden â€” Multi-Agent Orchestrator

à¸£à¸°à¸šà¸š worker pool à¸—à¸µà¹ˆà¹€à¸­à¸² **task backlog (à¸žà¸£à¹‰à¸­à¸¡ dependency)** à¸ˆà¸²à¸ Ultraplan à¸¡à¸²à¹à¸ˆà¸à¸ˆà¹ˆà¸²à¸¢à¹ƒà¸«à¹‰ AI agent
à¸—à¸³à¸‡à¸²à¸™ à¹‚à¸”à¸¢ **route à¸•à¸²à¸¡ model tier** à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´ à¹à¸¥à¸°à¸¡à¸µà¸à¸¥à¹„à¸ **claim/assign + dependency gating + lease**
à¹à¸šà¸šà¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸š distributed task queue.

> à¹„à¸¡à¹ˆà¸¡à¸µ dependency à¸ à¸²à¸¢à¸™à¸­à¸ â€” à¹ƒà¸Šà¹‰ Node built-in à¸¥à¹‰à¸§à¸™ (à¸£à¸±à¸™à¸šà¸™ Windows/macOS/Linux). dispatch à¹„à¸› `claude -p`.

---

## à¹à¸™à¸§à¸„à¸´à¸”à¸«à¸¥à¸±à¸ (à¸”à¸±à¸”à¹à¸›à¸¥à¸‡à¸ˆà¸²à¸ task-queue à¸ˆà¸£à¸´à¸‡)

| à¸à¸¥à¹„à¸ | à¸—à¸³à¸‡à¸²à¸™à¸¢à¸±à¸‡à¹„à¸‡ |
| --- | --- |
| **Dependency gating** | task à¸ˆà¸° "à¸žà¸£à¹‰à¸­à¸¡à¸—à¸³" (ready) à¸à¹‡à¸•à¹ˆà¸­à¹€à¸¡à¸·à¹ˆà¸­ `deps` à¸—à¸¸à¸à¸•à¸±à¸§à¹€à¸›à¹‡à¸™ `done` à¹à¸¥à¹‰à¸§à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™ â€” à¸à¸±à¸™ agent à¸—à¸³à¸‡à¸²à¸™à¸—à¸µà¹ˆà¸‚à¸­à¸‡à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸žà¸£à¹‰à¸­à¸¡ |
| **Claim (atomic)** | worker à¸ˆà¸­à¸‡à¸‡à¸²à¸™à¸œà¹ˆà¸²à¸™ lock file (`.state.lock`) â†’ compare-and-swap à¸šà¸™ `state.json` â†’ à¹„à¸¡à¹ˆà¸¡à¸µ worker à¸ªà¸­à¸‡à¸•à¸±à¸§à¸—à¸³ task à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸™ |
| **Assign** | à¸šà¸±à¸‡à¸„à¸±à¸š model à¹€à¸ˆà¸²à¸°à¸ˆà¸‡à¹ƒà¸«à¹‰ task à¸«à¸™à¸¶à¹ˆà¸‡ (override routing) |
| **Lease / reclaim** | à¸‡à¸²à¸™à¸—à¸µà¹ˆà¸–à¸¹à¸ claim à¹à¸•à¹ˆà¹€à¸‡à¸µà¸¢à¸šà¹€à¸à¸´à¸™ `leaseMs` (worker à¸•à¸²à¸¢) à¸ˆà¸°à¸–à¸¹à¸à¸›à¸¥à¹ˆà¸­à¸¢à¸à¸¥à¸±à¸šà¹€à¸›à¹‡à¸™ `todo` à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´ |
| **Model routing** | map `task.type` â†’ role â†’ model: à¸§à¸²à¸‡à¹à¸œà¸™/architecture/spike = **opus**, coding = **sonnet**, à¸‡à¸²à¸™à¸‡à¹ˆà¸²à¸¢/scaffold/config/docs = **haiku** |
| **Wave planning** | à¸„à¸³à¸™à¸§à¸“ topological levels â†’ à¸šà¸­à¸à¸§à¹ˆà¸² task à¹„à¸«à¸™à¸—à¸³ **à¸„à¸¹à¹ˆà¸‚à¸™à¸²à¸™** à¹„à¸”à¹‰à¹ƒà¸™à¸£à¸­à¸šà¹€à¸”à¸µà¸¢à¸§ |

---

## à¹‚à¸„à¸£à¸‡à¹„à¸Ÿà¸¥à¹Œ

```
orchestration/
â”œâ”€ engine.mjs         à¹à¸à¸™à¸à¸¥à¸²à¸‡ (DAG, claim, lease, routing, executor) â€” à¹ƒà¸Šà¹‰à¸£à¹ˆà¸§à¸¡ CLI+UI
â”œâ”€ orchestrator.mjs   CLI
â”œâ”€ server.mjs         web UI server (Node http à¸¥à¹‰à¸§à¸™)
â”œâ”€ public/index.html  à¸«à¸™à¹‰à¸² UI (glassmorphism à¸˜à¸µà¸¡ G-Maiden)
â”œâ”€ config.json        model routing, concurrency, leaseMs, executor
â”œâ”€ backlog.json       task à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸” (id, type, deps, accept) â€” à¸¡à¸²à¸ˆà¸²à¸ docs/architecture/implementation-plan.md
â”œâ”€ state.json         à¸ªà¸–à¸²à¸™à¸°à¸£à¸±à¸™à¹„à¸—à¸¡à¹Œ (à¸ªà¸£à¹‰à¸²à¸‡à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´)
â”œâ”€ logs/              à¸œà¸¥à¸¥à¸±à¸žà¸˜à¹Œà¸‚à¸­à¸‡à¹à¸•à¹ˆà¸¥à¸° agent (à¸ªà¸£à¹‰à¸²à¸‡à¸•à¸­à¸™ dispatch/execute)
â””â”€ README.md
```

---

## Web UI (monitor + à¸ªà¸±à¹ˆà¸‡à¸‡à¸²à¸™à¸œà¹ˆà¸²à¸™à¹€à¸šà¸£à¸²à¸§à¹Œà¹€à¸‹à¸­à¸£à¹Œ)

```bash
cd orchestration
npm run ui                 # = node server.mjs  -> http://localhost:4577
# à¸«à¸£à¸·à¸­à¹€à¸¥à¸·à¸­à¸à¸žà¸­à¸£à¹Œà¸•:  node server.mjs --port 8080
```

à¹€à¸›à¸´à¸” `http://localhost:4577` à¸ˆà¸°à¹„à¸”à¹‰à¹à¸”à¸Šà¸šà¸­à¸£à¹Œà¸”:
- **Monitor:** progress bar, counts, à¸ªà¸–à¸²à¸™à¸°à¸—à¸¸à¸ task à¹à¸šà¸š live (auto-refresh 1.5s), dependency chips
  (à¹€à¸‚à¸µà¸¢à¸§ = dep à¹€à¸ªà¸£à¹‡à¸ˆà¹à¸¥à¹‰à¸§), badge model (opus/sonnet/haiku), filter à¸•à¸²à¸¡ phase/status/model + à¸„à¹‰à¸™à¸«à¸²
- **à¸ªà¸±à¹ˆà¸‡à¸‡à¸²à¸™:** à¸›à¸¸à¹ˆà¸¡à¸•à¹ˆà¸­ task à¸•à¸²à¸¡à¸ªà¸–à¸²à¸™à¸° â€”
  `claim` Â· **`â–¶ dispatch`** (claim+à¹€à¸£à¸µà¸¢à¸ agent à¸ˆà¸£à¸´à¸‡à¸—à¸±à¸™à¸—à¸µ) Â· `done` Â· `fail` Â· `release/retry` Â·
  à¹€à¸¥à¸·à¸­à¸ `modelâ€¦` (override routing) Â· à¸”à¸¹ `log` à¸‚à¸­à¸‡à¹à¸•à¹ˆà¸¥à¸° agent Â· à¸›à¸¸à¹ˆà¸¡ `reset`
- à¸—à¸¸à¸à¸›à¸¸à¹ˆà¸¡à¹€à¸£à¸µà¸¢à¸ REST API à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸š CLI â†’ state à¸•à¸£à¸‡à¸à¸±à¸™à¸—à¸±à¹‰à¸‡à¸ªà¸­à¸‡à¸—à¸²à¸‡ (à¹€à¸›à¸´à¸” UI à¸à¸±à¸šà¹ƒà¸Šà¹‰ CLI à¸ªà¸¥à¸±à¸šà¸à¸±à¸™à¹„à¸”à¹‰)

> **`â–¶ dispatch` à¹€à¸£à¸µà¸¢à¸ `claude` à¸ˆà¸£à¸´à¸‡** â€” à¸•à¹‰à¸­à¸‡à¸•à¸±à¹‰à¸‡ `executor.extraArgs` à¹ƒà¸™ `config.json` à¹ƒà¸«à¹‰ agent
> à¸¡à¸µà¸ªà¸´à¸—à¸˜à¸´à¹Œà¹à¸à¹‰à¹„à¸Ÿà¸¥à¹Œà¸à¹ˆà¸­à¸™ (à¹€à¸Šà¹ˆà¸™ `["--permission-mode","acceptEdits"]`) à¹„à¸¡à¹ˆà¸‡à¸±à¹‰à¸™ headless à¸ˆà¸°à¸„à¹‰à¸²à¸‡à¸£à¸­ permission.

### REST API (à¹ƒà¸Šà¹‰à¸•à¹ˆà¸­à¸¢à¸­à¸”/automation à¹„à¸”à¹‰)
```
GET  /api/state            -> snapshot à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸” (progress, counts, tasks[])
GET  /api/log?id=G0.1      -> log à¸¥à¹ˆà¸²à¸ªà¸¸à¸”à¸‚à¸­à¸‡ task
POST /api/cmd  {action,id,worker,model}
       action: claim | done | fail | release | assign | dispatch | reset
```

---

## à¸à¸²à¸£ route model (à¹à¸à¹‰à¹„à¸”à¹‰à¹ƒà¸™ `config.json`)

```
type: spike / plan / architecture / design / process   ->  architect  ->  opus
type: code / impl / integration / test                 ->  coder      ->  sonnet
type: scaffold / config / docs                         ->  worker     ->  haiku
type: manual                                           ->  (à¸—à¸³à¸¡à¸·à¸­ à¹„à¸¡à¹ˆ dispatch)
```

à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡à¸œà¸¥à¸¥à¸±à¸žà¸˜à¹Œà¸ˆà¸£à¸´à¸‡: `G0.1 scaffold â†’ haiku`, `G1.1 GSI server â†’ sonnet`,
`G3.2 G-Motion prediction â†’ opus`, `G5.2 advice engine â†’ opus`.

---

## à¸„à¸³à¸ªà¸±à¹ˆà¸‡

```bash
node orchestrator.mjs status              # à¸ à¸²à¸žà¸£à¸§à¸¡ + progress bar + à¸ªà¸–à¸²à¸™à¸°à¸—à¸¸à¸ task
node orchestrator.mjs next                # task à¸—à¸µà¹ˆà¸žà¸£à¹‰à¸­à¸¡à¸—à¸³à¸•à¸­à¸™à¸™à¸µà¹‰ + model + acceptance
node orchestrator.mjs graph               # DAG à¹€à¸›à¹‡à¸™ waves (à¸­à¸°à¹„à¸£à¸—à¸³à¸„à¸¹à¹ˆà¸‚à¸™à¸²à¸™à¹„à¸”à¹‰)
node orchestrator.mjs graph --mermaid     # DAG à¹€à¸›à¹‡à¸™ mermaid (à¹€à¸­à¸²à¹„à¸›à¸§à¸²à¸”)

node orchestrator.mjs claim <id> -w alice # à¸ˆà¸­à¸‡à¸‡à¸²à¸™ (atomic, à¹€à¸„à¸²à¸£à¸ž dependency)
node orchestrator.mjs done <id>           # à¸—à¸³à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸«à¸¡à¸²à¸¢à¹€à¸ªà¸£à¹‡à¸ˆ -> à¸›à¸¥à¸”à¸¥à¹‡à¸­à¸ task à¸—à¸µà¹ˆà¸£à¸­
node orchestrator.mjs fail <id>           # à¸¥à¹‰à¸¡à¹€à¸«à¸¥à¸§
node orchestrator.mjs release <id>        # à¸„à¸·à¸™à¸‡à¸²à¸™à¸à¸¥à¸±à¸š todo
node orchestrator.mjs assign <id> opus    # à¸šà¸±à¸‡à¸„à¸±à¸š model à¹€à¸ˆà¸²à¸°à¸ˆà¸‡

node orchestrator.mjs run                 # DRY-RUN: à¸§à¸²à¸‡à¹à¸œà¸™ waves + à¸à¸²à¸£ route (à¹„à¸¡à¹ˆà¹€à¸£à¸µà¸¢à¸ agent)
node orchestrator.mjs run --execute       # à¸‚à¸­à¸‡à¸ˆà¸£à¸´à¸‡: worker pool à¹€à¸£à¸µà¸¢à¸ claude -p à¸•à¸²à¸¡ concurrency
node orchestrator.mjs run --execute --max 4
node orchestrator.mjs reset               # à¸¥à¹‰à¸²à¸‡ state à¸à¸¥à¸±à¸š todo à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”
```

---

## Context scoping + small-model discipline (POLA)

à¸­à¸´à¸‡ `docs/research/concepts/subagent-context-scoping.md` + `docs/guides/small-model-prompting.md`:

- **Parent à¸›à¸£à¸°à¸à¸²à¸¨ scope à¸•à¹ˆà¸­ task** (subagent à¹„à¸¡à¹ˆà¸•à¸±à¹‰à¸‡à¹€à¸­à¸‡). à¸”à¸µà¸Ÿà¸­à¸¥à¸•à¹Œà¸—à¸µà¹ˆ `config.scope.byPhase`, override à¸—à¸µà¹ˆ
  `task.scope` à¹ƒà¸™ backlog: `{ docs, needs, excludes, budgetTokens, scaffold, profile }`.
- **à¹€à¸­à¸à¸ªà¸²à¸£à¸¡à¸µ tier** à¹ƒà¸™ `config.docsForContext`: `shared` (à¹€à¸‚à¹‰à¸² worker à¹„à¸”à¹‰), `worker-guide`,
  à¹à¸¥à¸° **`orchestrator-only`** (à¹€à¸Šà¹ˆà¸™ CONCEPT doc, `leak_risk:high`) â€” **à¸–à¸¹à¸à¸à¸£à¸­à¸‡à¸­à¸­à¸à¸ˆà¸²à¸ prompt à¸‚à¸­à¸‡ worker à¸—à¸¸à¸à¸•à¸±à¸§à¹€à¸ªà¸¡à¸­**.
- **buildPrompt size-aware:**
  - *claude full-agent* â†’ à¸Šà¸µà¹‰à¹€à¸‰à¸žà¸²à¸° doc paths à¹ƒà¸™ scope à¹ƒà¸«à¹‰à¹„à¸›à¸­à¹ˆà¸²à¸™à¹€à¸­à¸‡ + à¸ªà¸±à¹ˆà¸‡ escalate à¸”à¹‰à¸§à¸¢ `BLOCKED:` à¸–à¹‰à¸²à¸šà¸£à¸´à¸šà¸—à¹„à¸¡à¹ˆà¸žà¸­
  - *ollama (à¹‚à¸¡à¹€à¸”à¸¥à¹€à¸¥à¹‡à¸)* â†’ à¹„à¸¡à¹ˆ inline à¹„à¸Ÿà¸¥à¹Œà¹€à¸­à¸à¸ªà¸²à¸£, à¹ƒà¸Šà¹‰ micro-task + scaffold-first + anti-loop + strict-output (à¸¢à¹ˆà¸­à¸ˆà¸²à¸ GUIDE)
- **Escalation à¹„à¸¡à¹ˆà¹€à¸‡à¸µà¸¢à¸š:** à¸–à¹‰à¸² agent à¸•à¸­à¸š `BLOCKED: â€¦` orchestrator à¸ˆà¸±à¸šà¹„à¸”à¹‰ â†’ mark task à¹€à¸›à¹‡à¸™ `failed` + à¹€à¸‚à¸µà¸¢à¸™
  `âš  ESCALATION` à¹ƒà¸™ log (surface à¹ƒà¸«à¹‰à¹€à¸«à¹‡à¸™ à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ degrade à¹€à¸‡à¸µà¸¢à¸š à¹†). *(round-trip escalate() à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´ = à¸‡à¸²à¸™à¹€à¸Ÿà¸ªà¸–à¸±à¸”à¹„à¸›)*
- **Ollama profiles** (`config.ollama.profiles`): `fast` / `balanced` / `ui-heavy` à¸„à¸¸à¸¡ temperature/num_predict
  à¸•à¹ˆà¸­ task à¸œà¹ˆà¸²à¸™ `scope.profile`.

---

## Providers, Auth & Usage

### à¹€à¸¥à¸·à¸­à¸à¹à¸«à¸¥à¹ˆà¸‡ compute à¹„à¸”à¹‰ 3 à¸—à¸²à¸‡
| Provider | à¸•à¸±à¹‰à¸‡à¸„à¹ˆà¸² model à¹€à¸›à¹‡à¸™ | à¸šà¸´à¸¥ / à¹‚à¸„à¸§à¸•à¹‰à¸² | à¸—à¸³à¸­à¸°à¹„à¸£à¹„à¸”à¹‰ |
| --- | --- | --- | --- |
| **Claude (Plan)** | `opus`/`sonnet`/`haiku` + auth=`plan` | à¹‚à¸„à¸§à¸•à¹‰à¸² subscription | full agent (à¹à¸à¹‰à¹„à¸Ÿà¸¥à¹Œ/à¸£à¸±à¸™à¸„à¸³à¸ªà¸±à¹ˆà¸‡) |
| **Claude (API key)** | à¹€à¸«à¸¡à¸·à¸­à¸™à¸à¸±à¸™ + auth=`apikey` | à¸ˆà¹ˆà¸²à¸¢à¸•à¸²à¸¡ API token | full agent |
| **Ollama (local)** | `ollama:<name>` à¹€à¸Šà¹ˆà¸™ `ollama:qwen2.5-coder:7b` | **à¸Ÿà¸£à¸µ / $0** à¹„à¸¡à¹ˆà¸à¸´à¸™à¹‚à¸„à¸§à¸•à¹‰à¸² | gen à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡/à¸£à¹ˆà¸²à¸‡/à¹à¸œà¸™ (à¹à¸à¹‰à¹„à¸Ÿà¸¥à¹Œà¹€à¸­à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰) |

**à¸ªà¸¥à¸±à¸š auth (Plan â†” API key)** â€” à¸›à¸¸à¹ˆà¸¡ `ðŸ’³ Plan / ðŸ”‘ API key` à¸šà¸™à¹à¸–à¸š auth à¹ƒà¸™ UI (à¸«à¸£à¸·à¸­ `config.auth.mode`).
à¸à¸¥à¹„à¸: à¸•à¸­à¸™ spawn agent à¸ˆà¸°à¸›à¸£à¸±à¸š `ANTHROPIC_API_KEY` à¹ƒà¸™ env à¸‚à¸­à¸‡ child process â€” `plan` à¸¥à¸šà¸­à¸­à¸, `apikey` à¹ƒà¸ªà¹ˆà¹€à¸‚à¹‰à¸².
à¸›à¸¸à¹ˆà¸¡ API key à¸ˆà¸°à¹ƒà¸Šà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸–à¹‰à¸²à¹„à¸¡à¹ˆà¸žà¸š key à¹ƒà¸™ env.

**Ollama** â€” à¸•à¸±à¹‰à¸‡ `config.ollama.host` (à¸”à¸µà¸Ÿà¸­à¸¥à¸•à¹Œ `http://127.0.0.1:11434`). à¸•à¹‰à¸­à¸‡à¸¡à¸µ `ollama serve` à¸£à¸±à¸™à¸­à¸¢à¸¹à¹ˆ +
`ollama pull <model>` à¸à¹ˆà¸­à¸™. route à¹„à¸”à¹‰ 2 à¸—à¸²à¸‡: à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™ `config.routing` (à¹€à¸Šà¹ˆà¸™ `"worker": "ollama:llama3.2"`)
à¸«à¸£à¸·à¸­ `assign` à¸•à¹ˆà¸­ task à¸ˆà¸²à¸ dropdown à¹ƒà¸™ UI (à¸à¸¥à¸¸à¹ˆà¸¡ ðŸ¦™ ollama). à¹€à¸­à¸²à¸•à¹Œà¸žà¸¸à¸•à¸ªà¸•à¸£à¸µà¸¡à¹€à¸‚à¹‰à¸² Agent Room à¹€à¸«à¸¡à¸·à¸­à¸™ claude.
UI à¹‚à¸Šà¸§à¹Œà¸ªà¸–à¸²à¸™à¸° ðŸ¦™ ollama up/down + à¸ˆà¸³à¸™à¸§à¸™ model.

> Ollama à¹€à¸›à¹‡à¸™à¸à¸²à¸£ gen à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸¥à¹‰à¸§à¸™ â€” à¹€à¸«à¸¡à¸²à¸°à¸à¸±à¸š task à¸›à¸£à¸°à¹€à¸ à¸—à¸§à¸²à¸‡à¹à¸œà¸™/à¸£à¹ˆà¸²à¸‡/à¸§à¸´à¹€à¸„à¸£à¸²à¸°à¸«à¹Œ à¸«à¸£à¸·à¸­à¸—à¸³à¸­à¸­à¸Ÿà¹„à¸¥à¸™à¹Œ/à¸›à¸£à¸°à¸«à¸¢à¸±à¸”à¹‚à¸„à¸§à¸•à¹‰à¸².
> à¸œà¸¥à¸—à¸µà¹ˆà¹„à¸”à¹‰à¸„à¸·à¸­à¹‚à¸„à¹‰à¸”/à¹à¸œà¸™à¹ƒà¸™ log à¹ƒà¸«à¹‰à¸„à¸™à¸«à¸£à¸·à¸­ claude agent à¹€à¸­à¸²à¹„à¸›à¹ƒà¸Šà¹‰à¸•à¹ˆà¸­ (à¹„à¸¡à¹ˆà¸¥à¸‡à¸¡à¸·à¸­à¹à¸à¹‰ repo à¹€à¸­à¸‡à¹à¸šà¸š claude agent).

### Usage (Current session / Weekly)
à¹à¸–à¸š usage à¹à¸ªà¸”à¸‡ 2 à¸à¸²à¸£à¹Œà¸” â€” **Current session (â‰¤5h)** à¹à¸¥à¸° **Weekly (â‰¤7d)** â€” à¸ªà¸£à¸¸à¸›à¸ˆà¸²à¸ `usage.jsonl`
à¸—à¸µà¹ˆà¸šà¸±à¸™à¸—à¸¶à¸ token + cost à¸‚à¸­à¸‡à¸—à¸¸à¸ agent (claude à¸¡à¸µ $cost à¸ˆà¸£à¸´à¸‡à¸ˆà¸²à¸ result event; ollama = $0):
- cost à¸£à¸§à¸¡, à¸ˆà¸³à¸™à¸§à¸™ agents, token in/out/cache, à¹à¸¢à¸à¸•à¸²à¸¡ model
- à¸•à¸±à¹‰à¸‡ `config.usageLimits.sessionUsd` / `weeklyUsd` â†’ à¸à¸²à¸£à¹Œà¸”à¹‚à¸Šà¸§à¹Œà¹à¸–à¸š % + à¹€à¸•à¸·à¸­à¸™à¹€à¸¡à¸·à¹ˆà¸­à¹ƒà¸à¸¥à¹‰ (â‰¥80%) / à¹€à¸à¸´à¸™à¸‡à¸š

> âš ï¸ à¸•à¸±à¸§à¹€à¸¥à¸‚à¸™à¸µà¹‰à¸™à¸±à¸š **à¹€à¸‰à¸žà¸²à¸°à¸—à¸µà¹ˆ agent à¸‚à¸­à¸‡ orchestrator à¹ƒà¸Šà¹‰** â€” à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ % à¸„à¸‡à¹€à¸«à¸¥à¸·à¸­à¸—à¸²à¸‡à¸à¸²à¸£à¸‚à¸­à¸‡ Max plan
> (`claude` CLI à¹„à¸¡à¹ˆà¹€à¸›à¸´à¸” API à¹ƒà¸«à¹‰à¸”à¸¶à¸‡ limit à¸ˆà¸£à¸´à¸‡à¹à¸šà¸š headless; à¸”à¸¹à¹€à¸žà¸”à¸²à¸™à¸ˆà¸£à¸´à¸‡à¸—à¸µà¹ˆ `/usage` à¹ƒà¸™ Claude Code).
> à¸«à¸™à¹‰à¸²à¸•à¹ˆà¸²à¸‡ 5h/7d à¸­à¸´à¸‡à¸£à¸­à¸š rate-limit à¸‚à¸­à¸‡ Max plan à¹€à¸žà¸·à¹ˆà¸­à¹ƒà¸«à¹‰à¹€à¸—à¸µà¸¢à¸šà¹€à¸„à¸µà¸¢à¸‡à¹„à¸”à¹‰.

---

## à¸§à¸´à¸˜à¸µà¹ƒà¸Šà¹‰à¸ˆà¸£à¸´à¸‡

### à¹‚à¸«à¸¡à¸” 1 â€” à¸§à¸²à¸‡à¹à¸œà¸™ / à¸¡à¸­à¸šà¸«à¸¡à¸²à¸¢à¹€à¸­à¸‡ (à¹à¸™à¸°à¸™à¸³à¸Šà¹ˆà¸§à¸‡à¹à¸£à¸)
```bash
node orchestrator.mjs next            # à¸”à¸¹à¸§à¹ˆà¸²à¸­à¸°à¹„à¸£à¸—à¸³à¹„à¸”à¹‰
node orchestrator.mjs claim S-1 -w you
# ... à¸—à¸³à¸‡à¸²à¸™ (à¸«à¸£à¸·à¸­à¹€à¸›à¸´à¸” Claude Code à¸­à¸µà¸à¸«à¸™à¹‰à¸²à¸•à¹ˆà¸²à¸‡à¸—à¸³ task à¸™à¸±à¹‰à¸™) ...
node orchestrator.mjs done S-1        # à¸›à¸¥à¸”à¸¥à¹‡à¸­à¸ task à¸–à¸±à¸”à¹„à¸›à¹ƒà¸™ DAG
```

### à¹‚à¸«à¸¡à¸” 2 â€” worker pool à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´ (agent à¸—à¸³à¹€à¸­à¸‡)
1. à¹€à¸›à¸´à¸”à¸ªà¸´à¸—à¸˜à¸´à¹Œà¹ƒà¸«à¹‰ agent à¹à¸à¹‰à¹„à¸Ÿà¸¥à¹Œà¹„à¸”à¹‰ â€” à¹à¸à¹‰ `config.json`:
   ```json
   "executor": { "extraArgs": ["--permission-mode", "acceptEdits"] }
   ```
   *(à¸„à¹ˆà¸²à¹€à¸£à¸´à¹ˆà¸¡à¸•à¹‰à¸™à¸›à¸¥à¹ˆà¸­à¸¢à¸§à¹ˆà¸²à¸‡à¹€à¸žà¸·à¹ˆà¸­à¸„à¸§à¸²à¸¡à¸›à¸¥à¸­à¸”à¸ à¸±à¸¢ â€” agent à¸ˆà¸°à¸–à¸²à¸¡à¸ªà¸´à¸—à¸˜à¸´à¹Œ à¸—à¸³à¹ƒà¸«à¹‰ headless à¸„à¹‰à¸²à¸‡)*
2. à¸£à¸±à¸™:
   ```bash
   node orchestrator.mjs run --execute --max 3
   ```
   orchestrator à¸ˆà¸°à¸§à¸™: claim à¸‡à¸²à¸™à¸—à¸µà¹ˆ ready â†’ dispatch à¹„à¸› `claude -p --model <tier>` â†’
   mark done/failed â†’ à¸›à¸¥à¸”à¸¥à¹‡à¸­à¸ task à¸–à¸±à¸”à¹„à¸› â†’ à¸ˆà¸™à¸à¸§à¹ˆà¸²à¸‡à¸²à¸™à¸«à¸¡à¸”à¸«à¸£à¸·à¸­à¹€à¸«à¸¥à¸·à¸­à¹à¸•à¹ˆ manual/failed.
   à¸œà¸¥à¹à¸•à¹ˆà¸¥à¸° agent à¸­à¸¢à¸¹à¹ˆà¹ƒà¸™ `logs/<id>.<worker>.log`.

> **à¸‚à¹‰à¸­à¸„à¸§à¸£à¸£à¸°à¸§à¸±à¸‡:** worker pool à¹€à¸£à¸µà¸¢à¸ `claude` à¸ˆà¸£à¸´à¸‡à¸«à¸¥à¸²à¸¢à¸•à¸±à¸§à¸žà¸£à¹‰à¸­à¸¡à¸à¸±à¸™ = à¹ƒà¸Šà¹‰à¹‚à¸„à¸§à¸•à¹‰à¸²/à¹‚à¸—à¹€à¸„à¹‡à¸™à¸ˆà¸£à¸´à¸‡.
> à¹€à¸£à¸´à¹ˆà¸¡à¸ˆà¸²à¸ `--max 1` à¸«à¸£à¸·à¸­ DRY-RUN à¸à¹ˆà¸­à¸™à¹€à¸ªà¸¡à¸­. à¸‡à¸²à¸™ `manual` (à¹€à¸Šà¹ˆà¸™ `PRE` toolchain) à¸–à¸¹à¸à¸‚à¹‰à¸²à¸¡ â€” à¸•à¹‰à¸­à¸‡à¸—à¸³à¹€à¸­à¸‡.

---

## à¸›à¸£à¸±à¸šà¹à¸•à¹ˆà¸‡

- **à¹€à¸žà¸´à¹ˆà¸¡ task:** à¹€à¸•à¸´à¸¡à¹ƒà¸™ `backlog.json` (à¸¡à¸µ `id`, `type`, `deps`, `accept`) â€” orchestrator sync à¹ƒà¸«à¹‰à¹€à¸­à¸‡
- **à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™à¸à¸²à¸£ route:** à¹à¸à¹‰ `config.json` â†’ `routing` / `models`
- **à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™ concurrency / lease:** `config.json` â†’ `concurrency`, `leaseMs`
- **executor à¸­à¸·à¹ˆà¸™:** à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™ `executor.command`/`baseArgs` (à¹€à¸Šà¹ˆà¸™à¸Šà¸µà¹‰à¹„à¸› API gateway à¸‚à¸­à¸‡à¸„à¸¸à¸“à¹€à¸­à¸‡)

---

## à¸‚à¹‰à¸­à¸ˆà¸³à¸à¸±à¸”à¸—à¸µà¹ˆà¸£à¸¹à¹‰à¸•à¸±à¸§

- lock à¹€à¸›à¹‡à¸™ single-host (busy-wait à¸šà¸™ lock file) â€” à¹€à¸«à¸¡à¸²à¸°à¸à¸±à¸šà¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¹€à¸”à¸µà¸¢à¸§à¸«à¸¥à¸²à¸¢ worker process.
  à¸–à¹‰à¸²à¸ˆà¸°à¸à¸£à¸°à¸ˆà¸²à¸¢à¸«à¸¥à¸²à¸¢à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸ˆà¸£à¸´à¸‡ à¸•à¹‰à¸­à¸‡à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™ `state.json` à¹€à¸›à¹‡à¸™ DB/Redis à¸—à¸µà¹ˆà¸¡à¸µ atomic CAS.
- agent à¸—à¸µà¹ˆ dispatch à¹„à¸¡à¹ˆà¸£à¸¹à¹‰à¸œà¸¥à¸‚à¸­à¸‡à¸à¸±à¸™à¹à¸¥à¸°à¸à¸±à¸™à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡à¸—à¸³ wave à¹€à¸”à¸µà¸¢à¸§ (independent) â€” DAG à¸ˆà¸¶à¸‡à¸•à¹‰à¸­à¸‡à¸ˆà¸±à¸” deps
  à¹ƒà¸«à¹‰à¸‡à¸²à¸™à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¹€à¸«à¹‡à¸™à¸œà¸¥à¸à¸±à¸™ **à¸­à¸¢à¸¹à¹ˆà¸„à¸™à¸¥à¸° wave**. backlog à¸›à¸±à¸ˆà¸ˆà¸¸à¸šà¸±à¸™à¸ˆà¸±à¸”à¹„à¸§à¹‰à¹à¸¥à¹‰à¸§.
- à¹„à¸¡à¹ˆ verify à¹€à¸­à¸‡à¸§à¹ˆà¸² acceptance à¸œà¹ˆà¸²à¸™à¸ˆà¸£à¸´à¸‡ â€” `done` à¸›à¸±à¸ˆà¸ˆà¸¸à¸šà¸±à¸™ = "à¸—à¸³à¸ˆà¸š" (exit/à¸¡à¸µ output/à¹„à¸¡à¹ˆ BLOCKED)
  à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ "à¸œà¹ˆà¸²à¸™". **à¸à¸³à¸¥à¸±à¸‡à¸ˆà¸°à¹à¸à¹‰à¸”à¹‰à¸§à¸¢ Verify Gate** (reviewer agent à¸­à¸´à¸ªà¸£à¸°à¸•à¸£à¸§à¸ˆ output à¹€à¸—à¸µà¸¢à¸š acceptance
  à¸à¹ˆà¸­à¸™ mark done) â€” à¸”à¸¹ spec + ADR: [`docs/SPEC--VERIFY-GATE.md`](docs/SPEC--VERIFY-GATE.md),
  [`docs/ADR-O-001--verify-gate.md`](docs/ADR-O-001--verify-gate.md) *(à¸ªà¸–à¸²à¸™à¸°: Proposed, à¸¢à¸±à¸‡à¹„à¸¡à¹ˆ implement)*



