# RWANG — Production Roadmap

Gap analysis and TODO for reaching production-grade parity with CrewAI, LangGraph,
AutoGen, and Semantic Kernel.

> Legend: `[x]` = RWANG has it, `[ ]` = missing, `[~]` = partial/spec-only

---

## Current state vs competition

| Capability | CrewAI | LangGraph | RWANG |
|---|---|---|---|
| DAG orchestration | Limited | Graph + cycles | DAG only (acyclic) |
| Sequential / parallel | Yes | Yes | Yes (waves) |
| Hierarchical delegation | Yes (manager) | Yes (supervisor) | No |
| Swarm / dynamic routing | Yes (mesh) | Yes (handoff) | No |
| Multi-provider | Yes | Yes | Yes |
| Agent memory | Yes (STM/LTM/entity) | Yes (checkpointer) | No |
| Structured output | Yes (Pydantic) | Yes (schema) | No |
| Tool registry | Yes (60+ tools) | Yes (LangChain) | Implicit only |
| Inter-agent comms | Yes (delegation) | Yes (message passing) | Spec only (ADR-O-006) |
| Human-in-the-loop | Yes | Yes (interrupt) | Governance gates only |
| Checkpointing | No | Yes (SQLite/Postgres) | No |
| Streaming | Yes (callbacks) | Yes (token-level) | Log-level only |
| Observability | Basic (logs) | LangSmith/OTEL | Logs only |
| SDK (programmatic) | Python SDK | Python SDK | CLI + HTTP only |
| Deployment | Docker/cloud | LangGraph Platform | Desktop only |
| Auth / RBAC | No | Yes (Platform) | No |
| Testing framework | No | Yes (evaluators) | Unit tests only |
| Governance model | No | No | Yes (DACI + borrow checker) |
| Cost controls | No | No | Yes (session/weekly caps) |
| Permission sandboxing | No | No | Yes (safe/full modes) |

**RWANG's unique advantages**: DACI governance, borrow checker, cost controls,
permission sandboxing, atom-based knowledge graph (GKS). These don't exist in
any competitor — they're the moat.

---

## Phase 1 — Foundation (make the engine robust)

Must-have before anyone can use RWANG in production.

### P1.1 — Retry & fault tolerance
- [ ] Configurable retry policy per task type (`maxRetries`, `backoffMs`, `backoffMultiplier`)
- [ ] Exponential backoff with jitter on agent failures
- [ ] Distinguish transient errors (timeout, rate-limit, OOM) from permanent (bad prompt, auth)
- [ ] Circuit breaker per provider (disable after N consecutive failures, auto-heal)
- [ ] Dead-letter queue for permanently failed tasks (with failure reason + last log)
- [ ] `engine.mjs`: add `retryPolicy` to task schema, `retryCount` to state

### P1.2 — Checkpointing & resume
- [ ] Checkpoint state to disk after every state transition (claim/running/done/fail)
- [ ] Run-level checkpoint: `runs/<runId>/checkpoint.json` with full DAG state
- [ ] Resume from checkpoint: `node orchestrator.mjs resume <runId>`
- [ ] Agent-level checkpoint: capture last-known offset in agent log for partial recovery
- [ ] Graceful shutdown: on SIGINT/SIGTERM, wait for running agents to finish (configurable timeout)

### P1.3 — Event system
- [ ] `EventBus` class: typed events (`task.claimed`, `task.started`, `task.done`, `task.failed`, `run.started`, `run.completed`, `agent.output`, `cost.warning`, `cost.exceeded`)
- [ ] In-process listeners (for UI, metrics, webhooks)
- [ ] Server-Sent Events (SSE) endpoint: `GET /api/events` — replace polling with push
- [ ] Webhook support: `config.webhooks: [{ url, events, secret }]` with HMAC signing
- [ ] Replace Studio polling with SSE subscription

### P1.4 — Auth & API hardening
- [ ] API key auth for HTTP endpoints (`X-RWANG-Key` header)
- [ ] Generate/rotate keys via CLI: `node orchestrator.mjs apikey generate`
- [ ] Rate limiting on `/api/cmd` (configurable per-key)
- [ ] CORS configuration in `config.json`
- [ ] Input validation on all POST endpoints (reject unknown actions, validate IDs)

### P1.5 — Structured output
- [ ] Task schema definition: `task.outputSchema` (JSON Schema)
- [ ] Post-agent output validation: parse agent result against schema
- [ ] Auto-retry on schema mismatch (up to `maxRetries`)
- [ ] Typed artifacts: `{ type: "code" | "document" | "config" | "test" | "analysis", path, schema }`
- [ ] Artifact registry: `GET /api/artifacts?taskId=X`

---

## Phase 2 — Agent intelligence (make agents smarter)

