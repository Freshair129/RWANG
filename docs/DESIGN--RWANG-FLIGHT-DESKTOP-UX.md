---
version: "0.1.0b"
created_at: "2026-07-09T00:00:00+07:00,ClaudeFable,pending"
last_update: "2026-07-09T00:00:00+07:00,ClaudeFable,pending"
status: "draft"
superseded_by: null
attributes:
  domain: "desktop-ux"
  doc_type: "ux-spec"
  scope: "RWANG desktop app UX/UI"
  language: "en"
---

# RWANG FLIGHT — The Ops Floor
## Final UX/UI Specification

**Design thesis.** RWANG supervises expensive, semi-autonomous machines whose actions can be irreversible, whose claims must be distrusted until instrumented, and whose every decision must be polled and recorded under one person's final authority. Exactly one human institution was built for that problem: mission control. FLIGHT is therefore not a theme laid over a dashboard — it is a structural reading of the governance model. A run is a mission with a mission-elapsed-time clock; the verify gate is the room's founding rule (*telemetry, not testimony*); gates are GO/NO-GO polls; the hash-chained `progress.ndjson` is the flight recorder, publicly SEALED or BREACHED; provider accounts are ground stations that acquire and lose signal; and the human is Flight — nothing launches without a poll, and nothing lands without you. Every cinematic beat in this document is diagnostic information first and cinema second, and every metaphor label carries its plain term as secondary microcopy so the fiction never taxes an operator at 2AM.

---

## 1. Design Principles

1. **Telemetry, not testimony.** No agent claim renders without its instrument reading (exit code, hash, diff stat) beside it; prose without evidence is visually subordinate, always.
2. **The frame cannot express illegal states.** Controls forbidden by autonomy mode, run state, or DACI borrow are not rendered disabled — they do not exist in the DOM. There is no merge button anywhere in the product, ever.
3. **One meaning per color.** Red means abort/anomaly only; every hue has exactly one fixed meaning, enforced as lintable design tokens with CI failure on violation.
4. **Monospace is the voice of the machine.** Mono renders every ID, clock, count, and terminal byte; the grotesk never renders an ID; mono never renders prose.
5. **Motion only when meaning changes.** A lamp blooms once (~200ms) on state transition; nothing idles, pulses ambiently, or loops.
6. **Every ID is a door.** Any identifier visible anywhere is the same chip component resolving through one Trace Drawer — one resolver, no per-surface variants.
7. **The plain term rides every metaphor.** "LOS — cooldown", "AOS — quota reset", "MET — elapsed"; if a metaphor term tests badly, the plain term is promoted to primary.
8. **Staleness is never visible.** Every countdown ticks client-side off absolute epoch timestamps; the 0.9–4s poll cadence must be undetectable in the room.
9. **Approval costs deliberate time.** Consent that mutates state is armed (`S`), then latched (held `Enter`, ~400ms with a visible detent) — never a single click.

---

## 2. Interaction Metaphor — The World Model

| Domain object | In the room it IS | Plain term (always shown secondary) |
|---|---|---|
| Run (`runs/<runId>/`) | A **mission** with mission number and MET clock | run |
| Phase (Route/Execute/Review/Commit) | A **mission phase** | runner phase |
| Wave (topological batch) | A **staged burn sequence** inside Execute | dependency wave |
| Task | A **sortie** on the trajectory wall, flown by expendable vehicles | task |
| Attempt (`attempt_id`) | A **vehicle**, tail-numbered `T-3/2`, spawned–flown–expended | attempt |
| Tier (T0…T3) | **Altitude band** — escalation climbs one band per verify failure | model tier |
| Verify gate (`verify_command`) | The **instrument** — twin readouts, visible + holdout | verify check |
| Gate / approval | A **GO/NO-GO poll** around the room | approval |
| Approval token | A **launch key** — TTL, uses ≤ 20, minted outside agent shells | approval token |
| Stateful agent (ARCHON, LYRA, RKOI…) | A **flight controller at a named console** — callsign, memory drawer, standing orders, gate ownership | lead agent |
| Core Agent | **CAPCOM** — the one console the human talks to; plans, reviews, owns gates; never flies | core agent |
| Stateless worker | A **vehicle** — on the wall, never in the room | worker |
| Provider account | A **ground station** in a tracking network; quota window = visibility pass; cooldown = LOS with AOS countdown; rotation = handover schedule | account |
| Cost cap | The **propellant budget**; kill switch = the guarded **abort handle** | cost cap / kill switch |
| Context brief (`context.md`) | The **mission brief**, versioned, distribution-tracked | shared context |
| Brief Here | A **hold for briefing** — pause until a Brief Packet exists | clarification gate |
| `progress.ndjson` hash chain | The **flight recorder** — SEALED or BREACHED, verified live | audit log |
| Terminal / logs | The **downlink** — raw bytes, never summaries | live logs |
| `awaiting_merge` | **Splashdown** — recovery (merge) belongs to humans, forever | branch ready |

**The two domains.** The room is a lens over two distinct backends, and the spec never pretends they are one. The **runner mission** domain is `specs/*.yaml` → `run.js` → `runs/<runId>/` + `progress.py`: missions, phases, waves, gates, the hash chain — task IDs like `T-3`, state in `tasks.json`/`progress.json`. The **engine board** domain is the `:4577` server: `/api/state` board tasks (G0.1-style), `/api/cmd` verbs (`setdeps`/`assign`/`dispatchOne`…), personas, dispatch, ground stations — state in `backlog.json`. These domains do **not** share task IDs, state files, or lifecycles, and no screen silently converts between them. Lens map: the Floor/Big Board, Flight Recorder, Flight Plan, Anomaly Room, and the Poll Board's phase-gate/human_review/splashdown rows are **runner-mission lenses**; Mission Planning, console cards/personas, dispatch verbs, the Ground Network, and the Poll Board's `confirm` rows are **engine-board lenses**. The **bridge is explicit and one-way**: Mission Planning's EXPORT TO SPEC (§5.3) serializes an engine-board plan into a validated `specs/<x>.yaml`; the Launch Pad (§6h) flies it as a runner mission. Nothing else crosses the seam.

---

## 3. Information Architecture & Navigation

**Window model.** One main Tauri v2 window is the room. Four persistent regions never navigate away; only CENTER STAGE swaps content. The **Big Board** and the **Downlink Bay** each pop out to independent OS windows for dual-monitor floors (same store, second webview).

