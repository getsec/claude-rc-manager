import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

function ndjson(body) {
  return body.trim().split('\n').map((l) => JSON.parse(l));
}

test('blocks when no coord exists', async () => {
  const app = createApp({
    coord: { hasCoord: async () => false },
    git: {}, trust: {}, systemd: {}, store: {}, config: { remoteRoot: '/repos' },
  });
  const res = await app.inject({ method: 'POST', url: '/api/projects/foo/sessions', payload: { branch: 'feat/x' } });
  const steps = ndjson(res.body);
  assert.equal(steps[0].step, 'coord');
  assert.equal(steps[0].status, 'fail');
  assert.equal(steps.length, 1);
});

test('creates worktree session when coord exists', async () => {
  const calls = [];
  const app = createApp({
    coord: { hasCoord: async () => true, addSessionRow: async (n, r) => calls.push(`row ${n} ${r.worktree} ${r.branch}`) },
    git: { worktreeAdd: async (m, w, b) => calls.push(`wt ${m} ${w} ${b}`) },
    trust: { preseed: async (p) => calls.push(`trust ${p}`) },
    systemd: { enableNow: async (i) => calls.push(`enable ${i}`) },
    store: { get: async () => null },
    config: { remoteRoot: '/repos' },
  });
  const res = await app.inject({ method: 'POST', url: '/api/projects/foo/sessions', payload: { branch: 'feat/Detection Advisor' } });
  const steps = ndjson(res.body).map((s) => s.step);
  assert.deepEqual(steps, ['worktree', 'trust', 'coord-row', 'enable', 'done']);
  assert.ok(calls.includes('wt /repos/foo /repos/foo-feat-detection-advisor feat/Detection Advisor'));
  assert.ok(calls.includes('trust /repos/foo-feat-detection-advisor'));
  assert.ok(calls.includes('enable foo-feat-detection-advisor'));
});

test('drops MULTI_AGENT.md into the new worktree when the project is multi-session', async () => {
  const calls = [];
  const app = createApp({
    coord: { hasCoord: async () => true, addSessionRow: async () => calls.push('row') },
    git: { worktreeAdd: async () => calls.push('wt') },
    trust: { preseed: async () => calls.push('trust') },
    systemd: { enableNow: async () => calls.push('enable') },
    store: { get: async () => ({ multiAgentMd: '# hi' }) },
    multiAgent: { drop: async (dir, md) => calls.push(`drop ${dir} ${md}`) },
    config: { remoteRoot: '/repos' },
  });
  const res = await app.inject({ method: 'POST', url: '/api/projects/foo/sessions', payload: { branch: 'feat/x' } });
  const steps = ndjson(res.body).map((s) => s.step);
  assert.deepEqual(steps, ['worktree', 'trust', 'multi-agent', 'coord-row', 'enable', 'done']);
  assert.ok(calls.includes('drop /repos/foo-feat-x # hi'));
});

test('DELETE /api/sessions/:instance stops+disables the unit and removes its worktree', async () => {
  const calls = [];
  const app = createApp({
    store: { all: async () => ({ foo: { url: 'u' } }) },
    systemd: { disableNow: async (i) => calls.push(`disable ${i}`) },
    git: { worktreeRemove: async (m, w) => calls.push(`wtremove ${m} ${w}`) },
    config: { remoteRoot: '/repos' },
  });
  const res = await app.inject({ method: 'DELETE', url: '/api/sessions/foo-detect' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, ['disable foo-detect', 'wtremove /repos/foo /repos/foo-detect']);
});

test('DELETE /api/sessions rejects a primary project session (use project delete instead)', async () => {
  const app = createApp({ store: { all: async () => ({ foo: {} }) }, systemd: {}, git: {}, config: { remoteRoot: '/repos' } });
  const res = await app.inject({ method: 'DELETE', url: '/api/sessions/foo' });
  assert.equal(res.statusCode, 400);
});

test('DELETE /api/sessions 404s when no known project owns the instance', async () => {
  const app = createApp({ store: { all: async () => ({}) }, systemd: {}, git: {}, config: { remoteRoot: '/repos' } });
  const res = await app.inject({ method: 'DELETE', url: '/api/sessions/orphan-x' });
  assert.equal(res.statusCode, 404);
});