### P2.1 — Agent memory system
- [ ] **Short-term memory (STM)**: per-run scratchpad shared across tasks in the same run
  - File-based: `runs/<runId>/memory.json`
  - Injected into agent prompt as `## Context from previous tasks`
- [ ] **Long-term memory (LTM)**: cross-run knowledge that persists
  - Store: `store/memory.mjs` with file adapter (JSON) and future DB adapter
  - Auto-extract: after task completion, extract key facts/decisions/patterns
  - Retrieval: semantic search or keyword match, injected by relevance score
- [ ] **Entity memory**: per-entity (file, module, API) accumulated knowledge
  - Track which agents touched which files, what they learned, what failed
  - Surface in prompt: "Previous agent noted: X about this file"
- [ ] Memory configuration in `config.json`: enable/disable per type, max tokens, decay

### P2.2 — Tool registry
- [ ] `tools/` directory with tool definitions (JSON Schema + executor)
- [ ] Built-in tools: `read_file`, `write_file`, `run_command`, `search_code`, `http_request`, `ask_human`
- [ ] Tool declaration in atom: `task.tools: ["search_code", "http_request"]`
- [ ] Tool injection in prompt: generate tool-use blocks for the provider
- [ ] Custom tool loading: drop a `.tool.mjs` in `tools/` → auto-registered
- [ ] Tool result validation against output schema
- [ ] MCP tool bridge: expose RWANG tools as MCP server, consume external MCP tools

### P2.3 — Inter-agent communication (A2A)
- [ ] Implement ADR-O-006 (topology: core-faces-A2A)
- [ ] Message passing: agent can `DELEGATE(taskId, prompt)` to spawn a subtask
- [ ] Shared scratchpad: agents in the same wave can read/write a shared context
- [ ] Escalation protocol: `BLOCKED(reason)` → engine intercepts, re-routes or escalates
- [ ] Result forwarding: completed task output auto-injected into dependent task prompt
- [ ] Agent-to-agent channels: pub/sub topics scoped to a run

### P2.4 — Dynamic graph operations
- [ ] Runtime task insertion: `POST /api/cmd { action: "addTask", task: {...} }`
- [ ] Runtime dependency modification: add/remove edges while run is in progress
- [ ] Conditional edges: `{ from, to, condition: "output.score > 0.8" }`
- [ ] Loop/cycle support: `{ from, to, maxIterations: 3, until: "output.converged" }`
- [ ] Subgraph expansion: a task can expand into a sub-DAG at runtime (planner output)
- [ ] Graph versioning: snapshot graph state at each mutation for audit trail

---

## Phase 3 — Observability (make it debuggable)

### P3.1 — Tracing (OpenTelemetry)
- [ ] OTEL SDK integration: spans for dispatch, agent execution, provider calls
- [ ] Trace hierarchy: `run → wave → task → agent → provider call`
- [ ] Span attributes: `task.id`, `task.type`, `provider`, `model`, `cost`, `tokens`, `exitCode`
- [ ] Trace export: OTLP (Jaeger, Tempo, Datadog) configurable in `config.json`
- [ ] Correlation ID propagated from run → all child spans

### P3.2 — Metrics
- [ ] Prometheus-compatible `/metrics` endpoint
- [ ] Key metrics:
  - `rwang_tasks_total{status,type,model}` — task counts by status
  - `rwang_agent_duration_seconds{provider,model}` — agent execution time histogram
  - `rwang_agent_cost_usd{provider,model}` — cost per agent
  - `rwang_tokens_total{direction,provider}` — input/output token counts
  - `rwang_active_agents` — current running agent gauge
  - `rwang_retry_total{reason}` — retry counts
  - `rwang_queue_depth` — tasks waiting for dispatch
- [ ] Cost dashboard data: `GET /api/metrics/cost?window=7d`

### P3.3 — Agent replay / time travel
- [ ] Record full agent session: prompt + all tool calls + responses + timing
- [ ] Replay viewer in Studio: step through agent's actions
- [ ] "What if" mode: modify prompt, re-run from checkpoint, compare results
- [ ] Diff view: compare two agent runs on the same task

### P3.4 — Studio observability tab
- [ ] Trace waterfall view (like Jaeger UI)
- [ ] Cost burn-down chart (session + weekly)
- [ ] Agent performance heatmap (success rate × model × task type)
- [ ] Error log aggregation with classification

---

## Phase 4 — Developer experience (make it easy to adopt)

### P4.1 — JavaScript/TypeScript SDK
```javascript
import { RWANG } from 'rwang'

const engine = new RWANG({ configPath: './config.json' })

// Define tasks programmatically
engine.addTask({ id: 'build-api', type: 'code', deps: ['design-api'] })

// Listen to events
engine.on('task.done', (task) => console.log(`${task.id} completed`))

// Dispatch
const run = await engine.dispatch({ maxConcurrency: 3 })
await run.waitForCompletion()
```
- [ ] Extract engine core into importable module (`rwang` npm package)
- [ ] TypeScript type definitions for all public APIs
- [ ] Event emitter interface (`.on()`, `.off()`, `.once()`)
- [ ] Builder pattern for task/graph construction
- [ ] Async iterator for streaming results: `for await (const event of run) { ... }`