- **TOP — Status Strip (fixed, 40px):** MET clock + th-TH wall clock · mission status lamp (`progress.json.status`) · autonomy flight-rule badge · propellant gauge — **two meters**: selected-run spend vs its cap and the global session/weekly window (`PROP run $1.84/$5.00 · win $7.10/$25`; local tokens metered alongside) · ground-network mini-strip (`N live / M LOS` from `/api/accounts`) · flight-recorder SEAL lamp (`verifyChain.ok`) · the guarded **ABORT** handle, always visible, never moves. **The strip binds to the selected run** (Mission Rack selection); ground-network and global-window readings are global and labeled so; hovering the run id opens a compact multi-run overview (every ACTIVE run's MET · status lamp · spend). **ABORT scope is explicit:** arming the handle opens a scope choice, and the confirm step names the blast radius — `ABORT [run-…01]` (halt the selected run only: recorded as an abort-request `note` on its chain, honored by a live runner driver at the next phase boundary) vs `KILL ALL DISPATCH` (engine-global `POST /api/cmd {action:'killswitch'}` — every run's dispatch stands down). The latch never fires without the scope label lit; a healthy sibling run can never be killed by accident.
- **LEFT RAIL — Mission Rack (collapsible, 240px):** runs from `/api/runs` (`{runId, status, tasksPassed, tasksTotal, updatedAt, billedUsd}`), grouped: ACTIVE · **RECOVERY SHELF** (all `awaiting_merge` runs, each showing only its branch-name tag) · ARCHIVE. A **`+ NEW MISSION` plate** opens the Launch Pad (§6h); freshly composed runDirs sit in a `PRE-LAUNCH` group until their first chain event arrives. Status plates are calls-to-action, not badges: `awaiting_approval` renders as "POLL WAITING — G".
- **RIGHT RAIL — CAPCOM console (docked, resizable 280–480px):** the Core Agent voice loop. The **Trace Drawer** stacks above it when any chip is clicked; CAPCOM collapses to its input line + last call.
- **BOTTOM — Downlink Bay (collapsible with `` ` ``):** xterm.js terminal strip; pop-out capable.
- **CENTER STAGE — stations on keys 1–7:** `1` Floor/Big Board (default) · `2` Mission Planning · `3` Flight Recorder · `4` Flight Plan & Archives · `5` Poll Board · `6` Flight Rules & Ground Network · `7` Anomaly Room.

**Focus discipline.** `Enter` pins the current selection; all rendering is diff-update only, so the poll refresh can never steal focus, reflow a pinned reading, or dismiss an open confirm. The Anomaly Room seizes center stage automatically **only** for network-wide LOS (blocked code `-2`) and abort; every other terminal-for-human state offers a cut instead: an amber toast + `7` to jump.

**Attention discipline (OS-level).** Native Tauri notifications plus taskbar badge/flash fire for exactly the decision-class states — `awaiting_approval`, `blocked`, network-wide LOS, abort, and splashdown (`awaiting_merge`) — the same event classes permitted to seize center stage or enter the Poll Board. Nothing else notifies, ever. A Flight Rules toggle (§5.8) governs them; clicking a notification focuses the room on the exact row. A 2AM operator who is not staring at the room still learns of a decision the moment it exists — wall-clock time to decision is bounded by the OS, not by attention.

**Keymap scoping (focus discipline for keys).** Three focus classes decide what a keystroke means. (1) **Editable surfaces** — xterm panes, the CAPCOM input, the brief editor, any text field — own every printable keystroke: single-letter bindings are dead there; only reserved chords stay live (`Ctrl+K`, `F6`/`Shift+F6`, `Ctrl+`` ` ``, `Ctrl+N`, `Alt+↑/↓`, and `Ctrl+F` inside the Bay). Terminals receive raw bytes — `Esc` is forwarded to the PTY; focus leaves a terminal only via `F6` (region cycle) or `Ctrl+`` ` `` (bay toggle). (2) **Non-editable surfaces** (boards, tables, rows) — single-letter bindings active as listed below. (3) `Esc` in a non-terminal editable surface exits editing first, then resumes normal Esc semantics. `F6` cycles focus across the four persistent regions + center stage; `Shift+F6` reverses.

**Keyboard model (core bindings).**

| Key | Action |
|---|---|
| `1–7` | Switch center-stage station |
| `Ctrl+K` | Loop line (command palette; every spending/mutating command requires explicit confirm) — always live |
| `F6` / `Shift+F6` | Cycle focus across the four persistent regions + center stage — always live |
| `G` | Slide Poll Board over current station |
| `C` | Focus the CAPCOM input line |
| `` ` `` | Toggle Downlink Bay (`Ctrl+`` ` `` works from any focus, including terminals) |
| `[` / `]` | Previous / next Downlink channel |
| `Alt+↑/↓` | Switch selected run in the Mission Rack — always live |
| `Ctrl+N` | Open the Launch Pad (§6h) — always live |
| `Enter` | Pin selection / open |
| `S` then hold `Enter` (~400ms) | Arm, then latch a GO commit |
| `N` | NO-GO (with required reason; delta #3, §6b) · `H` HOLD → Brief Here |
| `←/→` | Scrub Flight Recorder |
| `D` | Decompose (Anomaly → Planning with ADaPT suggestion) |
| `T` | Open selected object's downlink channel at byte offset |
| `Ctrl+F` | Find in focused Downlink channel · `Alt+M` / `Alt+Shift+M` next/prev `BLOCKED:` / `# exit` marker |
| `Esc` | Unpin / close drawer / back (editable surfaces: exit editing first; terminals: forwarded to PTY) |

**Command palette.** `Ctrl+K` opens the loop line: fuzzy verbs over real endpoints (`dispatch`, `assign`, `setmode`, `settier`, `confirm`, `release`, `approve-phase`…). Verbs illegal in the current state are absent from the list, not greyed (Principle 2). Any verb that spends tokens or mutates state ends in the arm/latch gesture.

---

## 4. THE ID SPINE

**Chip anatomy.** One universal component. A chip is a monospace, bracketed token on a hairline-bordered pill: kind glyph · ID text · status tint on the left 2px edge. Examples: `[run-20260709-01]` `[T-3/2]` `[W2]` `[a41f09c2]` `[APRV-7]` `[gnd codex-a]` `[art src/quant.rs]`. Hover ≥250ms shows a card: resolved object summary, status lamp, last event line, `ts`. Click opens the **Trace Drawer**. Chips render identically in CAPCOM transcript, tables, wireframe labels, terminal pretty-print, and toasts.

**Chip states.** Beyond the resolved default, two honest degradations exist everywhere: **unresolvable** (the referenced run is archived/deleted or the record is not on this floor) renders grey with a dashed border, hover reading "record not on this floor" — it never fakes a resolution; **unhashed — legacy** (events predating the hash chain carry no `event_hash`, therefore no `action_id`) renders the event's line ordinal (`line N`) with an `unhashed — legacy` tag, no action_id, and no seal claim on its chain slice. Approval chips are **run-scoped**: on any surface showing more than one run (Poll Board, cross-run Recorder views) they render `[APRV-7 · run-…01]`; the run suffix collapses only inside a single-run surface — bare ordinals never collide.

**ID grammar (bound to recorded data).**

| ID | Format | Source of truth |
|---|---|---|
| `run_id` | directory name under `runs/` (canonical `run-YYYYMMDD-NN`; legacy free-form like `m0-smoke-20260703` accepted) | `progress.json.runId` |
| `wave_id` | `W<n>` — **derived once per run** from topological batching of that run's `tasks.json` snapshot `depends_on[]` (same algorithm as `waves()`); never re-derived from a later decomposition, so historical `W` references cannot silently relabel | derived from the flown `tasks.json`, never stored |
| `task_id` | `T-<n>` (engine board: `G0.1`, `guard--foo` also valid) | `tasks[].id` |
| `attempt_id` | integer; rendered `T-3/2` = task/attempt | `attempts[]` index; join key `(run_id, task_id, attempt_id)` |
| `action_id` | first 8 hex of `event_hash` (absent on legacy unhashed events — see chip states) | every hashed `progress.ndjson` line carries `prev_event_hash`/`event_hash` |
| `approval_id` | `APRV-<n>` — ordinal line number in `approvals.ndjson`, **scoped run+ordinal** when rendered across runs | `{ts, phase, by, decision}` rows |
| `account_id` | `gnd <id>` e.g. `gnd codex-a` | `/api/accounts` `accounts[].id` |
| `artifact_id` | repo-relative path | `files[]` on WRITE-BRANCH events (governance contract) |

**Trace Drawer spec.** Opens in the right rail (CAPCOM collapses). Three fixed sections: (1) **Resolved object** — the snapshot row rendered by kind (task card, event line, account card, approval row; an **artifact chip resolves to the Diff viewer**, below, not merely its event slice); (2) **Chain slice** — the object's `progress.ndjson` events filtered on the join key, each line showing `ts · event · detail · [action_id]`, with the seal state of the slice inherited from `verifyChain`; (3) **Linked IDs** — every related identifier as further chips (task → its attempts, wave, approvals, artifacts, funding station, log file). Actions shown are only those legal now (e.g. `T` open downlink at this attempt's log; re-run `evidence_command` in scratch channel). One resolver serves every chip; there are no per-surface trace variants. That is the entire traceability system.

**Diff viewer & reversibility (read-only).** Artifact chips and Poll Board diff-stat evidence resolve to a rendered, syntax-lit `git diff` of the run branch in the target repo — produced by the Tauri shell running git locally, strictly read-only. Three scopes: per-file (from an artifact chip), per-attempt (where attempt boundaries are recorded on the chain), and a per-gate rollup (from Poll Board evidence) — the human never approves an EXECUTE gate for code they cannot see in-room. Where per-attempt boundaries are not recorded, the view says `branch rollup — attempt boundaries not recorded` (the same honesty rule as context receipts). Reversibility is explicit and human-owned: a `REVERT` affordance on any attempt/gate diff **composes the exact branch-revert/reset commands to clipboard** for the human's own terminal — an instruction card, mirroring the splashdown doctrine. The app never executes destructive git; recovery belongs to humans.

---

## 5. The Eight Screens

### 5.1 Main Workspace — The Floor / Big Board

**Purpose.** The default station: the whole mission at a glance — trajectory, altitude, consoles, supply, polls — with zero navigation. (Runner-mission lens; console cards are the engine-board's stateful personas.)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ MET 03:41:12 · 14:22 น.  ●RUNNING  ⟨SUPERVISED⟩  PROP $1.84/$5.00 ▓▓▓░░░░        │
│ GND 6/9 ·2 LOS   SEAL ●SEALED                                    ⟦ ABORT ⌁ ⟧     │
├──────────┬─────────────────────────────────────────────────────┬─────────────────┤
│ MISSION  │ WAVE INSTR:  W1 ▮CLEAR  W2 ▮IN-FLIGHT  W3 ▯HOLD     │ CAPCOM          │
│ RACK     │ ┌────W1─────┬─────W2──────┬────W3────┬────W4─────┐  │ 14:21 FLIGHT>   │
│ ●run-…01 │T3│           │             │          │           │  │  status W2?     │
│ ○run-…02 │T2│           │  ◆T-4/3←pkt │          │           │  │ 14:21 CAPCOM:   │
│──────────│T1.5          │ ↻T-5/2      │          │           │  │  [T-4] climbing,│
│ RECOVERY │T1│ ▪T-1 done │             │  ▫T-7    │           │  │  packet carried │
│ SHELF    │T0│ ▪T-2 done │  ◆T-6/1     │  ▫T-8    │  ▫T-9     │  │  [a41f09c2]     │
│ ⎇feat/q…│  └──┬────────┴───┬─────────┴──────────┴───────────┘  │ ───────────────│
│          │    └╌╌╌gnd cdx-a └╌╌╌gnd anti-2   (supply threads)  │ > _             │
│          ├─────────────────────────────────────────────────────┤                 │
│          │ CONSOLES: ⟦ARCHON⟧opus ⟦LYRA⟧● ⟦RKOI⟧✓gate ⟦GHOST⟧… │                 │
├──────────┴─────────────────────────────────────────────────────┴─────────────────┤
│ ` DOWNLINK  [T-4/3 ▸ tail]  [T-6/1]  [scratch]                            ⤢ pop  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Regions & components.** Wave instrument strip (one needle per wave: CLEAR / IN-FLIGHT / HOLD / BLOCKED, aggregated from task statuses); the Big Board — waves as vertical phase bands left→right, tasks as nodes with status lamps, **altitude = tier**: the active attempt glyph sits at its tier band. Two attempt glyph species (data-true, from `rework_round` vs `escalated_to`): `↻` repeat glyph at the *same* altitude for rework; `◆…←pkt` a step **up** carrying a small packet line (the prior rung's failure summary) for escalation. **Supply threads:** an in-flight glyph draws a hairline to the ground-station chip funding it, brightening on selection — **only where per-dispatch account attribution is recorded** (engine-dispatched work via `providers.mjs` today; runner attempts render threads only after the `account` event field lands — delta #2, §6b; until then a runner glyph draws no thread rather than a guessed one). Console row: fixed cards for stateful agents only — callsign, persona, DACI/borrow badge, current activity line, gate-ownership icons, standing-orders dot. Workers never appear here. A plain **orthogonal DAG toggle** (`O`) ships in v1 for dense runs (>~50 tasks).

**States.** Loading: board skeleton + "ACQUIRING — reading run". Empty (no run selected): the Rack is the only lit region. Blocked: anomaly path stays lit, downstream waves ghost, toast offers `7`. Error (API down): the room drops to the designed dead-room screen (§6i) — engine status, connection fields, launch-engine affordance, last-known snapshot stamped with its staleness — never a bare freeze.

**Interactions.** `G` slides the Poll Board over the dimmed trajectory; arrow through items; `S` + held `Enter` records GO; the wall un-dims and the next wave's nodes flip to in-flight. Click a vehicle glyph → flight strip in the Trace Drawer. Click a console card → full inspector (5.2). `Enter` pins a node; poll refresh diff-updates around it. `T` on any glyph opens its log channel in the Downlink at the live offset. `O` toggles trajectory/orthogonal rendering.

**Data bindings.** Board: `GET /api/runs/<runId>` → `tasks[] {id, tier, model, status, attempts[{tier,model,result,verify_exit}], depends_on[], verify_command, cost_usd, tokens{local,billed}}`; waves derived from `depends_on[]`. Status strip: `status`, `awaiting{phase}`, `ledger{billed_usd, local_tokens, billed_tokens}`, `verifyChain.ok`, `/api/accounts` live/cooldown counts. Consoles: `/api/personas` (`{id,title,role,daci,borrow,can,cannot}`) joined with owner assignments. Poll cadence: run snapshot 1.5s, accounts 4s, logs 900ms.

### 5.2 Agent Detail Inspector — Console Detail / Flight Strip

**Purpose.** Two deliberately unequal inspectors: controllers have depth; vehicles are visibly disposable. The asymmetry *is* the design (hard requirement 6).

```
┌ CONSOLE — ⟦RKOI⟧ tech-lead/reviewer ────────────┐  ┌ FLIGHT STRIP — [T-3/2] ──────────┐
│ persona RKOI · claude:sonnet · DACI: approver   │  │ tail T-3 / attempt 2             │
│ borrow: shared(&) — claim/dispatch ABSENT       │  │ tier T1.5 kimi-k2.7-code:cloud   │
│ ┌─────────┬───────────────┬─────────┬────────┐  │  │ spawned 14:02:11 · gnd codex-a   │
│ │STANDING │CONTEXT RECEIVED│ACTIVITY │DOWNLINK│  │  │ loadout: verify_command,scope    │
│ │ORDERS   │brief v3 · 1.8k │[a41f09] │▸ tail  │  │  │ context: brief v3 slice (612 tok)│
│ └─────────┴───────────────┴─────────┴────────┘  │  │ verify: visible 1 · holdout —    │
│ can: review, gate-verdict / cannot: write, merge│  │ disposition: ▪EXPENDED           │
│ [brief v3→v4 diff] [re-brief on next attempt]   │  │ [raw log] [chain slice]          │
└─────────────────────────────────────────────────┘  └──────────────────────────────────┘
```

**Regions & components.** Console inspector (slides into right rail): header — callsign, persona title, model tier, DACI authority, borrow mode (shared-borrow personas render **no** claim/dispatch affordance at all, with the DACI reason in the header). Tabs: **STANDING ORDERS** (`can[]`/`cannot[]`, memory summary from its MemoryOS drawer), **CONTEXT RECEIVED** (exact brief version + excerpt manifest + token count, diff vs current brief, "re-brief on next attempt" action), **ACTIVITY** (chronological `[action_id]` chips — every tool call, dispatch, gate verdict), **DOWNLINK** (embedded live tail). Flight strip (thin): tail number, spawn params, loadout, context slice received, raw log link, disposition stamp `PASSED / EXPENDED / ESCALATED` — no portrait, no memory, no persona.

**States.** Loading: header renders instantly from store, tabs hydrate. Empty (never-dispatched persona): standing orders only, activity reads "no calls this mission". Blocked context (worker with no recorded receipt): "receipt not recorded — pre-receipt run" caption, never a fake value. Missing attribution: a runner attempt without a recorded funding account shows `station not recorded` in place of the `gnd` chip (delta #2, §6b) — the `spawned 14:02:11 · gnd codex-a` line renders in full only where attribution exists. Error: chain-slice fetch failure shows the verbatim reader error.

**Interactions.** In CONTEXT RECEIVED, click `brief v3→v4` to see exactly what this agent was *not* told (diff view, additions ghost-highlighted). `R` queues re-brief on next attempt (logs a `note` event on execution). In ACTIVITY, `Enter` on any `[action_id]` chip opens its Trace Drawer slice. In a flight strip, `T` opens the raw log at byte 0; `Esc` closes.

**Data bindings.** Personas: `/api/personas`. Activity: `progress.ndjson` events filtered by agent, chips keyed by `event_hash`. Context receipts: `note` events carrying brief version + `ContextPackage.tokenEstimate` (delta #1, §6b). Verify twins: `verify.visible_exit` / `verify.holdout_exit` (governance contract), fallback `attempts[].verify_exit` for legacy runs. Logs: `/api/log?id=<taskId>&offset=<byte>` → `{file,size,text,offset}`.

### 5.3 Workflow Graph Editor — Mission Planning

**Purpose.** Author the DAG against the engine's real verbs, with the cost of every dependency visible before anything flies. **This is an engine-board surface** (§2 — it edits `backlog.json` tasks via `/api/cmd`, never `specs/*.yaml`); the **EXPORT TO SPEC bridge** is how a finished plan becomes a runner mission. Planning lighting: panel value lifts one step — the count is not running.

```
┌ MISSION PLANNING — planning lighting ──────────────────────────────────────────┐
│ ┌ palette ─┐   ┌──W1──────┬──W2──────────┬──W3──────┐  CONSEQUENCE PREVIEW     │
│ │ +task    │   │ [T-1]    │ [T-3]        │ [T-6]    │  before: W2 ∥ W3 parallel│
│ │ personas │   │ C1·H2·T-c│ ⚠NO TELEMETRY│ W4⛔     │  after:  W3 waits on T-3 │
│ │ loadouts │   │ ●verify  │ floored T2   │ BLOCKED  │  +1 wave · est +14m      │
│ └──────────┘   │          │ [T-4]────────┼──▶[T-7]  │  ──────────────────────  │
│                └──────────┴──────────────┴──────────┘  GKS-002: acyclic ✓      │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Regions & components.** React-Flow-class canvas over real verbs: dropping a node creates a task (`todo`); dragging port-to-port writes `depends_on` via `POST /api/cmd {action:'setdeps'}` with server-side acyclic check. Each node carries its **launch-commit card**: C/H/D/T/W axis chips, verify lamp (no `verify_command` → amber `NO TELEMETRY — floored T2`, per the hard rule), tier hint, `requiresConfirm` hazard badge. The node inspector carries an **AXES editor** for the C/H/D/T/W fields, bound to `POST /api/cmd {action:'setaxes', id, axes}` (delta #5, §6b — until the verb lands, axis chips render read-only everywhere, with a hover saying so). W4 fan-out nodes render hazard striping and a hard `BLOCKED UNTIL DECOMPOSED` plate. The editor continuously recomputes topological waves and paints them as phase bands; the **consequence preview** panel renders the run-as-it-would-fly and animates the before/after when an edge lands — two parallel waves visibly collapsing into sequence, with the wave-count and estimate delta stated. **EXPORT TO SPEC (the bridge):** serializes the selected plan into a `specs/<name>.yaml` — per task `id, title, verify_command, tier_hint, depends_on, review_gate, human_review` — written into the configured Rwang `specs/` dir by the Tauri shell. The export preview **dry-runs `route.py --runner-tasks` locally** and renders the resulting tier table verbatim — including `disagrees_with_spec` flags and `NO TELEMETRY → floored T2` rows — before anything saves; tasks missing a `verify_command` are called out in the preview. The bridge is one-way: after export, the engine board and the spec do not stay linked; the Launch Pad (§6h) flies the saved spec.

**States.** Loading: canvas renders from store snapshot. Empty: a single ghost node "drop to begin". Blocked: gated nodes (`gated=true`, unconfirmed) carry an amber plate `CONFIRM REQUIRED — 5`. Error: a cycle-closing edge makes the offending loop pulse red once, the edge snaps back, and `GKS-002` prints in the status line — the server verdict, verbatim. Export preview with route disagreements renders them as information, not errors (a floor raise is expected behavior, not a bug).

**Interactions.** Drag persona/loadout onto a node to assign (`assignowner`); shared-borrow personas are rejected on hover with the DACI reason — the drop target never activates. `V` on a node opens a `verify_command` editor inline. `W` on a W4 node opens decomposition pre-loaded with the ADaPT suggestion. The AXES editor edits C/H/D/T/W in the node inspector. EXPORT TO SPEC opens the preview; saving is an arm/latch (it writes a file). `Ctrl+Z` is honest: it issues the inverse server mutation and waits for the poll echo.

**Data bindings.** Nodes: engine snapshot `tasks[] {id,title,type,phase,deps,est,accept,gated,confirmed,owner,moscow,rice}` from `/api/state`; mutations via `/api/cmd` `setdeps`/`assign`/`assignowner`/`confirm`, axis edits via `setaxes` (delta #5, §6b). Axis chips from task header fields (C/H/D/T/W per governance spec). Wave bands recomputed client-side with the same topology as `waves()`. Export: local file write to the configured `specs/` dir + local `route.py --runner-tasks` dry-run for the preview.

### 5.4 Run Timeline — Flight Recorder (MET)

**Purpose.** The audited past: every event on a MET axis, and **everything the chain records** reconstructable from it — reversibility as a first-class, provably-audited replay.

```
┌ FLIGHT RECORDER — run-20260709-01 ─────────────────────────────────────────────┐
│ ROUTE ▏EXECUTE                                   ▏REVIEW      ▏COMMIT           │
│ T-1 ▬▬▬(T1)                                                                     │
│ T-3 ▬▬(T1)↻▬▬(T1)╱▬▬▬(T1.5)╱▬▬▬▬(T2)·pkt        ⚑gate ⚑approve(by:Boss)        │
│ T-4        ▬▬▬▬(T2) ✓vis:0 ✓hold:0                                              │
│      ◇q ●r ▲v ✓p ✗f ⤴e ⛔b ▏pd ⚑g ⚑a ✎n   (11 event kinds, iconized)            │
│ SEAL ────────────────────────────────────────────────────● SEALED               │
│ ⟨scrub ◄ █ ►⟩  AS-PERFORMED · CHAIN INTACT · 14:07:22                           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Regions & components.** Top: phase bands Route/Execute/Review/Commit from `phases[]`. Middle: per-task lanes; each attempt is a segment colored by tier; **rework** renders the repeat glyph `↻` at the same lane height; **escalation** draws a step UP to the next tier lane carrying the packet line (the prior rung's failure summary, literally handed upward). All 11 `progress.ndjson` event kinds (`queued running verify pass fail escalate blocked phase_done gate approve note`) plot as iconized ticks; `gate`/`approve` pairs render as paired flags with the approver's name from `approvals.ndjson.by`. Beneath everything, the **seal strip**: on open, `verifyChain` walks the events while a hairline draws itself across the base, ending in a green `SEALED` stamp — or halting at a red break with the verbatim line-numbered error (`line N: event_hash mismatch — event content was altered`). Never summarized, never softened.

**States.** Loading: lanes draw as events stream from the tail read. Empty (fresh run): phase bands only, "recorder rolling". Breached chain: red break + verbatim error; scrubbing beyond the break is refused with `RECORD TORN AT LINE N`. Error: reader failures render as warnings from `verifyChain.warnings[]`.

**Interactions.** `←/→` scrubs; dragging the playhead reconstructs **what the chain records** — task lanes, attempt segments and their tiers, verify exits, gate/approve flags, and the ledger gauge over time (a pure left-fold over per-event `cost_usd`/`tokens`) — read-only, stamped `AS-PERFORMED · CHAIN INTACT` (or the torn line). What the chain does **not** record — station AOS/LOS lamps at time T, per-event console activity attribution — renders hatched with an explicit `NOT RECORDED` stamp during scrub, never a guessed value (adding those fields to the event schema would be a new §6b register entry, not an assumption). Land on a `verify` tick → twin instrument readouts `visible_exit` / `holdout_exit`; `Enter` opens the raw verify output in the Downlink at that byte offset. Every element is a chip → Trace Drawer. `Esc` returns to LIVE with a single bloom on the status lamp.

**Data bindings.** Events: `/api/runs/<runId>` events tail + full `progress.ndjson` read for scrub; chain: shipped `verifyChain {ok, events, hashed, chainTip, snapshotTip, errors[], warnings[]}`. Replay state is a pure left-fold over events — no new storage, and it claims nothing the fold cannot produce. Wave labels during scrub are pinned to the `tasks.json` snapshot the run flew (§4) — never re-derived. Ledger-over-time from `cost_usd`/`tokens` on events.

### 5.5 Memory/Context Viewer — Flight Plan & Archives

**Purpose.** What the machines were told, what they remember, and what they must never see — inspectable and editable by the human (hard requirement 3).

```
┌ FLIGHT PLAN ──────────────────────────┬ ARCHIVES ─────────────────────────────┐
│ MISSION BRIEF context.md   v4 ▾history│ ⟦ARCHON⟧ drawer  ⟦LYRA⟧ drawer  …      │
│ ┌───────────────────────────────────┐ │ (MemoryOS · read-only · provenance)   │
│ │ # Target repo facts…       [edit] │ │ ~~"uses vitest"~~ was wrong — fixed   │
│ └───────────────────────────────────┘ │  as "uses node:test" [a9c1f2e0]       │
│ DISTRIBUTION                          │ ANOMALY REPORTS brain/failures.jsonl  │
│ ⟦RKOI⟧ v4 · 1.8k tok · 14:02          │ ▸ 200 rows, newest first              │
│ [T-3/2] v3 · 612 tok  ⚠STALE [re-brief]│ ┌ SEALED VAULT ────────────────────┐ │
│ CONTEXT PREVIEW for [T-7]             │ │ holdout tests — NEVER DOWNLINKED  │ │
│ ▓▓▓▓▓░░ 1,420/2,000 tok               │ │ TO VEHICLES · human-inspect only  │ │
│ trim order: exemplar → grounded;      │ └───────────────────────────────────┘ │
│ PAST MISTAKES always kept             │ RETRIEVAL PROBE: type task text →     │
│                                       │ sim .78 ✓inject · sim .41 below θ     │
└───────────────────────────────────────┴───────────────────────────────────────┘
```

**Regions & components.** LEFT: the Mission Brief — `runs/<runId>/context.md` rendered with version history; editing creates v(n+1) and logs a `note` event. Below, the **distribution table**: every console and vehicle, which brief version it received, token count, when; stale-briefed agents carry an amber `STALE BRIEF` tag with a re-brief affordance. **Context Preview**: select an upcoming task → the exact ContextPackage assembles (brief slice + PAST MISTAKES + exemplar) against its `scope.budgetTokens` bar, showing trim order live — exemplar trimmed first, PAST MISTAKES always kept. RIGHT: **Archives** — per-agent MemoryOS drawers (GenesisDB or file backend, indicated), browsable read-only with provenance; corrected memories render struck-through with "was wrong — fixed as Y" (bitemporal supersede). Behind the drawers, a **RAW STORE browser**: a read-only view over the memory backend itself — SQLite/GenesisDB tables and the file backend — no query editor, no writes; the curated drawers are the interpretation, the raw store is the proof. The failure memory (`brain/failures.jsonl` via `/api/knowledge`) as an anomaly-reports feed. The **sealed vault** card represents holdout tests: human-inspectable, stamped `NEVER DOWNLINKED TO VEHICLES` — structurally absent from any agent-visible surface, as is any remaining-context meter. **Retrieval probe**: type a task description and see the actual PAST-MISTAKES block `hybridSearch` would inject, with similarity scores (inject threshold ≥ 0.6) and trim order.

**States.** Loading: brief renders first, tables hydrate. Empty (run <3 tasks, no brief): "no mission brief — executors fly self-contained". Degraded (`store.knowledge='file'`): probe and drawers show "knowledge loop off — static guide + verify gate only". Version conflict: if the runner regenerates the brief mid-edit, the editor is warned with a version diff before the save latches — last writer creates v(n+1) on top of the newest version, never an overwrite. Error: file-read errors verbatim.

**Interactions.** `E` edits the brief (schema-safe editor; save = v+1 + `note` event; the version-conflict rule above applies). Click a distribution row → that agent's CONTEXT RECEIVED tab. `Enter` on a failures row → Trace Drawer with its originating verify event. Probe: type, `Enter`, inspect the would-be injection.

**Data bindings.** Brief: `context.md` + `note` events for version log. Distribution: `note` events carrying brief version + token estimate (delta #1 in the §6b register). Failures: `GET /api/knowledge` `{mode,count,rows}`. Probe: GenesisDB sidecar `hybridSearch` (k=3, α=0.5). Vault: `runs/<id>/tests/holdout/` existence only — contents open in the OS editor, never in an agent-adjacent pane.

### 5.6 Approval Queue — GO/NO-GO Poll Board

**Purpose.** Every pending human decision in one place, each stating WHAT, WHY, and EVIDENCE, with the poll's recorded verdicts around the room — and Flight's lamp last.

```
┌ POLL BOARD — 3 pending ─────────────────────────────────────────────────────────┐
│ ▶ [run-…01] EXECUTE phase gate      WHY: supervised boundary — approve to resume │
│   chain: Arch✓→Review✓→AC✓→Integr✓→Test✓→◉FINAL   poll: RKOI:PASS ATHER:COMPLIANT│
│   EVIDENCE: verify vis:0 hold:0 · diff +214/−32 · [a41f09c2] [T-4/3]             │
│   ⟨S⟩ ARM → hold ⟨Enter⟩ GO ▓▓▓▓░ · ⟨N⟩ NO-GO · ⟨H⟩ HOLD—BRIEF HERE              │
│ ▶ [T-9] human_review task           WHY: external-write class — human must act   │
│ ▶ LAUNCH KEY request: git push …    TTL 12m · uses 3/20 · [copy mint command]    │
│ ▶ [run-…00] SPLASHDOWN ⎇feat/quant  Recovery is yours — merge externally. (no    │
│                                      merge control exists in this product)       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Regions & components.** One row per pending decision: phase gate approvals (`status: awaiting_approval` + `awaiting{phase}`), `human_review` tasks, Brief-Here holds, launch-key requests, `awaiting_merge`. Each row: **WHAT** (gate-chain diagram with this gate's position lit — Architecture→Review→AC→Integration→Test→Final), **WHY** (reason class stated plainly: T3 gate-exhaustion vs external-write vs human_review — each names its expected human response), **EVIDENCE** (verify exits, diff stat — the `diff +214/−32` chip opens the read-only **Diff viewer's** per-gate rollup (§4), so the code under approval is visible in-room — ID chips; any finding's `evidence_command` is clickable and runs in a scratch Downlink channel, real exit code landing beside the claim), and the **poll strip** — consoles that already called GO with recorded verdicts from the DACI chain (COMPLIANT/PASS/VERIFIED). **Launch keys** render TTL countdown, uses remaining `N/≤20`, consumed ledger; the row **composes the exact mint command** (`tool_guard.py --mint '<exact command>' --by <name> --ttl <min> --uses N`) to clipboard for the human's own terminal — an OS terminal or an in-app scratch PTY. Scratch PTYs are human shells, not agent shells; minting there is legal, and the consumed ledger proves it. Minting is refused inside agent shells; the key appears on the next poll. `awaiting_merge` rows show the branch name and deliberately no merge control — an instruction card instead.

**States.** Loading: rows render from store instantly. Empty: `POLL CLEAR — no decisions waiting`, the board's proudest state. Blocked (approve write fails): the row re-arms with the CLI error verbatim. Error: identity missing → the commit refuses with "approval requires identity" and **deep-links to the OPERATOR block in Flight Rules (§5.8)** — the recovery path is one click, designed, not discovered. Runner detached: if the run's chain has been silent past the liveness threshold, the row stamps `RUNNER DETACHED` and pairs the decision with the resume composer (§6h) — a GO on a dead runner never pretends to resume anything.

**Interactions.** Arrow through rows; `S` arms (row lifts one value step, detent appears); **hold `Enter` ~400ms** — the detent fills, identity + optional note are captured at latch, the decision writes, the row's lamp crosses amber→green once, and the Big Board node unfreezes. After a latch completes, **focus auto-advances to the next pending row** — arming remains manual per row (consent never batches; travel does), so a queue of `human_review` rows costs no re-navigation. `N` records NO-GO with a required reason via the `progress.py deny` subcommand (delta #3, §6b): it appends `{ts, phase, by, decision:"no-go", reason}` to `approvals.ndjson` and sets the run status to `needs_work`; the runner driver's next rehydrate sees `needs_work`, refuses auto-resume, and surfaces the reason — until the delta lands, the `N` verb is absent from the frame (Principle 2). `H` opens Brief-Here: collects the Brief Packet (§6e) before resume is representable. `Enter` on evidence chips → Trace Drawer; the diff chip → Diff viewer; click `evidence_command` → scratch channel run. A GO resumes work only through the runner: a live supervised driver picks the approval up at its next rehydrate poll; there is no in-app process control (§6h).

**Data bindings.** Pending set: `progress.json.status`/`awaiting`, `tasks.json` `human_review` flags, token requests from `approvals/` ledgers. Writes: the Tauri shell executes the canonical CLI locally — `progress.py <runDir> approve --phase <p> --by <identity>` for GO, `progress.py <runDir> deny --phase <p> --by <identity> --reason "<text>"` for NO-GO (delta #3, §6b) — the `:4577` server keeps `runs/` strictly read-only; the desktop app uses the same trusted writer the runner uses. Engine-board confirms: `POST /api/cmd {action:'confirm'}`. Poll strip verdicts: DACI chain step records. Consumed keys: `approvals/consumed.ndjson`. Identity: the operator callsign from Flight Rules (§5.8), stamped as `--by` on every latch.

### 5.7 Error/Debug State — Anomaly Room

**Purpose.** When a run goes terminal-for-human, assemble everything the human needs — reason first, evidence attached, recourse specific — with zero clicks.

```
┌ ANOMALY — [run-…01] blocked ─────────────────────────────────────────────────────┐
│ REASON: T3 GATE-EXHAUSTION on [T-3] (plain: failed verify at every tier)         │
│ ┌ trajectory (dimmed except anomaly path) ┐  ┌ FLIGHT SURGEON — T3 adversarial   │
│ │ T-3: T1↻ T1╱T1.5╱T2╱T3 ✗ ✗ ✗            │  │ review (ran after the block):     │
│ │ W3,W4 ghosted — skipped                 │  │ "verify asserts X; impl returns…" │
│ └─────────────────────────────────────────┘  └───────────────────────────────────┘
│ LADDER: each rung + carried failure summary · RAW FINAL LOG ▸ · chain slice ✓    │
│ RECOURSE: ⟨R⟩ re-brief+retry  ⟨D⟩ DECOMPOSE  ⟨M⟩ compose mint  ⟨L⟩ local  ⟨X⟩ release│
│ EVIDENCE: [run evidence_command → scratch ▸ exit 1 beside claim]                 │
│ ⟨A⟩ ask CAPCOM → proposal card → becomes Poll Board item (never a silent patch)  │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**Regions & components.** Reason class banner up top, plain term beside it. The Board dims all but the anomaly path: failed task, its attempt ladder (rework `↻` vs escalation steps rendered distinctly), skipped downstream waves ghosted. The Anomaly Report assembles: the T3 adversarial review (which still ran after the block) as the flight surgeon's report; per-rung attempt history with each carried failure summary; the raw final log; the chain-verified event slice. **Recourse verbs are reason-specific** and only legal ones exist in the frame: gate-exhaustion → re-brief/decompose/release; external-write → compose mint; `human_review` → the review checklist. **"All ground stations LOS" (blocked code `-2`) is a distinct banner** — soonest AOS countdown plus "switch to local network" (`setmode local`) — never a generic error, and it is one of only two states permitted to seize center stage.

**States.** This *is* the state screen. Entry: toast + `7` cut when the operator has a pinned selection or open confirm; auto-seize only for network-wide LOS and abort. Loading: report sections stream in reason-first. Runner detached: a blocked run whose chain is silent past the liveness threshold stamps `RUNNER DETACHED` beside the reason banner — recourse verbs that need a runner pair their recorded intent with the resume composer (§6h). Error: if the T3 review artifact is missing, its panel says so — never an empty pane pretending.

**Interactions.** `D` jumps to Planning with the task exploded into ADaPT-proposed sub-tasks awaiting your edit. `R` queues re-brief + retry: the intent is recorded as a `note` event; a live driver honors it on the next attempt; with `RUNNER DETACHED`, the verb also composes the exact single-phase re-invocation to clipboard (§6h) — the room never pretends a dead runner is alive. Click any finding's `evidence_command` → scratch Downlink run, exit code lands beside the claim. `A` hands the failure's trace chips to CAPCOM; its analysis returns as a structured **proposal card** that must be approved as a new Poll Board item before anything executes — advice becomes an `approval_id` in the chain. `T` opens the raw final log at the failure offset.

**Data bindings.** Reason: `blocked` event `detail` + status. Ladder: `attempts[]` + `escalate`/`fail` events with carried summaries. Surgeon's report: the Review-phase output logged to the run. LOS banner: `/api/accounts` all-cooling detection + soonest `cooldownUntil`/`resetMs`. Runner liveness: age of the run's last chain event vs threshold. Recourse writes: `/api/cmd` (`release`, `setmode`, `assign`) and `progress.py` for run-level notes; runner re-invocation via the resume composer (§6h).

### 5.8 Settings / Policy — Flight Rules & Ground Network

**Purpose.** The policy layer: autonomy, budgets, invariants, identity, connection, and the tracking network — with the four safety invariants rendered visibly *not* as settings.

```
┌ FLIGHT RULES ─────────────────────────┬ GROUND NETWORK ───────────────────────────┐
│ AUTONOMY: ◉supervised ○autonomous     │ CODEX · rotation ▾round-robin · ⟨enable⟩   │
│  ○unattended — "flies unmanned;       │ ┌ gnd codex-a ── ●AOS · ChatGPT Plus      │
│  always splashes down at              │ │ 5h ▓▓▓░ 7d ▓░ (Rwang-tracked ⓘ not the  │
│  awaiting_merge"                      │ │ provider's number) · uses 41 · $0        │
│ ┌ RANGE SAFETY (not settings) ──────┐ │ │ [pulse] [reset-usage]                    │
│ │ 1 no external write w/o human     │ │ ├ gnd codex-b ── ◐LOS — cooldown ·        │
│ │ 2 verify gate mandatory           │ │ │ AOS in 32m · frees up at 15:04 น.        │
│ │ 3 halt on gate-exhaustion         │ │ CLAUDE · gnd cl-main ●AOS · 5h util 62%   │
│ │ 4 always on a branch              │ │  resetAt 16:00 (provider-real quota)      │
│ └───────────────────────────────────┘ │ [establish uplink ▸ OS terminal OAuth]     │
│ PROPELLANT: session $5 / weekly $25   │ [paste key ••••••••  write-only]           │
│  (tier ceiling: pro) · ⟨arm abort⟩    │ disabling CODEX previews: roles coder,     │
│ VERIFY POLICY: failOn critical ·      │  worker lose preferred chain → shown       │
│  maxReworkRounds 1 · Brief-Here list  │  before you commit                         │
│ GOV LINT: ●PASS (broken → "LAUNCH     │                                            │
│  COMMIT CRITERIA FAILED — runs refuse │                                            │
│  to start")                           │                                            │
└───────────────────────────────────────┴────────────────────────────────────────────┘
```

**Regions & components.** FLIGHT RULES: an **OPERATOR block** — the operator's callsign (identity), captured by the first-run checklist (§6i), stamped as `--by` on every latch (approve/deny/override); editable here; the Poll Board's "approval requires identity" error deep-links to this block. A **CONNECTION block** — engine host:port, engine root, runs-directory root, and the Rwang root (`specs/` dir for export and the Launch Pad) — the same fields the dead-room screen (§6i) edits. An **OS NOTIFICATIONS toggle** — decision-class states only (§3), on by default. Autonomy selector, each level described as a flight rule with consequences; the four safety invariants in a fixed, non-editable **range safety** panel; propellant budget editors (session/weekly USD bounded by tier ceiling: free 1/5, pro 5/25, studio 20/100) with kill-switch arming; verify-gate policy (`failOn`, `maxReworkRounds=1`); the Brief-Here trigger list — persisted in `config.json` (`briefHere.triggers[]`), edited here via the same BOM-preserving hot-sync write as rotation changes; governance-lint status lamp. **On lint red, the panel expands to the lint's per-policy rows rendered verbatim** — policy id · guard · verdict · error line, from `governance_lint.py` output / `runs/<id>/governance_lint.json` — the same never-summarized treatment as the seal strip; the red toast's jump target is this panel. "LAUNCH COMMIT CRITERIA FAILED — runs refuse to start" is the headline, never the whole story. GROUND NETWORK: stations grouped by provider; each card shows callsign (`account id`), kind (key/login/keyring), AOS/LOS lamp with cooldown countdown + "frees up at" wall clock (th-TH), 5h/7d window bars distinguishing **provider-real** quota (claude `planQuota.five/seven util + resetAt`; openrouter dollar `used/limit/remaining`) from **Rwang-tracked estimates** (codex/antigravity `w5h/w7d`) — estimate bars carry the explicit ⓘ "not the provider's number" mark; uses/tokens/$; per-provider rotation select (round-robin/least-used/failover) and enable/disable; "establish uplink" spawns the OS-terminal OAuth with an `awaiting acquisition` interim state (card flips live on next poll); a configured-but-unauthed or auth-expired station (`authed=false`) renders a distinct **`UPLINK EXPIRED — reauth`** card state with the establish-uplink affordance in place, never a generic LOS; paste-key fields are write-only and never echo; **pulse** confirms before spending real tokens.

**States.** Loading: cards from last poll, stamped. Empty provider: "no stations configured". First run: the checklist (§6i) lands here for callsign and connection setup. Remote viewer: all write affordances absent (localhost-only mutations; Principle 2), with a one-line explanation. Error: manage-action failures verbatim; lint red expands per-policy rows as above.

**Interactions.** Changing autonomy states its consequence before latch. **Disabling a provider immediately previews which roles lose their preferred chain** (from `resolveForRole` order) before you commit. `P` pulses a selected station (confirm: costs real tokens). Rotation changes hot-sync config (BOM-preserving write + registry cache drop) and reflect on next poll. Arming the abort handle here is the same two-step gesture as GO, with the same explicit scope choice (§3).

**Data bindings.** Accounts: `GET /api/accounts` full row shape (`id, kind, configured, authed, email, plan, tier, live, cooldownUntil, cooldownMs, uses, cost, tokens, w5h, w7d, planQuota`), 4s poll, countdowns off absolute `resetAt`/`cooldownUntil`. Writes: `POST /api/accounts/{key,login,pulse,manage}` (localhost-only). Tiers/caps: `config.usageLimits.tiers`, `settier`, `killswitch` via `/api/cmd`. Gov lint: `runs/<id>/governance_lint.json` + lint exit status, per-policy rows verbatim. Operator identity, connection fields, notification toggle, Brief-Here triggers: app config + `config.json` hot-sync. Auth mode: `auth{mode, apiKeyAvailable}`, `setauth`.

---

## 6. Cross-Cutting Systems

**(a) Multi-account pool.** Ground stations exist at three altitudes: the status-strip mini-strip (`6/9 · 2 LOS`, always visible), **supply threads on the Big Board** (hairline from an in-flight glyph or console to its funding station chip docked on the Board edge — a mid-run rotation failover renders as a visible re-route, a *station handover* event, not an inferred stall), and the Ground Network tab (full cards, §5.8). Supply threads and handover rendering exist **only where per-dispatch attribution is recorded**: engine-dispatched work carries `providers.mjs` attribution today; runner attempts render threads and handovers only after the `account` event field lands (delta #2, §6b) — until then a runner glyph draws no thread and its flight strip reads "station not recorded". Handover mechanics: `parseLimit()` detects the limit signal; the card drops to `LOS — cooldown · AOS in 32m`; the handover schedule redraws; dispatch re-routes to the next live station per rotation policy. All-stations-dark is the network-wide LOS banner (blocked `-2`), one of two auto-seize states.

**(b) Shared context & the backend delta register.** The Flight Plan station (§5.5) is the single write surface for `context.md`; every edit is a version + `note` event. Per-agent receipt is the distribution table + each inspector's CONTEXT RECEIVED tab, with diff-vs-current and stale flags. Holdout material and remaining-context meters are structurally absent from every agent-visible surface. This spec depends on **five named backend deltas** — no other unlanded data is assumed anywhere, and until each lands its surfaces show the honest fallback (the same rule as context receipts):

| # | Delta | Until it lands |
|---|---|---|
| 1 | Dispatcher emits a `note` event at dispatch recording `{brief_version, token_estimate}` per agent | receipt cells read "not recorded" |
| 2 | `account` field on dispatch/attempt events (an `event_schema.json` change) — runner attempts today execute on the session's account, not the `providers.mjs` pool | supply threads render only for engine-dispatched work; runner flight strips read "station not recorded"; runner handovers do not render |
| 3 | `progress.py deny` subcommand — appends `{ts, phase, by, decision:"no-go", reason}` to `approvals.ndjson`, sets run status `needs_work`; the runner driver's next rehydrate refuses auto-resume and surfaces the reason | the Poll Board's `N` verb is absent from the frame (Principle 2) |
| 4 | Brief Packet `note` event — `{hold_id, question, evidence_ids[], answer, decided_by}`, plus a brief v+1 when the answer changes the mission brief; resume is representable iff the packet note exists for the hold | Brief-Here rows read "hold recorded — packet not yet wired" |
| 5 | Engine `setaxes` verb (`/api/cmd {action:'setaxes', id, axes}`) for C/H/D/T/W edits | axis chips render read-only everywhere, hover says so |

**(c) Core Agent advisor.** CAPCOM is a docked console, not a destination: a timestamped voice-loop transcript (call/response lines, each carrying ID chips), a one-line input, and verdict/proposal cards. That is its entire surface, capped by design — no threads, no attachments, no history search, no maximize. The human converses with CAPCOM while vehicles fly because CAPCOM never flies: its permitted actions are planning, review verdicts, and gate ownership. **Record-keeping:** the transcript persists to a run-scoped file (`runs/<runId>/capcom.ndjson`) and survives app restarts; consequential turns — gate verdicts, proposal cards, the critical-anomaly override — also enter the chain as their own events with `[action_id]`s; ordinary advisory turns are deliberately out-of-chain (advice that does not act is not audit material), and the rail states this once in its header. **CAPCOM's token spend meters into the propellant gauge and ledger like any console** — advice is never free or hidden. **Rail states:** streaming (the response streams under a stop affordance), funding-station LOS (`CAPCOM DARK — station LOS · AOS in 32m`), model error (verbatim, with retry), and app-close mid-response (the call is abandoned and the transcript records the truncation). A code-write by CAPCOM requires an explicit **critical-anomaly override**: guarded (arm/latch), identity-stamped, and logged to the chain as its own `[action_id]`. Anomaly consultations return as proposal cards that must clear the Poll Board — advice enters the record or it does not act.

**(d) Downlink Bay — cmux terminal grid.** xterm.js panes in a horizontal strip: one **log channel** per agent/task fed by the byte-offset `/api/log` pump (900ms), RAW mode default with the format-aware pretty-printer (claude stream-json vs plain text with `#` comment lines) togglable per channel; `BLOCKED:` markers highlighted amber. Plus **scratch channels**: real local PTYs (Tauri portable-pty) for evidence re-runs and minting. Scratch PTYs are human shells, not agent shells; minting there is legal, and the consumed ledger proves it. **States:** missing/rotated log file → `LOG NOT FOUND — file absent or rotated` chrome with a retry affordance; pump lag → a lag indicator (`▲ 4.2s behind`) whenever the byte offset falls measurably behind the file size, clearing itself on catch-up; dead PTY → exit chrome (`# exit 137`) with a dimmed frame, `[restart]` on scratch channels only; scrollback cap (10k lines) → oldest lines trimmed with a `scrollback capped — open raw log` affordance; a worker expended mid-tail keeps its channel open, stamps the disposition in the header, and the tail ends at the `# exit` footer. **Find:** per-channel search (xterm.js search addon, `Ctrl+F` — a reserved chord never forwarded to the PTY) plus marker jump (`Alt+M` / `Alt+Shift+M`) across the highlighted `BLOCKED:` / `# exit` lines — the first blocked line in a 40k-line log is two keystrokes, not a scroll. Pop-out to an OS window; the Recorder and every inspector deep-link into channels at exact byte offsets. Log header/footer contract (`# {task_id} · {worker} · {provider}:{model} · started {ISO}` … `# exit {code}`) renders as channel chrome.

**(e) Governance surfacing.** C/H/D/T/W render as one axis-chip row wherever a task appears (identical component in Planning, flight strips, Poll Board), edited only in Planning's AXES editor (§5.3; delta #5). The **gate-chain component** (Architecture→Review→AC→Integration→Test→Final, current gate lit, per-step verdicts) is one shared widget on Poll Board rows and node inspectors. **Brief Here** is a first-class hold: a triggered row collects the **Brief Packet** — `{hold_id, question, evidence_ids[], answer, decided_by}` — recorded as a `note` event on the chain, with a brief v+1 when the answer changes the mission brief (delta #4, §6b); resume is representable iff the packet note exists for the hold; the trigger list lives in `config.json` (`briefHere.triggers[]`), edited in Flight Rules (§5.8). **Launch keys**: TTL countdown, uses `N/≤20`, consumed ledger, mint-command composer to clipboard — minting is refused inside agent shells, and the UI says so. Scratch PTYs are human shells, not agent shells; minting there is legal, and the consumed ledger proves it. The governance-lint lamp gates the whole room's launch affordances: lint red → no run-start verb exists anywhere (Principle 2), and the lint's per-policy verdict rows render verbatim wherever the red lamp appears (§5.8) — the interlock that halts everything is never a slogan without its evidence.

**(f) Cost meter.** Two-way and honest: the propellant gauge shows `billed_usd` vs cap; local tokens are metered alongside at $0 (never hidden). Caps are **two-scope** and both render wherever a cap can bind: the selected run's spend vs its cap, and the global session(5h)/weekly(7d) window vs the session/weekly caps (status strip and Flight Rules show both meters). ≥80% warn / ≥100% over styling and the planner's tier-downgrade indication (opus→sonnet at 80%, prefer-local at 90%). Savings are always a **range** (token floor vs run-replacement realistic) with the review-tax share, per `cost-meter.mjs` — never a single fake number. Claude dollar figures carry the pricing-snapshot uncertainty flag; codex/antigravity $0 placeholders are labeled as such.

**(g) Escalation ladder.** One visual law everywhere (Big Board, Recorder, Anomaly ladder, flight strips): altitude = tier; `rework_round` = repeat glyph `↻` at the same altitude (max 1 per tier); `escalated_to` = a drawn step up one band carrying the packet line (prior rung's failure summary). The two are different data fields and must never share a visual — "looping at the same tier" and "climbing the ladder" demand different operator responses.

**(h) Launch, resume & retry — the composer doctrine.** `run.js` is a Workflow-tool script: only a Claude Code session can execute it. The desktop app therefore **never spawns the runner** in v1 — this is doctrine, stated in-room, not a silent assumption. What the app does instead is make every launch and resume exact and one-keystroke-cheap:

- **Launch Pad** (from the Mission Rack's `+ NEW MISSION` plate, `Ctrl+N`): spec picker over the configured Rwang `specs/` dir (including specs exported from Planning, §5.3) · target-repo path · autonomy level · auto-suggested `runDir` (`run-YYYYMMDD-NN`) · a **governance-lint precheck** — the Tauri shell runs `governance_lint.py` read-only; red renders the verbatim per-policy rows (§5.8) and the launch composer does not exist while red (Principle 2) · a route preview (`route.py --runner-tasks` dry-run, tier table verbatim). The latch (arm + held `Enter`) **composes the exact Workflow-tool invocation block** — `scriptPath: orchestrator/run.js` plus the args JSON (`specPath`, `targetRepo`, `autonomy`, `runDir`, optional `phase`) — to clipboard for the operator's Claude Code session. The rack shows the new runDir in `PRE-LAUNCH` until its first chain event arrives.
- **Resume after GO:** an in-app GO writes the approval via `progress.py approve`; a live supervised driver (the Claude Code session invoking `run.js` phase-by-phase) picks it up on its next rehydrate poll and flies the next phase — no in-app process control is needed for a live driver.
- **Runner liveness is honest:** the room derives liveness from the age of the run's last chain event; past a threshold the run stamps `RUNNER DETACHED`. Every recourse verb that needs a runner — Anomaly `R` re-brief+retry, resume-after-GO, release-and-refly — pairs its recorded intent (a `note` event on the chain) with the **resume composer**: the exact single-phase re-invocation block for the operator's session. The room never pretends a dead runner is alive, and the 2AM retry path is: read the anomaly, latch the intent, paste the composed invocation.

**(i) Dead room & first run.** `NO DOWNLINK — server :4577 unreachable` is a designed screen, not a freeze: it shows the probe result, the configured host:port / engine root / runs-root (all editable inline, persisted to app config — the same fields as Flight Rules' CONNECTION block), the last-known snapshot stamped with its staleness, and a **LAUNCH ENGINE** affordance — the Tauri shell spawns the engine from the configured engine root (never an embedded copy; detect-and-reuse remains the rule), or composes the exact start command to clipboard where spawning is refused. First run renders a four-row checklist, each row deep-linking to its surface: engine reachable → runs-root set → operator callsign (§5.8) → at least one ground station configured. A brand-new install is the checklist, not a dark room; a post-reboot 2AM operator gets a start-engine control, not a shrug.

---

## 7. Visual Language

**Palette (design tokens, dark-first, lint-enforced).**

| Token | Hex | Role (one meaning, exactly) |
|---|---|---|
| `--room` | `#0B0E12` | Base panels |
| `--panel-raised` | `#11151B` | Raised panels, cards |
| `--hairline` | `#232A33` | 1px bezels, rule lines |
| `--phosphor` | `#DDE4DB` | Telemetry text (off-white green-cast) |
| `--label` | `#8A94A0` | Grotesk labels, secondary prose |
| `--lamp-ready` | `#7FB8D8` | Ice-blue: ready |
| `--lamp-flight` | `#4D8FE0` | Signal-blue: in-flight |
| `--lamp-review` | `#9B7FD4` | Violet: reviewing |
| `--lamp-hold` | `#D8A03C` | Amber: hold / attention / LOS / stale |
| `--lamp-go` | `#5FA86A` | Green: nominal / GO / SEALED |
| `--lamp-abort` | `#D24545` | Red: abort and anomaly **only** |

Tier identity keeps the existing semantic mapping (opus purple, sonnet blue, haiku teal, ollama green) desaturated to console-lamp intensity. Total palette under 8 hues; large surfaces always neutral. A token-lint rule fails CI on any raw hex or any second use of red semantics.

**Lamp redundancy (color-independence).** Hue is never the only channel: every lamp semantic carries a single-character stamp rendered inside or beside the lamp at readout sizes — ready `○` · in-flight `▸` · review `◆` · hold `!` · GO `✓` · abort `×`. GO green vs abort red — the classic deuteranopia pair — and amber HOLD vs green nominal are therefore distinguishable with color vision deficiency, on a monochrome capture, and in metaphor-off mode; the stamps survive every degradation path, exactly as the attempt glyphs (`↻` vs step-up) already do.

**Typography.** `IBM Plex Mono` (fallback `JetBrains Mono`) for all telemetry, IDs, clocks, counts, terminal content — sizes 11/12/13/16 (readouts), weights 400/600. `Inter` for labels and prose — 12/13/14, weights 400/500/600. Station and section names: 10px all-caps microlabels, +8% tracking. **Thai copy (bilingual voice) renders in `IBM Plex Sans Thai`** (companion face to the Plex Mono voice; fallback `Noto Sans Thai`, then the system Thai face) — Inter has no Thai coverage and never renders Thai script; the declared stack is `Inter, 'IBM Plex Sans Thai', 'Noto Sans Thai', sans-serif` so Thai runs resolve to a controlled face, never tofu or an uncontrolled fallback. Thai renders at one size step larger in place of caps-tracking — Thai has no caps; hierarchy comes from weight and rule lines, with the same weight/size hierarchy rules as Inter. Times and countdowns in th-TH locale; dual MET + wall clock; countdown grammar preserved (`s` under 1m, `Xm YYs`, `Xh YYm`, plus "frees up at HH:mm").

**Materials & elevation.** Matte flat panels, 1px hairline bezels, inset rule lines — painted steel consoles under low light, achieved entirely with borders and value steps. No gradients, glass, texture, scanlines, CRT curvature, or noise. Elevation is a value step (+1 panel tone), never a drop shadow. Lamps are small solid dots/bars carrying their redundancy stamp, with a faint bloom only at the moment of transition.

**Motion.** Durations: lamp bloom 200ms `ease-out`; Poll Board slide 240ms `cubic-bezier(0.2, 0, 0, 1)`; board dim 180ms; escalation step-line draws once, 300ms; seal hairline draws once per open, paced by verification progress. Motion is allowed only when state changes meaning; the Poll Board slide and Board dim are the only large movements. Countdowns tick client-side off absolute epoch timestamps. Nothing idles, pulses ambiently, or loops.

**Realistic-cinematic rules.** The cinema is the data performing: THE POLL (verdict lamps flip in sequence, yours last), THE CLIMB (a real escalation drawn as it happens), LOS HANDOVER (a quota event as a boring, visible re-route), THE SEAL (chain verification performed live from real hashes), SPLASHDOWN (the deliberate absence of a merge button as doctrine). Rule: a beat may exist only if removing it would remove diagnostic information.

**Sound.** None in v1; if ever added, one soft detent click on latch commit, off by default.

---

## 8. Component Inventory

| Component | Used on | Notes |
|---|---|---|
| ID chip + Trace Drawer | Everywhere | One resolver; §4 is the whole traceability system; unresolvable/unhashed states |
| Diff viewer (read-only) | Trace Drawer (artifact chips), Poll Board evidence | Rendered git diff of the run branch; per-file/attempt/gate; `REVERT` composes commands, never executes |
| Status lamp | All surfaces | Token-locked colors; bloom-once transition; redundant glyph stamp (`○▸◆!✓×`) |
| Wave instrument strip | Floor, Planning | Needle rollup per wave: CLEAR/IN-FLIGHT/HOLD/BLOCKED |
| Trajectory board (+orthogonal toggle) | Floor, Anomaly, Recorder replay | Styled SVG DAG; positions are data, no physics |
| Attempt glyph pair (`↻` / step-up+packet) | Floor, Recorder, Anomaly, flight strip | `rework_round` vs `escalated_to`, never conflated |
| Supply thread | Floor | Hairline glyph→station; brightens on selection; renders only with recorded attribution (§6a) |
| Console card / inspector | Floor, right rail | Stateful agents only |
| Flight strip | Trace Drawer | Stateless workers; disposition stamps; "station not recorded" fallback |
| Gate-chain widget | Poll Board, inspectors | Six gates, current lit, per-step verdicts |
| Axis-chip row (C/H/D/T/W) | Planning, strips, Poll Board | Amber `NO TELEMETRY` on missing verify; edited via Planning AXES editor (delta #5) |
| Arm/latch control | Poll Board, abort, Launch Pad, palette confirms | `S` + held `Enter` ~400ms with detent |
| Launch/resume composer (Launch Pad) | Mission Rack, Poll Board, Anomaly | Composes exact Workflow invocation; lint-precheck gated; §6h doctrine |
| Ground-station card + mini-strip | Flight Rules, status strip | Real vs tracked quota bars, ⓘ mark; `UPLINK EXPIRED` state |
| Propellant gauge | Status strip, Flight Rules | Two meters: run spend vs cap · global window vs caps; local tokens alongside |
| Seal strip | Recorder, run header | Draws once; verbatim break errors |
| Downlink channel (xterm.js) | Bay, inspectors, Anomaly | Log channels + scratch PTYs; byte-offset deep links; states + find (§6d) |
| Mint composer | Poll Board, Anomaly | Clipboard command; never executes in agent shells |
| Proposal card | CAPCOM rail | Structured; must clear Poll Board to act |
| Brief version diff | Flight Plan, inspectors | "What this agent was NOT told" |
| Countdown | Everywhere | Client-tick off absolute timestamps; th-TH |

---

## 9. Anti-Over-Engineering Appendix

**Non-goals (deliberately not built).** No 3D room, camera zooms, or skeuomorphic console art — the room is a pane layout, not a scene. No avatars or animated characters. No physics on the trajectory. No audio voice loop. No custom terminal emulator (xterm.js over the existing log API). No new push transport in v1 (poll adapters at the monitor's proven cadences: state 1.5s, logs 900ms, accounts 4s, ollama 10s). No in-app runner execution in v1 — launch/resume is the composer doctrine (§6h) — and no embedded engine copy (§6i). No merge/push/PR/deploy controls anywhere, ever. No editing or summarizing of the audit chain — `verifyChain` output verbatim. No game-inventory Loadout styling (assignment is a plain picker). No marketplace, no mobile/responsive layout, no theming beyond the one dark room. No per-surface state models — one normalized store, every surface a lens on the same row. No A2A visualizations while A2A is P3.

**Degradation path (metaphor-off mode).** Every metaphor label already carries its plain term; a single toggle promotes plain terms to primary (MET→elapsed, LOS→cooldown, station→account, vehicle→attempt). The trajectory falls back to the orthogonal DAG; the Recorder remains a plain event timeline; lamps keep their glyph stamps; all tables and chips work identically. The product must remain fully operable with the fiction entirely off.

**Phased build plan.**
- **Phase 1 (ship in weeks).** Bind to the running `:4577` server (detect-and-reuse; do **not** embed the G:/Rwang engine copy — it is missing `store/` and `gks/`). Tauri shell + pane frame + status strip (selected-run binding, dual propellant meters, scoped ABORT); dead-room screen + first-run checklist (§6i); operator callsign (§5.8); OS notifications for decision-class states (§3); keymap scoping + region cycling; Mission Rack over `/api/runs`; Big Board (orthogonal DAG first, trajectory styling second) over `/api/runs/<id>`; ID chip + Trace Drawer (incl. unresolvable/unhashed states); read-only Diff viewer (branch rollup); Poll Board with arm/latch writing via local `progress.py approve` + queue-advance; Downlink log channels over `/api/log` with states + per-channel find; Ground Network read side over `/api/accounts` (incl. `UPLINK EXPIRED`); seal strip from shipped `verifyChain`. Token lint in CI.
- **Phase 2.** Launch Pad + spec export bridge (§5.3, §6h) with lint precheck and route preview; §6b delta register items 1–4 landed and wired (brief receipts, account attribution, `deny`/NO-GO path, Brief Packet); Mission Planning over `/api/cmd setdeps/assign/assignowner/confirm` (+`setaxes`, delta #5); consequence preview; console inspectors + personas; Flight Plan station (brief versioning + conflict rule); Recorder chain-scoped scrub with `NOT RECORDED` treatment; per-attempt diff slices; Anomaly Room recourse verbs + runner-liveness stamps + resume composer; scratch PTY channels + evidence re-run + mint composer; supply threads (attribution-gated); CAPCOM transcript persistence + rail states + metered spend; pop-out windows.
- **Phase 3.** Retrieval probe (GenesisDB sidecar); Archives drawers with bitemporal strike-through + raw-store browser; wave instrument strip refinements; optional SSE/WebSocket push channel (the real fix for liveness) behind the same store adapters; CAPCOM proposal-card loop hardening.

---

## 10. Open Questions

1. Approval writes for runs go through local `progress.py approve`/`deny` — should a localhost-only POST endpoint eventually replace CLI spawning, and if so, how is identity attested?
2. The §6b delta register names five emitter/verb changes (brief receipts, account attribution, `deny`, Brief Packet, `setaxes`) — who owns landing each in the runner/engine, and what are the exact `detail` schemas?
3. Can 5 Antigravity subscription tokens actually be obtained (OPEN RISK in FEAT--MULTI-ACCOUNT-ROTATION), or should the Ground Network design assume 1 keyring seat?
4. The keyless hash chain cannot detect a fully consistent rewrite — do we surface an HMAC upgrade path in the seal UI, or keep silence until it ships?
5. At what task count does the trajectory view auto-suggest the orthogonal fallback (fixed threshold vs measured legibility)?
6. Does CAPCOM's critical-anomaly override require a launch key (metered token) in addition to arm/latch, or is the logged override sufficient?
7. Should a headless runner CLI wrapper (spawnable by the Tauri shell) eventually land so the Launch Pad can execute missions directly instead of composing Workflow invocations — and if so, how does it preserve the supervised driver's phase-boundary pauses?

---

## 11. CHANGELOG

| Version | Date | Agent | Status | Summary |
|---|---|---|---|---|
| 0.1.0b | 2026-07-09 | ClaudeFable | draft | Initial final spec: FLIGHT direction consolidated with SANDTABLE (supply threads, focus discipline, offer-the-cut), TOWER (interlocking law, latched approval, wave instruments), Full Score (whole-room scrub, rework/escalation glyphs, consequence preview, auditable CAPCOM proposals), Atelier (runnable evidence, mint composer, color/material lint law, recovery shelf). |