import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
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