### P4.2 — CLI improvements
- [ ] `rwang init` — scaffold a new project with config + sample backlog
- [ ] `rwang add <task>` — interactively add a task (prompts for type, deps, accept)
- [ ] `rwang doctor` — diagnose setup (Node version, providers, auth, connectivity)
- [ ] `rwang import <file>` — import tasks from markdown, YAML, or JSON
- [ ] `rwang export` — export graph as mermaid, DOT, or JSON
- [ ] `rwang logs <taskId> --follow` — tail agent log in real-time
- [ ] `rwang cost` — show cost summary (session, weekly, per-model)
- [ ] `rwang replay <taskId>` — replay agent session in terminal
- [ ] Progress bar with ETA during `rwang run --execute`

### P4.3 — Testing framework
- [ ] `rwang test` command: run backlog in dry-run mode with mock providers
- [ ] Mock provider: deterministic responses for testing graph logic
- [ ] Snapshot testing: compare agent outputs against golden files
- [ ] Acceptance testing: auto-verify task output against `task.accept` criteria
- [ ] CI integration: `rwang test --ci` exits with code 0/1
- [ ] Coverage: which atoms have been dispatched/verified vs untouched

### P4.4 — Documentation
- [ ] API reference (auto-generated from JSDoc/TSDoc)
- [ ] Tutorials: "Your first RWANG project" (5 min), "Custom provider" (10 min), "Governance setup" (15 min)
- [ ] Cookbook: common patterns (code review pipeline, doc generation, test suite, migration)
- [ ] Video walkthroughs for Studio UI
- [ ] Architecture decision log (ADRs are already started — continue pattern)

---

## Phase 5 — Orchestration patterns (match CrewAI/LangGraph expressiveness)

### P5.1 — Sequential pipeline
- [ ] `pipeline` mode: tasks execute strictly in order, output chains
- [ ] Pipeline definition: `{ mode: "pipeline", steps: ["a", "b", "c"] }`
- [ ] Output forwarding: step N's output → step N+1's input (auto-injected)
- [ ] Pipeline templates: reusable named pipelines in config

### P5.2 — Hierarchical delegation
- [ ] Manager agent: receives high-level goal, decomposes into subtasks
- [ ] `{ mode: "hierarchical", manager: "ARCHON", workers: [...] }`
- [ ] Manager can re-plan mid-run based on worker results
- [ ] Configurable delegation depth (default: 2 levels)

### P5.3 — Swarm / dynamic routing
- [ ] Swarm mode: agents self-select tasks based on capability matching
- [ ] Handoff protocol: agent A transfers context + control to agent B
- [ ] `{ mode: "swarm", agents: [...], router: "capability" | "round-robin" | "cost-optimal" }`
- [ ] Dynamic agent pool: scale agent count based on queue depth

### P5.4 — Consensus / debate
- [ ] Multi-agent review: N agents independently evaluate, vote, synthesize
- [ ] `{ mode: "consensus", agents: 3, threshold: 0.66 }`
- [ ] Debate mode: agents argue for/against, judge agent decides
- [ ] Useful for: code review, architecture decisions, risk assessment

### P5.5 — Map-reduce
- [ ] Split a large task into N parallel subtasks, then merge results
- [ ] `{ mode: "map-reduce", mapper: "split-by-file", reducer: "merge-results" }`
- [ ] Built-in splitters: by-file, by-function, by-module, by-test
- [ ] Custom reducer function

---

## Phase 6 — Deployment & scale (make it production-ready)

### P6.1 — Containerization
- [ ] `Dockerfile` for engine + Studio
- [ ] `docker-compose.yml`: engine + Studio + optional Ollama + optional Postgres
- [ ] Multi-stage build: small production image
- [ ] Health check endpoint: `GET /health`
- [ ] Environment variable config overlay (12-factor app)

### P6.2 — Persistent storage backend
- [ ] SQLite adapter (replace `state.json` for concurrent access)
- [ ] PostgreSQL adapter (for multi-instance deployment)
- [ ] Redis adapter (for distributed locking, replacing file lock)
- [ ] Migration system for schema changes
- [ ] GenesisBlockDB adapter (already started in `store/genesis-sidecar.mjs`)

### P6.3 — Multi-tenant
- [ ] Project isolation: each project gets its own state, config, and logs
- [ ] User accounts with project membership
- [ ] Per-user API keys with project-scoped permissions
- [ ] Usage metering per tenant
- [ ] Rate limiting per tenant

