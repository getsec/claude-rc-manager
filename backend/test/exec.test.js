import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, stream } from '../src/lib/exec.js';

test('run captures stdout and zero exit', async () => {
  const r = await run('printf', ['hello']);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'hello');
});

test('run reports non-zero exit without throwing', async () => {
  const r = await run('false', []);
  assert.equal(r.code, 1);
});

test('run reports spawn error as code -1', async () => {
  const r = await run('this-binary-does-not-exist-xyz', []);
  assert.equal(r.code, -1);
  assert.ok(r.stderr.length > 0);
});

test('stream emits lines and flushes a trailing line with no newline', async () => {
  const lines = [];
  await new Promise((resolve) => {
    stream('printf', ['a\nb\nc'], (l) => lines.push(l), resolve);
  });
  assert.deepEqual(lines, ['a', 'b', 'c']);
});

test('stream calls onClose exactly once on spawn error', async () => {
  let closes = 0;
  await new Promise((resolve) => {
    stream('this-binary-does-not-exist-xyz', [], () => {}, () => { closes++; resolve(); });
  });
  assert.equal(closes, 1);
});
