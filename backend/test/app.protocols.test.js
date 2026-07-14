import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createProtocols } from '../src/protocols.js';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function fakeProtocols() {
  const store = new Map();
  return {
    store,
    list: async () => [...store.entries()].map(([slug, v]) => ({ slug, name: v.name, description: v.description, vars: v.vars })),
    get: async (slug) => {
      if (slug === 'bad/slug') throw new Error('invalid protocol slug: ' + slug);
      if (!store.has(slug)) { const e = new Error('missing'); e.code = 'ENOENT'; throw e; }
      return { slug, ...store.get(slug) };
    },
    save: async (slug, v) => { store.set(slug, v); },
    remove: async (slug) => { store.delete(slug); },
    exists: async (slug) => store.has(slug),
  };
}

function appWith(protocols) {
  return createApp({ systemd: {}, store: {}, config: {}, protocols });
}

test('PUT then GET a protocol round-trips', async () => {
  const app = appWith(fakeProtocols());
  const put = await app.inject({ method: 'PUT', url: '/api/protocols/demo', payload: { name: 'Demo', description: 'd', vars: { X: '1' }, body: 'hi' } });
  assert.equal(put.statusCode, 200);
  const got = await app.inject({ method: 'GET', url: '/api/protocols/demo' });
  assert.equal(got.statusCode, 200);
  assert.equal(got.json().body, 'hi');
});

test('GET list returns saved protocols without bodies', async () => {
  const p = fakeProtocols();
  await p.save('demo', { name: 'Demo', description: '', vars: {}, body: 'x' });
  const res = await appWith(p).inject({ method: 'GET', url: '/api/protocols' });
  assert.equal(res.json()[0].slug, 'demo');
});

test('GET missing protocol is 404', async () => {
  const res = await appWith(fakeProtocols()).inject({ method: 'GET', url: '/api/protocols/nope' });
  assert.equal(res.statusCode, 404);
});

test('DELETE removes a protocol', async () => {
  const p = fakeProtocols();
  await p.save('demo', { name: 'D', description: '', vars: {}, body: 'x' });
  const res = await appWith(p).inject({ method: 'DELETE', url: '/api/protocols/demo' });
  assert.equal(res.statusCode, 200);
  assert.equal(p.store.has('demo'), false);
});

test('GET an absent-but-valid slug returns 404 against the real protocols module', async () => {
  const dir = path.join(await mkdtemp(path.join(os.tmpdir(), 'am-p3-')), 'protocols');
  const app = createApp({ systemd: {}, store: {}, config: {}, protocols: createProtocols({ dir }) });
  const res = await app.inject({ method: 'GET', url: '/api/protocols/nope' });
  assert.equal(res.statusCode, 404);
});
