import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProtocols, isValidSlug, render } from '../src/protocols.js';

async function tmpDir() {
  return path.join(await mkdtemp(path.join(os.tmpdir(), 'am-proto-')), 'protocols');
}

test('isValidSlug accepts kebab, rejects traversal and junk', () => {
  assert.equal(isValidSlug('compose-portblock'), true);
  assert.equal(isValidSlug('a1'), true);
  assert.equal(isValidSlug('../evil'), false);
  assert.equal(isValidSlug('Has Space'), false);
  assert.equal(isValidSlug(''), false);
});

test('render substitutes known vars and leaves unknown literal', () => {
  assert.equal(render('a=${A} b=${B}', { A: '1' }), 'a=1 b=${B}');
});

test('list is empty when the dir does not exist', async () => {
  const p = createProtocols({ dir: await tmpDir() });
  assert.deepEqual(await p.list(), []);
});

test('save then get round-trips; list omits body', async () => {
  const dir = await tmpDir();
  const p = createProtocols({ dir });
  await p.save('demo', { name: 'Demo', description: 'd', vars: { X: '9' }, body: '# hi ${X}' });
  const got = await p.get('demo');
  assert.equal(got.name, 'Demo');
  assert.equal(got.body, '# hi ${X}');
  assert.deepEqual(got.vars, { X: '9' });
  const listed = await p.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].slug, 'demo');
  assert.equal('body' in listed[0], false);
  // files exist on disk
  await readFile(path.join(dir, 'demo', 'protocol.md'), 'utf8');
});

test('remove deletes the protocol', async () => {
  const p = createProtocols({ dir: await tmpDir() });
  await p.save('demo', { name: 'Demo', description: '', vars: {}, body: 'x' });
  await p.remove('demo');
  assert.deepEqual(await p.list(), []);
});

test('get/save/remove reject invalid slugs', async () => {
  const p = createProtocols({ dir: await tmpDir() });
  await assert.rejects(() => p.get('../etc'), /invalid protocol slug/);
  await assert.rejects(() => p.save('bad slug', { name: 'x', body: 'y' }), /invalid protocol slug/);
});
