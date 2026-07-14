import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

function ndjson(body) {
  return body.trim().split('\n').map((l) => JSON.parse(l));
}

test('POST /api/projects streams clone→trust→enable→record→done', async () => {
  const calls = [];
  const app = createApp({
    systemd: { enableNow: async (n) => calls.push(`enable ${n}`), list: async () => [] },
    git: { clone: async (url, name) => { calls.push(`clone ${name}`); return `/repos/${name}`; } },
    trust: { preseed: async (p) => calls.push(`trust ${p}`) },
    store: { setProject: async (n) => calls.push(`record ${n}`), all: async () => ({}) },
    rc: { set: async () => {}, isEnabled: async () => true },
    config: { remoteRoot: '/repos' },
  });
  const res = await app.inject({ method: 'POST', url: '/api/projects', payload: { url: 'https://x/foo.git' } });
  const steps = ndjson(res.body).map((s) => s.step);
  assert.deepEqual(steps, ['derive', 'clone', 'trust', 'remote-control', 'enable', 'record', 'done']);
  assert.deepEqual(calls, ['clone foo', 'trust /repos/foo', 'enable foo', 'record foo']);
});

test('POST /api/projects emits error step and stops on clone failure', async () => {
  const app = createApp({
    systemd: { enableNow: async () => {} },
    git: { clone: async () => { throw new Error('repo not found'); } },
    trust: { preseed: async () => { throw new Error('should not reach'); } },
    store: { setProject: async () => {} },
    config: { remoteRoot: '/repos' },
  });
  const res = await app.inject({ method: 'POST', url: '/api/projects', payload: { url: 'https://x/foo.git' } });
  const steps = ndjson(res.body);
  const err = steps.find((s) => s.step === 'error');
  assert.ok(err);
  assert.match(err.message, /repo not found/);
  assert.equal(steps.find((s) => s.step === 'trust'), undefined);
});

test('DELETE /api/projects refuses when worktree sessions exist', async () => {
  const app = createApp({
    systemd: { list: async () => ['foo', 'foo-detect'], disableNow: async () => {} },
    store: { deleteProject: async () => {} },
    config: {},
  });
  const res = await app.inject({ method: 'DELETE', url: '/api/projects/foo' });
  assert.equal(res.statusCode, 409);
});

test('POST /api/projects rejects an unsafe git URL before cloning', async () => {
  let cloned = false;
  const app = createApp({
    systemd: { enableNow: async () => {} },
    git: { clone: async () => { cloned = true; return '/x'; } },
    trust: { preseed: async () => {} },
    store: { setProject: async () => {} },
    config: { remoteRoot: '/repos' },
  });
  const res = await app.inject({ method: 'POST', url: '/api/projects', payload: { url: 'ext::sh -c touch/**/pwned' } });
  const steps = res.body.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(steps[0].step, 'validate');
  assert.equal(steps[0].status, 'fail');
  assert.equal(cloned, false);
});

test('POST /api/projects with multiSession scaffolds coord and drops MULTI_AGENT.md', async () => {
  const calls = [];
  const app = createApp({
    systemd: { enableNow: async (n) => calls.push(`enable ${n}`), list: async () => [] },
    git: {
      clone: async (url, name) => { calls.push(`clone ${name}`); return `/repos/${name}`; },
      currentBranch: async () => 'main',
    },
    trust: { preseed: async (p) => calls.push(`trust ${p}`) },
    store: { setProject: async (n, info) => calls.push(`record ${n} ${JSON.stringify(info)}`), all: async () => ({}) },
    coord: { scaffold: async (n, r) => calls.push(`scaffold ${n} ${r.primaryWorktree} ${r.primaryBranch}`) },
    protocols: { exists: async () => true, get: async (slug) => ({ slug, body: 'Hi ${PROJECT}', vars: { X: '1' } }) },
    multiAgent: { drop: async (dir, md) => calls.push(`drop ${dir} ${md}`) },
    rc: { set: async () => {}, isEnabled: async () => true },
    config: { remoteRoot: '/repos' },
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/projects',
    payload: { url: 'https://x/foo.git', multiSession: true, protocol: 'compose-portblock', vars: {} },
  });
  const steps = res.body.trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(steps.map((s) => s.step), ['derive', 'clone', 'trust', 'remote-control', 'enable', 'record', 'coord', 'multi-agent', 'done']);
  assert.ok(calls.includes('scaffold foo foo main'));
  assert.ok(calls.includes('drop /repos/foo Hi foo'));
});

test('POST /api/projects with multiSession fails cleanly on an unknown protocol', async () => {
  const app = createApp({
    systemd: { enableNow: async () => {} },
    git: { clone: async (url, name) => `/repos/${name}`, currentBranch: async () => 'main' },
    trust: { preseed: async () => {} },
    store: { setProject: async () => {} },
    coord: { scaffold: async () => {} },
    protocols: { exists: async () => false, get: async () => { throw new Error('should not be called'); } },
    multiAgent: { drop: async () => { throw new Error('should not be called'); } },
    rc: { set: async () => {}, isEnabled: async () => true },
    config: { remoteRoot: '/repos' },
  });
  const res = await app.inject({
    method: 'POST', url: '/api/projects',
    payload: { url: 'https://x/foo.git', multiSession: true, protocol: 'nope' },
  });
  const steps = res.body.trim().split('\n').map((l) => JSON.parse(l));
  const err = steps.find((s) => s.step === 'error');
  assert.ok(err);
  assert.match(err.message, /no such protocol/);
});