### P6.4 — Cloud deployment
- [ ] One-click deploy scripts (Railway, Fly.io, Render)
- [ ] Managed cloud service option (future SaaS)
- [ ] Agent execution in sandboxed containers (per-task isolation)
- [ ] Auto-scaling based on queue depth
- [ ] CDN for Studio static assets

---

## Phase 7 — Ecosystem (make it extensible)

### P7.1 — Plugin system
- [ ] Plugin manifest: `{ name, version, provides: ["provider", "tool", "ui-tab"] }`
- [ ] Plugin lifecycle: install, enable, disable, uninstall
- [ ] Plugin hooks: `beforeDispatch`, `afterComplete`, `onFail`, `beforePrompt`
- [ ] Plugin marketplace (GitHub-based initially)
- [ ] First-party plugins: GitHub integration, Slack notifications, Jira sync

### P7.2 — Provider marketplace
- [ ] Community-contributed provider adapters
- [ ] Provider template: `rwang create-provider <name>`
- [ ] Provider certification: automated compatibility tests
- [ ] Provider health dashboard

### P7.3 — Template library
- [ ] Project templates: "Code review pipeline", "Documentation generator", "Test suite builder", "Migration assistant"
- [ ] `rwang init --template code-review`
- [ ] Community-contributed templates
- [ ] Template variables and customization

### P7.4 — Integrations
- [ ] GitHub: auto-create PRs from completed code tasks, sync issues as atoms
- [ ] Slack/Discord: notifications, cost alerts, approval requests
- [ ] Jira/Linear: bidirectional task sync
- [ ] VS Code extension: view RWANG status, dispatch from editor
- [ ] CI/CD: GitHub Actions, GitLab CI recipes

---

## Phase 8 — Safety & guardrails (make it trustworthy)

### P8.1 — Input/output guardrails
- [ ] Pre-dispatch prompt validation: check for prompt injection, sensitive data leakage
- [ ] Post-agent output scanning: PII detection, credential detection
- [ ] Content filtering: configurable blocklist/allowlist for agent outputs
- [ ] Guardrail plugins: custom validation functions

### P8.2 — Audit trail
- [ ] Immutable audit log: every state change, every dispatch, every cost event
- [ ] Audit log format: structured JSON with timestamp, actor, action, before/after state
- [ ] Audit viewer in Studio
- [ ] Export: CSV, JSON, or SIEM integration
- [ ] Compliance: SOC2-ready logging patterns

### P8.3 — Sandboxing
- [ ] Agent filesystem sandbox: restrict agent to project directory only
- [ ] Network sandbox: allowlist of domains agents can access
- [ ] Resource limits: max execution time, max output size, max file changes
- [ ] Rollback: automatic `git stash` before dispatch, rollback on failure

---

## Priority order (recommended)

| Priority | Phase | Rationale |
|---|---|---|
| **P0** | P1.1 Retry | Most common production failure — silent agent death |
| **P0** | P1.2 Checkpoint | Can't lose progress on long runs |
| **P0** | P1.3 Events (SSE) | Replace polling, enable webhooks |
| **P1** | P1.5 Structured output | Agents produce usable artifacts, not just text |
| **P1** | P2.1 Memory (STM) | Agents in the same run share context |
| **P1** | P3.1 Tracing (OTEL) | Debugging blind without traces |
| **P2** | P4.1 SDK | Programmatic access unlocks integrations |
| **P2** | P5.1-5.2 Pipeline + Hierarchical | Match CrewAI/LangGraph orchestration |
| **P2** | P2.2 Tool registry | Agents need more than file edit + shell |
| **P3** | P6.1 Docker | Deployment story required for adoption |
| **P3** | P1.4 Auth | Can't expose API without auth |
| **P3** | P7.1 Plugin system | Extensibility = ecosystem |
| **P4** | P2.3 A2A | Agent-to-agent is advanced use case |
| **P4** | P5.3-5.5 Swarm/Consensus/MapReduce | Advanced patterns |
| **P4** | P6.2-6.4 Scale | Only needed at scale |
| **P5** | P8.x Safety | Important but RWANG's governance already covers basics |

---

## Competitive positioning

**Don't try to clone CrewAI/LangGraph.** RWANG's moat is governance:

1. **DACI governance** — no competitor has role-based authority with borrow checking
2. **Cost controls** — session/weekly caps with auto-downgrade, no competitor does this
3. **Permission sandboxing** — safe/full modes per task type, unique to RWANG
4. **Atom-based knowledge graph** — GKS is a structured alternative to flat task lists
5. **Desktop-first** — Tauri native app vs web-only competitors

The roadmap should strengthen these advantages while closing critical gaps
(retry, checkpoint, memory, structured output) that block production use.

**Target user**: dev teams running 10-100 agent tasks per day on a single machine,
who need governance + cost controls that cloud orchestrators don't provide.
