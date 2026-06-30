# Changelog

All notable changes to RWANG are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Standalone repository extracted from G-Maiden orchestration module
- Full SWE documentation suite (README, CONTRIBUTING, CHANGELOG, ARCHITECTURE, SECURITY, CLAUDE.md)

## [0.1.0] — 2026-06-30

Initial release as standalone project (extracted from G-Maiden).

### Added
- **Engine** — DAG-based task orchestration with dependency gating, atomic claim, lease reclaim
- **Model routing** — type → role → model tier mapping (opus/sonnet/haiku/local)
- **Multi-provider dispatch** — Claude (Plan + API key), Ollama (local), Codex, Antigravity, OpenRouter
- **DACI governance** — persona-based borrow checker (exclusive/shared), governance gates, kill switch
- **GKS (Genesis Knowledge System)** — atom schema, compile pipeline, ownership model, approval chain
- **Studio UI** — 10-tab React/Vite dashboard (Develop, Board, Graph, Pipeline, Node↔DB, Diagram, Cockpit, Loadout, Copilot, Memory)
- **DevProgress** — phase-grouped task board with drag-assign, batch-assign, filter/group by owner, live agent log streaming
- **Dual permission modes** — safe (edits only) vs full (Bash ok), routed per task type
- **Live agent log** — incremental log streaming with live indicator
- **Cost controls** — session/weekly USD caps with auto-downgrade and local fallback
- **Usage metering** — per-agent token/cost tracking, session and weekly summaries
- **Ollama integration** — local model dispatch with adaptive decomposition, VRAM monitoring, profile routing
- **Wave planning** — topological wave ordering for parallel dispatch
- **Context scoping** — POLA-based prompt scoping per phase/task type
- **Tauri desktop shell** — native wrapper with system tray, global shortcuts
- **CLI** — full command-line interface (status, next, graph, claim, done, fail, release, assign, run, reset)
- **REST API** — HTTP API for all operations (GET /api/state, POST /api/cmd, etc.)
- **6 ADRs** — verify-gate, GoVibe integration, backend store, role boundary, provider registry, topology
- **SRS** — formal software requirements specification
- **Design doc** — G-Orchestra v2 masterplan and design
