import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const session = (i) => ({
  instance: i, unit: `claude-rc@${i}.service`, activeState: 'active',
  subState: 'running', restarts: 0, since: '', enabled: true,
});

test('GET /api/state reports remoteControl per session', async () => {
  const app = createApp({
    systemd: { list: async () => ['app'], show: async (i) => session(i) },
    store: { all: async () => ({}) },
    rc: { isEnabled: async () => false },
    config: {},
  });
  const res = await app.inject({ method: 'GET', url: '/api/state' });
  assert.equal(JSON.parse(res.body).sessions[0].remoteControl, false);
});

test('POST remote-control sets the drop-in then restarts an active session', async () => {
  const calls = [];
  const app = createApp({
    systemd: {
      show: async (i) => session(i),
      restart: async (i) => calls.push(`restart ${i}`),
    },
    rc: { isEnabled: async () => true, set: async (i, e) => calls.push(`set ${i} ${e}`) },
    store: {}, config: {},
  });
  const res = await app.inject({
    method: 'POST', url: '/api/sessions/app/remote-control', payload: { enabled: true },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).remoteControl, true);
  // Order matters: the drop-in must land before the restart, or the restart
  // re-runs the old command.
  assert.deepEqual(calls, ['set app true', 'restart app']);
});

test('POST remote-control skips the restart for a stopped session', async () => {
  const calls = [];
  const app = createApp({
    systemd: {
      show: async (i) => ({ ...session(i), activeState: 'inactive', subState: 'dead' }),
      restart: async (i) => calls.push(`restart ${i}`),
    },
    rc: { isEnabled: async () => false, set: async (i, e) => calls.push(`set ${i} ${e}`) },
    store: {}, config: {},
  });
  const res = await app.inject({
    method: 'POST', url: '/api/sessions/app/remote-control', payload: { enabled: false },
  });
  assert.equal(res.statusCode, 200);
  // Nothing to lose and nothing running: it will start correctly next time.
  assert.deepEqual(calls, ['set app false']);
});

test('POST remote-control does NOT restart when writing the drop-in fails', async () => {
  const calls = [];
  const app = createApp({
    systemd: { show: async (i) => session(i), restart: async (i) => calls.push(`restart ${i}`) },
    // A failed daemon-reload means the unit still has the old config: a
    // restart would silently run the old command.
    rc: { set: async () => { throw new Error('daemon-reload failed'); } },
    store: {}, config: {},
  });
  const res = await app.inject({
    method: 'POST', url: '/api/sessions/app/remote-control', payload: { enabled: true },
  });
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /daemon-reload failed/);
  assert.deepEqual(calls, []);
});

test('adding a session writes the drop-in BEFORE enabling the unit', async () => {
  const calls = [];
  const app = createApp({
    coord: { hasCoord: async () => true, addSessionRow: async () => {} },
    git: { worktreeAdd: async () => {} },
    trust: { preseed: async () => {} },
    systemd: { enableNow: async (i) => calls.push(`enable ${i}`) },
    rc: { set: async (i, e) => calls.push(`rc ${i} ${e}`) },
    store: { get: async () => null },
    config: { remoteRoot: '/repos' },
  });
  const res = await app.inject({
    method: 'POST', url: '/api/projects/foo/sessions',
    payload: { branch: 'feat/x', remoteControl: true },
  });
  assert.equal(res.statusCode, 200);
  // Born correct, rather than started and then fixed.
  assert.deepEqual(calls, ['rc foo-feat-x true', 'enable foo-feat-x']);
});

test('adding a session defaults remoteControl to off when unspecified', async () => {
  const calls = [];
  const app = createApp({
    coord: { hasCoord: async () => true, addSessionRow: async () => {} },
    git: { worktreeAdd: async () => {} },
    trust: { preseed: async () => {} },
    systemd: { enableNow: async () => {} },
    rc: { set: async (i, e) => calls.push(`rc ${i} ${e}`) },
    store: { get: async () => null },
    config: { remoteRoot: '/repos' },
  });
  await app.inject({
    method: 'POST', url: '/api/projects/foo/sessions', payload: { branch: 'feat/x' },
  });
  assert.deepEqual(calls, ['rc foo-feat-x false']);
});
