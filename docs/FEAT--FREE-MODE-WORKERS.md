# FEAT — Reliable free-mode workers (text-to-file + OpenRouter tool loop)

Two dispatch upgrades so an autonomous run in **free mode** actually completes tasks, instead of a
weak local 4B failing the tool loop.

## (a) Text-to-file dispatch — SLM-friendly, no tool loop

Small local models are unreliable at agentic tool-calling but fine at plain text generation. A
content-producing atom can now set **`writeOutputTo`** (a file path). The worker then runs in plain
**text** mode (the tool loop is skipped) and the **engine** writes the model's answer to that file:

```jsonc
{ "id": "DOC1", "type": "docs", "writeOutputTo": "docs/generated/intro.md",
  "title": "...", "accept": "Reply with the file content only." }
```

`worker-io.mjs`: `wantsTextFile(task)` selects the mode; `writeAnswerFile(root, target, text)` writes
it (creates dirs, strips one wrapping ``` fence, normalizes a leading `/C:` on Windows). Works for
ollama **and** OpenRouter. So even a 4B can produce a file — it just writes prose, the engine saves it.

## (b) OpenRouter tool loop — a smart `:free` model as the worker

`runOpenRouterTools` gives OpenRouter models an OpenAI-compatible tool loop (`/chat/completions` with
`tools`), reusing the **same** tool schema + executor as ollama (`read_file`/`write_file`/`list_dir`/
`bash`). So a capable OpenRouter model — including a **`:free`** one — can do real agentic file
editing, not just text. Enabled by `providers.openrouter.tools: true`; OpenRouter gains the
`file_edit` + `code_review` capabilities.

Each role chain now carries a tool-capable `:free` model, positioned **after** the paid cloud and
**before** the local ollama fallback — so:

| mode | coder resolves to |
|---|---|
| normal | `claude:sonnet` (best) |
| **free** | `openrouter:qwen/qwen-2.5-coder-32b-instruct:free` (skips paid claude, beats the local 4B) |
| local | `ollama:…aroow-rust-coder…` (offline) |

(worker→llama-3.3-70b:free, scout→gemini-2.0-flash:free, architect/reviewer→deepseek-r1:free.)

## Setup

- **Free mode with OpenRouter:** enable the `openrouter` provider + add your key (Account Pool UI or
  `accounts.local.json`), then `mode free`. Dispatch routes to the `:free` models above.
- ⚠ **Verify the `:free` slugs** exist on OpenRouter and support tool-calling before relying on them
  (availability changes); swap in the current free tool-capable models in `config.json` role chains.
- `:free` models are rate-limited/queued — for hard-offline use `mode local`.

## Tests

`worker-io.test.mjs` (3) — mode selection, unfence, file write (abs/rel, `/C:` normalize).
`openrouter-tools.test.mjs` (2) — tool call → file written → final answer (injected fetch), and
clean no-key failure. Full suite green.
