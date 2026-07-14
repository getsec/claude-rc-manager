import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

function ndjson(body) {
  return body.trim().split('\n').map((l) => JSON.parse(l));
}

test('POST /api/projects/:name/multi-session scaffolds coord and drops MULTI_AGENT.md into every worktree except coord', async () => {
  const calls = [];
  const app = createApp({
    store: {
      get: async (n) => (n === 'foo' ? { url: 'u' } : null),
      setProject: async (n, info) => calls.push(`record ${n} ${JSON.stringify(info)}`),
    },
    git: {
      currentBranch: async () => 'main',
      worktreeList: async () => ['/repos/foo', '/repos/foo-detect', '/repos/foo-coord'],
    },
    coord: { scaffold: async (n, r) => { calls.push(`scaffold ${n} ${r.primaryBranch}`); return true; } },
    protocols: { exists: async () => true, get: async () => ({ body: 'Hi ${PROJECT}', vars: {} }) },
    multiAgent: { drop: async (dir) => calls.push(`drop ${dir}`) },
    config: { remoteRoot: '/repos' },
  });
  const res = await app.inject({ method: 'POST', url: '/api/projects/foo/multi-session', payload: { protocol: 'compose-portblock' } });
  const steps = ndjson(res.body);
  assert.deepEqual(steps.map((s) => s.step), ['coord', 'multi-agent', 'done']);
  assert.ok(calls.includes('drop /repos/foo'));
  assert.ok(calls.includes('drop /repos/foo-detect'));
  assert.ok(!calls.includes('drop /repos/foo-coord'));
});

test('errors for an unknown project', async () => {
  const app = createApp({ store: { get: async () => null }, config: { remoteRoot: '/repos' } });
  const res = await app.inject({ method: 'POST', url: '/api/projects/nope/multi-session', payload: {} });
  const steps = ndjson(res.body);
  assert.equal(steps[0].step, 'error');
});

test('errors for an unknown protocol', async () => {
  const app = createApp({
    store: { get: async () => ({ url: 'u' }) },
    protocols: { exists: async () => false },
    config: { remoteRoot: '/repos' },
  });
  const res = await app.inject({ method: 'POST', url: '/api/projects/foo/multi-session', payload: { protocol: 'nope' } });
  const steps = ndjson(res.body);
  assert.equal(steps[0].step, 'error');
  assert.match(steps[0].message, /no such protocol/);
});
