import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

test('POST action calls systemd then returns fresh status', async () => {
  const calls = [];
  const app = createApp({
    systemd: {
      list: async () => ['app'],
      restart: async (i) => { calls.push(`restart ${i}`); },
      show: async (i) => ({ instance: i, activeState: 'active', subState: 'running', restarts: 1, enabled: true }),
    },
    store: { all: async () => ({}) },
    config: {},
  });
  const res = await app.inject({ method: 'POST', url: '/api/sessions/app/restart' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().restarts, 1);
  assert.deepEqual(calls, ['restart app']);
});

test('unknown action is rejected', async () => {
  const app = createApp({ systemd: {}, store: {}, config: {} });
  const res = await app.inject({ method: 'POST', url: '/api/sessions/app/frobnicate' });
  assert.equal(res.statusCode, 400);
});

test('restart-all invokes systemd.restartAll', async () => {
  let called = false;
  const app = createApp({ systemd: { restartAll: async () => { called = true; } }, store: {}, config: {} });
  const res = await app.inject({ method: 'POST', url: '/api/restart-all' });
  assert.equal(res.statusCode, 200);
  assert.equal(called, true);
});
