import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../src/store.js';

async function tmpState() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'am-store-'));
  return path.join(dir, 'nested', 'state.json');
}

test('missing file reads as empty projects', async () => {
  const store = createStore(await tmpState());
  assert.deepEqual(await store.all(), {});
});

test('setProject then get round-trips and merges', async () => {
  const store = createStore(await tmpState());
  await store.setProject('foo', { url: 'https://x/foo.git' });
  await store.setProject('foo', { coord: 'foo-coord' });
  assert.deepEqual(await store.get('foo'), { url: 'https://x/foo.git', coord: 'foo-coord' });
});

test('deleteProject removes it', async () => {
  const store = createStore(await tmpState());
  await store.setProject('foo', { url: 'u' });
  await store.deleteProject('foo');
  assert.equal(await store.get('foo'), null);
});
