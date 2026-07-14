import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRc } from '../src/rc.js';

async function harness() {
  const unitDir = await mkdtemp(path.join(tmpdir(), 'am-rc-'));
  const reloads = [];
  const rc = createRc({ unitDir, daemonReload: async () => reloads.push(1) });
  const dropIn = (i) => path.join(unitDir, `claude-rc@${i}.service.d`, 'rc.conf');
  return { unitDir, rc, reloads, dropIn };
}

test('isEnabled is true when no drop-in exists (template default is RC on)', async () => {
  const { rc } = await harness();
  // Sessions that predate this feature have no drop-in and must keep their RC.
  assert.equal(await rc.isEnabled('legacy'), true);
});

test('set(true) then isEnabled round-trips', async () => {
  const { rc } = await harness();
  await rc.set('app', true);
  assert.equal(await rc.isEnabled('app'), true);
});

test('set(false) then isEnabled round-trips', async () => {
  const { rc } = await harness();
  await rc.set('app', false);
  assert.equal(await rc.isEnabled('app'), false);
});

test('the written drop-in quotes the whole Environment assignment', async () => {
  const { rc, dropIn } = await harness();
  await rc.set('app', true);
  const body = await readFile(dropIn('app'), 'utf8');
  // Unquoted, systemd splits on spaces and parses the rest as further
  // assignments, silently truncating the value to `--remote-control`.
  assert.match(body, /^Environment="AM_RC_ARGS=--remote-control --remote-control-session-name-prefix %i"$/m);
  assert.match(body, /^\[Service\]$/m);
});

test('set reloads the daemon so the new ExecStart is picked up', async () => {
  const { rc, reloads } = await harness();
  await rc.set('app', true);
  assert.equal(reloads.length, 1);
});

test('toggling off then on again leaves RC enabled (no stale value)', async () => {
  const { rc } = await harness();
  await rc.set('app', true);
  await rc.set('app', false);
  await rc.set('app', true);
  assert.equal(await rc.isEnabled('app'), true);
});

test('an unsafe instance name is rejected before touching the filesystem', async () => {
  const { rc } = await harness();
  await assert.rejects(() => rc.set('../../evil', true), /unsafe instance/);
  await assert.rejects(() => rc.isEnabled('../../evil'), /unsafe instance/);
});

test('isEnabled reports false for a hand-written drop-in with an empty value', async () => {
  const { rc, unitDir } = await harness();
  await mkdir(path.join(unitDir, 'claude-rc@hand.service.d'), { recursive: true });
  await writeFile(path.join(unitDir, 'claude-rc@hand.service.d', 'rc.conf'), '[Service]\nEnvironment="AM_RC_ARGS="\n');
  assert.equal(await rc.isEnabled('hand'), false);
});

test('set() does not leave a temp file behind in the drop-in directory', async () => {
  const { rc, unitDir } = await harness();
  await rc.set('app', true);
  const dirPath = path.join(unitDir, 'claude-rc@app.service.d');
  const entries = (await readdir(dirPath)).sort();
  // Only rc.conf should be present; no temp files or other files.
  assert.deepEqual(entries, ['rc.conf']);
});
