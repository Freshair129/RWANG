import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const registry = JSON.parse(readFileSync(resolve(root, 'adapters/host-skills/registry.json'), 'utf8'));

test('host-skill registry records an immutable external source', () => {
  assert.equal(registry.schema_version, 'rwang-host-skill-source/v1');
  assert.equal(registry.sources.length, 1);

  const [source] = registry.sources;
  assert.match(source.repository, /^https:\/\/github\.com\/Freshair129\/RWANG-PROMAX\.git$/);
  assert.match(source.commit, /^[0-9a-f]{40}$/);
  assert.equal(source.distribution, 'external-installable-skill-bundle');
  assert.deepEqual(source.supported_hosts, ['codex', 'claude', 'antigravity']);
  assert.equal(source.validation.observed_result, 'pass');
});
