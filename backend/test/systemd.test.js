import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSystemd } from '../src/systemd.js';

function fakeRun(script) {
  const calls = [];
  const run = async (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    const key = args.join(' ');
    const hit = script[key];
    return hit || { code: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

test('list parses instance names from list-units', async () => {
  const { run } = fakeRun({
    '--user list-units --all --type=service --plain --no-legend claude-rc@*':
      { code: 0, stdout: 'claude-rc@triage-cspm.service loaded active running x\nclaude-rc@app.service loaded active running y\n', stderr: '' },
  });
  const sd = createSystemd(run);
  assert.deepEqual(await sd.list(), ['triage-cspm', 'app']);
});

test('show parses properties into a status object', async () => {
  const { run } = fakeRun({
    '--user show claude-rc@app.service --property=ActiveState,SubState,NRestarts,ActiveEnterTimestamp,UnitFileState':
      { code: 0, stdout: 'ActiveState=active\nSubState=running\nNRestarts=2\nActiveEnterTimestamp=Fri 2026-07-10 09:00:00 UTC\nUnitFileState=enabled\n', stderr: '' },
  });
  const sd = createSystemd(run);
  const s = await sd.show('app');
  assert.equal(s.activeState, 'active');
  assert.equal(s.restarts, 2);
  assert.equal(s.enabled, true);
  assert.equal(s.instance, 'app');
});

test('start issues correct argv and throws on failure', async () => {
  const { run, calls } = fakeRun({ '--user start claude-rc@app': { code: 1, stdout: '', stderr: 'boom' } });
  const sd = createSystemd(run);
  await assert.rejects(() => sd.start('app'), /boom/);
  assert.ok(calls.includes('systemctl --user start claude-rc@app'));
});

test('sessionUrl extracts the RC url from the tmux pane', async () => {
  const { run } = fakeRun({
    '-L rc-app capture-pane -p -t claude-rc-app':
      { code: 0, stdout: 'some banner\n  /remote-control is active · https://claude.ai/code/session_01ABCxyz_123\n❯ ', stderr: '' },
  });
  const sd = createSystemd(run);
  assert.equal(await sd.sessionUrl('app'), 'https://claude.ai/code/session_01ABCxyz_123');
});

test('sessionUrl returns null when tmux fails or no url is present', async () => {
  const { run: failRun } = fakeRun({ '-L rc-app capture-pane -p -t claude-rc-app': { code: 1, stdout: '', stderr: 'no server' } });
  assert.equal(await createSystemd(failRun).sessionUrl('app'), null);

  const { run: emptyRun } = fakeRun({ '-L rc-app capture-pane -p -t claude-rc-app': { code: 0, stdout: 'nothing here', stderr: '' } });
  assert.equal(await createSystemd(emptyRun).sessionUrl('app'), null);
});
