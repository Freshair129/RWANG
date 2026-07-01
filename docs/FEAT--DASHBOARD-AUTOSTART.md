# FEAT — Dashboard auto-start on session start

The Rwang dashboard now opens itself. A **SessionStart hook** (`.claude/settings.json` →
`.claude/hooks/open-dashboard.mjs`) runs every time a Claude Code session starts or resumes at the
repo root — alongside the usual "read MEMORY.md / Development Progress" context load — and:

1. checks whether the UI server is up on the dashboard port (default **4577**);
2. if it's down, spawns `node server.mjs` **detached** (survives the session) and waits ≤3s for it;
3. opens `http://localhost:4577` in the default browser **the first time the server comes up** — so
   you get one live tab that updates alongside the work, not a new tab on every session/compact;
4. prints a one-line context note either way (`📊 Rwang dashboard: … — started + opened / already running`).

Best-effort and non-blocking: if `server.mjs` is missing or Node fails, it logs to
`store/dashboard.log` and prints a skip note — it never fails the session.

## Knobs (env)

| var | default | effect |
|---|---|---|
| `RWANG_DASH_PORT` | `4577` | dashboard port |
| `RWANG_DASH_OPEN` | `auto` | `auto` = open only when the hook just started the server · `always` = open every session · `never` = never open (server still ensured up) |
| `RWANG_DASH` | — | `off` = skip the hook entirely |

## Notes

- The server is shared across sessions: once one session brings it up, later sessions detect it
  ("already running") and don't restart it or spam new tabs.
- Project hooks require a one-time trust approval from Claude Code the first time they run.
- To stop it: set `RWANG_DASH=off`, or remove the `SessionStart` block from `.claude/settings.json`.
