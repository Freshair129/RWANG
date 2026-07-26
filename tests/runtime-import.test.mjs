import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const requiredModules = [
  'providers.mjs',
  'accounts.mjs',
  'accounts-admin.mjs',
  'account-identity.mjs',
  'image.mjs',
  'ollama-vram.mjs',
  'runs-reader.mjs',
  'chain-verify.mjs',
  'worker-io.mjs',
];
const requiredData = ['backlog.json'];

test('harness direct runtime modules exist and non-listening entrypoints import', async () => {
  for (const modulePath of requiredModules) {
    assert.equal(existsSync(resolve(root, modulePath)), true, `missing runtime module: ${modulePath}`);
  }
  for (const dataPath of requiredData) {
    assert.equal(existsSync(resolve(root, dataPath)), true, `missing runtime data: ${dataPath}`);
  }

  await import(pathToFileURL(resolve(root, 'engine.mjs')).href);
  await import(pathToFileURL(resolve(root, 'planner.mjs')).href);
});

test('knowledge store preserves the canonical similarity API in file mode', async () => {
  const knowledge = await import(pathToFileURL(resolve(root, 'store', 'knowledge.mjs')).href);

  assert.equal(typeof knowledge.embed, 'function');
  assert.equal(typeof knowledge.searchSim, 'function');
  knowledge.resetStore();
  assert.equal(await knowledge.embed({}, 'compatibility probe'), null);
  assert.deepEqual(await knowledge.searchSim({}, 'compatibility probe'), []);
});

test('runtime defaults and governance commands are repository-relative', () => {
  const serverSource = readFileSync(resolve(root, 'server.mjs'), 'utf8');
  const runnerSource = readFileSync(resolve(root, 'orchestrator', 'run.js'), 'utf8');
  const progressSource = readFileSync(resolve(root, 'orchestrator', 'progress.py'), 'utf8');
  const governanceSource = readFileSync(resolve(root, 'orchestrator', 'governance', 'governance.yaml'), 'utf8');
  const restartSource = readFileSync(resolve(root, 'orchestrator', 'governance', 'restart_prompt.md'), 'utf8');
  const guardSource = readFileSync(resolve(root, 'orchestrator', 'governance', 'tool_guard.py'), 'utf8');
  const hook = JSON.parse(readFileSync(resolve(root, 'orchestrator', 'governance', 'claude_settings.hook.json'), 'utf8'));

  assert.match(serverSource, /process\.env\.RWANG_RUNS_DIR\s*\|\|\s*join\(REPO_ROOT, ['"]runs['"]\)/);
  assert.doesNotMatch(serverSource, /G:[/\\]Rwang/);
  for (const source of [runnerSource, progressSource, governanceSource, restartSource, guardSource]) {
    assert.doesNotMatch(source, /G:[/\\]Rwang/);
  }
  assert.equal(hook.hooks.PreToolUse[0].hooks[0].command, 'py -3 "orchestrator/governance/tool_guard.py" --hook');

  const hookProbe = spawnSync('py', ['-3', 'orchestrator/governance/tool_guard.py', '--hook'], {
    cwd: root,
    encoding: 'utf8',
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'echo wave3-probe' } }),
  });
  assert.equal(hookProbe.status, 0, hookProbe.stderr || hookProbe.stdout);
});

test('harness server boots with the restored runtime closure', async () => {
  const port = 46000 + (process.pid % 1000);
  const child = spawn(process.execPath, ['server.mjs', '--port', String(port)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  let timeoutId;

  try {
    await Promise.race([
      once(child.stdout, 'data'),
      once(child, 'exit').then(([code]) => Promise.reject(new Error(`server exited before listening: ${code}; ${output}`))),
      new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error(`server boot timed out; ${output}`)), 5000); }),
    ]);
    assert.match(output, new RegExp(`http://localhost:${port}`));
  } finally {
    clearTimeout(timeoutId);
    if (child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
  }
});
