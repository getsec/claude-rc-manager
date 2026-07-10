import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProtocols, seedDefaults, BUILTIN } from '../src/protocols.js';

async function tmpDir() {
  return path.join(await mkdtemp(path.join(os.tmpdir(), 'am-seed-')), 'protocols');
}

test('seedDefaults writes the built-in compose-portblock', async () => {
  const p = createProtocols({ dir: await tmpDir() });
  await seedDefaults(p);
  const got = await p.get('compose-portblock');
  assert.equal(got.slug, 'compose-portblock');
  assert.match(got.body, /SESSIONS\.md/);
  assert.ok('PG_BASE' in got.vars);
  assert.ok('compose-portblock' in BUILTIN);
});

test('seedDefaults does not overwrite an existing (edited) protocol', async () => {
  const p = createProtocols({ dir: await tmpDir() });
  await p.save('compose-portblock', { name: 'Mine', description: '', vars: {}, body: 'EDITED' });
  await seedDefaults(p);
  const got = await p.get('compose-portblock');
  assert.equal(got.body, 'EDITED');
});
