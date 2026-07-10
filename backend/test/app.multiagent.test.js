import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

test('GET multi-agent returns the stored markdown', async () => {
  const app = createApp({ store: { get: async (n) => (n === 'foo' ? { multiAgentMd: '# hi' } : null) }, config: {} });
  const res = await app.inject({ method: 'GET', url: '/api/projects/foo/multi-agent' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().multiAgentMd, '# hi');
});

test('GET multi-agent 404s for an unknown project', async () => {
  const app = createApp({ store: { get: async () => null }, config: {} });
  const res = await app.inject({ method: 'GET', url: '/api/projects/nope/multi-agent' });
  assert.equal(res.statusCode, 404);
});

test('PUT multi-agent saves and re-drops into every live worktree except coord', async () => {
  const calls = [];
  const app = createApp({
    store: { get: async () => ({ multiAgentMd: 'old' }), setProject: async (n, i) => calls.push(`record ${n} ${JSON.stringify(i)}`) },
    git: { worktreeList: async () => ['/repos/foo', '/repos/foo-detect', '/repos/foo-coord'] },
    multiAgent: { drop: async (dir, md) => calls.push(`drop ${dir} ${md}`) },
    config: { remoteRoot: '/repos' },
  });
  const res = await app.inject({ method: 'PUT', url: '/api/projects/foo/multi-agent', payload: { multiAgentMd: 'new' } });
  assert.equal(res.statusCode, 200);
  assert.ok(calls.includes('record foo {"multiAgentMd":"new"}'));
  assert.ok(calls.includes('drop /repos/foo new'));
  assert.ok(calls.includes('drop /repos/foo-detect new'));
  assert.ok(!calls.includes('drop /repos/foo-coord new'));
});

test('PUT multi-agent 404s for an unknown project', async () => {
  const app = createApp({ store: { get: async () => null }, config: {} });
  const res = await app.inject({ method: 'PUT', url: '/api/projects/nope/multi-agent', payload: { multiAgentMd: 'x' } });
  assert.equal(res.statusCode, 404);
});

test('resync re-renders from the current library protocol and re-drops', async () => {
  const calls = [];
  const app = createApp({
    store: {
      get: async () => ({ protocol: 'compose-portblock', vars: { X: '9' } }),
      setProject: async (n, i) => calls.push(`record ${n} ${JSON.stringify(i)}`),
    },
    protocols: { exists: async () => true, get: async () => ({ body: 'v=${X}', vars: { X: '1' } }) },
    git: { worktreeList: async () => ['/repos/foo'] },
    multiAgent: { drop: async (dir, md) => calls.push(`drop ${dir} ${md}`) },
    config: { remoteRoot: '/repos' },
  });
  const res = await app.inject({ method: 'POST', url: '/api/projects/foo/multi-agent/resync' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().multiAgentMd, 'v=9');
  assert.ok(calls.includes('drop /repos/foo v=9'));
});

test('resync 400s when the project has no protocol', async () => {
  const app = createApp({ store: { get: async () => ({}) }, config: {} });
  const res = await app.inject({ method: 'POST', url: '/api/projects/foo/multi-agent/resync' });
  assert.equal(res.statusCode, 400);
});

test('resync 400s when the stored protocol no longer exists', async () => {
  const app = createApp({
    store: { get: async () => ({ protocol: 'gone', vars: {} }) },
    protocols: { exists: async () => false },
    config: {},
  });
  const res = await app.inject({ method: 'POST', url: '/api/projects/foo/multi-agent/resync' });
  assert.equal(res.statusCode, 400);
});
