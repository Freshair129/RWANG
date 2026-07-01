// openrouter-tools.test.mjs — OpenRouter OpenAI-compatible tool loop (agentic file edits).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runOpenRouterTools } from "./providers.mjs";

test("runOpenRouterTools executes a tool call then finishes; the file gets written", async () => {
  const root = mkdtempSync(join(tmpdir(), "ortools-"));
  const paths = { ROOT: root, LOGS: join(root, "logs") };
  const target = join(root, "out.md");
  const config = { providers: { openrouter: { host: "https://openrouter.ai/api/v1", auth: { apiKey: "sk-or-test" }, toolsMaxIter: 5 } } };

  let call = 0;
  const fetchFn = async (url, opt) => {
    call++;
    const body = JSON.parse(opt.body);
    assert.ok(Array.isArray(body.tools) && body.tools.length, "tools sent");
    if (call === 1) {
      // first turn: model asks to write the file
      return { ok: true, json: async () => ({
        choices: [{ message: { role: "assistant", tool_calls: [
          { id: "tc1", type: "function", function: { name: "write_file", arguments: JSON.stringify({ path: target, content: "hello from OR" }) } },
        ] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }) };
    }
    // second turn: model must now see the tool result and give a final answer
    const last = body.messages[body.messages.length - 1];
    assert.equal(last.role, "tool");
    assert.equal(last.tool_call_id, "tc1");
    return { ok: true, json: async () => ({ choices: [{ message: { content: "done writing" } }], usage: {} }) };
  };

  const r = await runOpenRouterTools({ id: "T1" }, "qwen/qwen-2.5-coder-32b-instruct:free", "w1", "write the file", config, paths, { fetchFn });
  assert.equal(r.ok, true);
  assert.equal(r.provider, "openrouter");
  assert.equal(call, 2, "looped: tool call then final answer");
  assert.ok(existsSync(target));
  assert.equal(readFileSync(target, "utf8"), "hello from OR");
  // note: the runner's log WriteStream flushes async after return — leave the tmp dir for the OS to
  // reap rather than rmSync it here (deleting mid-flush races into an ENOENT after the test ends).
});

test("runOpenRouterTools fails cleanly with no API key (never throws)", async () => {
  const root = mkdtempSync(join(tmpdir(), "ortools2-"));
  const prevKey = process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_API_KEY;
  const config = { providers: { openrouter: { auth: {} } } };
  const r = await runOpenRouterTools({ id: "T2" }, "m:free", "w1", "p", config, { ROOT: root, LOGS: join(root, "logs") }, { fetchFn: async () => ({ ok: true, json: async () => ({}) }) });
  assert.equal(r.ok, false);
  if (prevKey !== undefined) process.env.OPENROUTER_API_KEY = prevKey;
});
