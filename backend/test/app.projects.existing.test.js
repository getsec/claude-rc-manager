import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

function ndjson(body) {
  return body.trim().split('\n').map((l) => JSON.parse(l));
}

const base = (over = {}) => ({
  git: { clone: async () => '/repos/foo', currentBranch: async () => 'main' },
  trust: { preseed: async () => {} },
  rc: { set: async () => {} },
  systemd: { enableNow: async () => {}, list: async () => [] },
  store: { get: async () => null, setProject: async () => {} },
  dest: { inspect: async () => ({ exists: false }), remove: async () => {} },
  config: { remoteRoot: '/repos' },
  ...over,
});

test('an existing folder stops provisioning and reports what is there', async () => {
  const app = createApp(base({
    dest: {
      inspect: async () => ({
        exists: true, dir: '/repos/foo', isRepo: true, sameRepo: true,
        remoteUrl: 'https://example.com/foo.git', branch: 'main',
        dirtyFiles: 2, localOnlyCommits: 1,
      }),
      remove: async () => {},
    },
    git: { clone: async () => { throw new Error('clone must not run'); } },
  }));
  const res = await app.inject({ method: 'POST', url: '/api/projects', payload: { url: 'https://example.com/foo.git' } });
  const steps = ndjson(res.body);
  const exists = steps.find((s) => s.step === 'exists');
  assert.ok(exists);
  assert.equal(exists.status, 'fail');
  assert.equal(exists.sameRepo, true);
  assert.equal(exists.dirtyFiles, 2);
  assert.equal(exists.localOnlyCommits, 1);
  assert.ok(!steps.some((s) => s.step === 'clone'));
});

test('reuse skips the clone but still trusts, enables and records', async () => {
  const calls = [];
  const app = createApp(base({
    dest: {
      inspect: async () => ({ exists: true, dir: '/repos/foo', isRepo: true, sameRepo: true, remoteUrl: 'https://example.com/foo.git' }),
      remove: async () => calls.push('remove'),
    },
    git: { clone: async () => { calls.push('clone'); return '/repos/foo'; }, currentBranch: async () => 'main' },
    trust: { preseed: async (d) => calls.push(`trust ${d}`) },
    systemd: { enableNow: async (n) => calls.push(`enable ${n}`), list: async () => [] },
    store: { get: async () => null, setProject: async (n) => calls.push(`record ${n}`) },
  }));
  const res = await app.inject({
    method: 'POST', url: '/api/projects',
    payload: { url: 'https://example.com/foo.git', onExisting: 'reuse' },
  });
  const steps = ndjson(res.body).map((s) => s.step);
  assert.ok(steps.includes('reuse'));
  assert.ok(!steps.includes('clone'));
  assert.ok(steps.includes('done'));
  assert.deepEqual(calls, ['trust /repos/foo', 'enable foo', 'record foo']);
});

test('reuse refuses when the folder is a different repo', async () => {
  const app = createApp(base({
    dest: {
      inspect: async () => ({ exists: true, dir: '/repos/foo', isRepo: true, sameRepo: false, remoteUrl: 'https://example.com/other.git' }),
      remove: async () => {},
    },
    git: { clone: async () => { throw new Error('clone must not run'); } },
  }));
  const res = await app.inject({
    method: 'POST', url: '/api/projects',
    payload: { url: 'https://example.com/foo.git', onExisting: 'reuse' },
  });
  const exists = ndjson(res.body).find((s) => s.step === 'exists');
  assert.equal(exists.status, 'fail');
  assert.match(exists.message, /different repo/);
});

test('replace removes the folder before cloning', async () => {
  const calls = [];
  const app = createApp(base({
    dest: {
      inspect: async () => ({ exists: true, dir: '/repos/foo', isRepo: true, sameRepo: true }),
      remove: async (n) => calls.push(`remove ${n}`),
    },
    git: { clone: async () => { calls.push('clone'); return '/repos/foo'; }, currentBranch: async () => 'main' },
  }));
  const res = await app.inject({
    method: 'POST', url: '/api/projects',
    payload: { url: 'https://example.com/foo.git', onExisting: 'replace' },
  });
  const steps = ndjson(res.body).map((s) => s.step);
  assert.ok(steps.includes('replace'));
  assert.ok(steps.includes('done'));
  // Order matters: cloning into a folder that still exists is the original bug.
  assert.deepEqual(calls, ['remove foo', 'clone']);
});

test('replace refuses while worktree sessions still exist', async () => {
  const calls = [];
  const app = createApp(base({
    dest: {
      inspect: async () => ({ exists: true, dir: '/repos/foo', isRepo: true, sameRepo: true }),
      remove: async (n) => calls.push(`remove ${n}`),
    },
    // Deleting the main checkout would break every worktree hanging off it.
    systemd: { enableNow: async () => {}, list: async () => ['foo', 'foo-feat-x'] },
  }));
  const res = await app.inject({
    method: 'POST', url: '/api/projects',
    payload: { url: 'https://example.com/foo.git', onExisting: 'replace' },
  });
  const exists = ndjson(res.body).find((s) => s.step === 'exists');
  assert.equal(exists.status, 'fail');
  assert.match(exists.message, /worktree sessions/);
  assert.deepEqual(calls, []);
});

test('an already-managed project is refused outright, with no offer', async () => {
  const app = createApp(base({
    store: { get: async () => ({ url: 'https://example.com/foo.git' }), setProject: async () => {} },
    dest: { inspect: async () => { throw new Error('inspect must not run'); }, remove: async () => {} },
  }));
  const res = await app.inject({ method: 'POST', url: '/api/projects', payload: { url: 'https://example.com/foo.git' } });
  const exists = ndjson(res.body).find((s) => s.step === 'exists');
  assert.equal(exists.status, 'fail');
  assert.equal(exists.managed, true);
  assert.match(exists.message, /already a project/);
});

test('a free destination still provisions exactly as before', async () => {
  const app = createApp(base());
  const res = await app.inject({ method: 'POST', url: '/api/projects', payload: { url: 'https://example.com/foo.git' } });
  const steps = ndjson(res.body).map((s) => s.step);
  assert.deepEqual(steps, ['derive', 'clone', 'trust', 'remote-control', 'enable', 'record', 'done']);
});
