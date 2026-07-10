import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

function deps(overrides = {}) {
  return {
    systemd: {
      list: async () => ['app'],
      show: async (i) => ({ instance: i, unit: `claude-rc@${i}.service`, activeState: 'active', subState: 'running', restarts: 0, since: '', enabled: true }),
      ...overrides.systemd,
    },
    store: { all: async () => ({ app: { url: 'u' } }), ...overrides.store },
    config: { remoteRoot: '/repos' },
    git: { ...overrides.git },
  };
}

test('GET /api/state merges sessions and projects', async () => {
  const app = createApp(deps());
  const res = await app.inject({ method: 'GET', url: '/api/state' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.sessions[0].instance, 'app');
  assert.equal(body.projects.app.url, 'u');
});

test('GET /api/sessions/:instance/url returns the captured session url', async () => {
  const app = createApp(deps({ systemd: { sessionUrl: async () => 'https://claude.ai/code/session_x' } }));
  const res = await app.inject({ method: 'GET', url: '/api/sessions/app/url' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().url, 'https://claude.ai/code/session_x');
});

test('GET /api/sessions/:instance/url returns null when no url is available', async () => {
  const app = createApp(deps({ systemd: { sessionUrl: async () => null } }));
  const res = await app.inject({ method: 'GET', url: '/api/sessions/app/url' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().url, null);
});

test('GET /api/sessions/:instance/git returns branch with no diff for a primary session', async () => {
  const app = createApp(deps({
    git: { currentBranch: async () => 'main', diffStat: async () => { throw new Error('should not be called'); } },
  }));
  const res = await app.inject({ method: 'GET', url: '/api/sessions/app/git' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { branch: 'main', added: 0, removed: 0 });
});

test('GET /api/sessions/:instance/git diffs a worktree session against its project\'s branch', async () => {
  const app = createApp(deps({
    git: {
      currentBranch: async (dir) => (dir === '/repos/app' ? 'main' : 'feat/detect'),
      diffStat: async (dir, base) => { assert.equal(dir, '/repos/app-detect'); assert.equal(base, 'main'); return { added: 42, removed: 7 }; },
    },
  }));
  const res = await app.inject({ method: 'GET', url: '/api/sessions/app-detect/git' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { branch: 'feat/detect', added: 42, removed: 7 });
});

test('GET /api/sessions/:instance/git tolerates a missing worktree', async () => {
  const app = createApp(deps({ git: { currentBranch: async () => { throw new Error('no such dir'); } } }));
  const res = await app.inject({ method: 'GET', url: '/api/sessions/gone/git' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { branch: null, added: 0, removed: 0 });
});
