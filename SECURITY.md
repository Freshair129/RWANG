# Security Policy

## Reporting vulnerabilities

If you discover a security vulnerability in RWANG, please report it responsibly:

1. **Do not** open a public issue
2. Email [suanranger129@gmail.com](mailto:suanranger129@gmail.com) with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
3. You will receive a response within 72 hours

## Security model

### Agent permissions

RWANG spawns AI agents as child processes. The permission model controls what
agents can do:

| Mode | Capability | Use case |
|---|---|---|
| `safe` | File edits only — no shell, no Bash | Config, docs, scaffolding |
| `full` | File edits + shell execution | Code, tests, builds |

Permission mode is routed per task type in the engine (`permissionFor(t)`).
The mapping is configurable in `config.json` → `providers.claude.permissionModes`.

### Sensitive data handling

- **API keys**: stored in `config.json` (local only) or environment variables.
  Never committed to version control. Add `config.json` to `.gitignore` if your
  config contains secrets.
- **Agent logs**: stored locally in `logs/`. May contain code snippets, file
  contents, or error messages from agent execution. Treat as sensitive.
- **State file**: `state.json` contains task metadata (IDs, statuses, timestamps).
  No credentials or user data.

### Network exposure

- The engine server (`server.mjs`) binds to `localhost:4577` by default.
  **Do not expose to the public internet** without authentication.
- Ollama connections go to `localhost:11434` by default.
- Claude CLI uses the user's local auth (Plan subscription or API key).

### Supply chain

- The engine core (`engine.mjs`, `providers.mjs`, etc.) uses **zero external
  npm dependencies** — Node.js built-ins only.
- The Studio UI (`studio/`) uses React, Vite, and related build tools.
- The Tauri shell uses Rust crates from crates.io.

### Governance safeguards

- **Borrow checker** prevents reviewer personas from self-approving their own work
- **Governance gates** require explicit confirmation for safety-critical atoms
- **Kill switch** halts all agent dispatch immediately
- **Cost caps** prevent runaway spending (session + weekly USD limits)
- **Lease reclaim** auto-releases stale claims, preventing deadlocks

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |

## Best practices for operators

1. Run the engine server on localhost only
2. Use `safe` permission mode as default; only escalate to `full` for code tasks
3. Set `usageLimits` in `config.json` to cap agent spending
4. Review agent logs after dispatch before merging changes
5. Keep API keys in environment variables, not in committed config files
6. Regularly rotate API keys
