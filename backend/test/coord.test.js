import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCoord } from '../src/coord.js';

async function tmpRoot() {
  return mkdtemp(path.join(os.tmpdir(), 'am-coord-'));
}

test('hasCoord is true only when <name>-coord dir exists', async () => {
  const root = await tmpRoot();
  await mkdir(path.join(root, 'proj-coord'), { recursive: true });
  const coord = createCoord(async () => ({ code: 0, stdout: '', stderr: '' }), { root });
  assert.equal(await coord.hasCoord('proj'), true);
  assert.equal(await coord.hasCoord('nope'), false);
});

test('addSessionRow appends a row and commits', async () => {
  const root = await tmpRoot();
  const dir = path.join(root, 'proj-coord');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'SESSIONS.md'), '| header |\n');
  const calls = [];
  const run = async (cmd, args) => { calls.push([cmd, ...args].join(' ')); return { code: 0, stdout: '', stderr: '' }; };
  const coord = createCoord(run, { root });
  await coord.addSessionRow('proj', { worktree: 'proj-detect', branch: 'feat/x', date: '2026-07-10' });
  const md = await readFile(path.join(dir, 'SESSIONS.md'), 'utf8');
  assert.match(md, /proj-detect/);
  assert.match(md, /feat\/x/);
  assert.ok(calls.some((c) => c.includes('add SESSIONS.md')));
  assert.ok(calls.some((c) => c.includes('commit')));
});

test('scaffold creates the coord worktree + SESSIONS.md when absent', async () => {
  const root = await tmpRoot();
  await mkdir(path.join(root, 'proj'), { recursive: true });
  const calls = [];
  const run = async (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    if (args[2] === 'worktree' && args[3] === 'add') {
      await mkdir(args[4], { recursive: true });
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  const coord = createCoord(run, { root });
  const created = await coord.scaffold('proj', { primaryWorktree: 'proj', primaryBranch: 'main', date: '2026-07-10' });
  assert.equal(created, true);
  const md = await readFile(path.join(root, 'proj-coord', 'SESSIONS.md'), 'utf8');
  assert.match(md, /\| proj \| main \|/);
  assert.ok(calls.some((c) => c.includes('worktree add')));
  assert.ok(calls.some((c) => c.includes('commit')));
});

test('scaffold is idempotent — skips (no git calls) if the coord dir already exists', async () => {
  const root = await tmpRoot();
  await mkdir(path.join(root, 'proj-coord'), { recursive: true });
  const calls = [];
  const run = async (cmd, args) => { calls.push([cmd, ...args].join(' ')); return { code: 0, stdout: '', stderr: '' }; };
  const coord = createCoord(run, { root });
  const created = await coord.scaffold('proj', { primaryWorktree: 'proj', primaryBranch: 'main', date: '2026-07-10' });
  assert.equal(created, false);
  assert.deepEqual(calls, []);
});
