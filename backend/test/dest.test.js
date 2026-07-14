import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, stat } from 'node:fs/promises';
import * as fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDest } from '../src/dest.js';
import { createGit } from '../src/git.js';
import { run } from '../src/lib/exec.js';

// Real git repos on a real filesystem: this module's entire job is answering
// questions about what is on disk, so fakes would prove nothing here.
async function repoRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'am-dest-'));
  const git = createGit(run, { root });
  const dest = createDest({ git, root, fsp });
  return { root, git, dest };
}

async function makeRepo(dir, { origin = 'https://example.com/foo.git' } = {}) {
  await mkdir(dir, { recursive: true });
  const g = (...a) => run('git', ['-C', dir, ...a]);
  await run('git', ['init', '-q', '-b', 'main', dir]);
  await g('config', 'user.email', 'test@example.com');
  await g('config', 'user.name', 'Test');
  await g('remote', 'add', 'origin', origin);
  await writeFile(path.join(dir, 'README.md'), 'hi\n');
  await g('add', '.');
  await g('commit', '-q', '-m', 'init');
}

test('inspect reports exists:false for an absent folder', async () => {
  const { dest } = await repoRoot();
  assert.deepEqual(await dest.inspect('nope', 'https://example.com/nope.git'), { exists: false });
});

test('inspect reports a folder that is not a repo', async () => {
  const { root, dest } = await repoRoot();
  await mkdir(path.join(root, 'plain'));
  const info = await dest.inspect('plain', 'https://example.com/plain.git');
  assert.equal(info.exists, true);
  assert.equal(info.isRepo, false);
  assert.equal(info.sameRepo, false);
});

test('inspect recognises the same repo by origin', async () => {
  const { root, dest } = await repoRoot();
  await makeRepo(path.join(root, 'foo'), { origin: 'https://example.com/foo.git' });
  const info = await dest.inspect('foo', 'https://example.com/foo.git');
  assert.equal(info.isRepo, true);
  assert.equal(info.sameRepo, true);
  assert.equal(info.branch, 'main');
  assert.equal(info.dirtyFiles, 0);
});

test('inspect reports a different repo, and names its origin', async () => {
  const { root, dest } = await repoRoot();
  await makeRepo(path.join(root, 'foo'), { origin: 'https://example.com/someone-else.git' });
  const info = await dest.inspect('foo', 'https://example.com/foo.git');
  assert.equal(info.sameRepo, false);
  assert.equal(info.remoteUrl, 'https://example.com/someone-else.git');
});

test('inspect counts uncommitted work', async () => {
  const { root, dest } = await repoRoot();
  const dir = path.join(root, 'foo');
  await makeRepo(dir);
  await writeFile(path.join(dir, 'README.md'), 'changed\n');
  await writeFile(path.join(dir, 'untracked.txt'), 'new\n');
  const info = await dest.inspect('foo', 'https://example.com/foo.git');
  assert.equal(info.dirtyFiles, 2);
});

test('inspect counts every file inside an untracked directory, not the directory', async () => {
  const { root, dest } = await repoRoot();
  const dir = path.join(root, 'foo');
  await makeRepo(dir);
  // Plain `git status --porcelain` collapses an untracked directory into ONE
  // line however many files it holds — which would tell the user "1 file will
  // be lost" while replace destroys three. git.js passes --untracked-files=all
  // to prevent exactly this; that is what this test guards.
  await mkdir(path.join(dir, 'scaffold'), { recursive: true });
  await writeFile(path.join(dir, 'scaffold', 'a.js'), 'a\n');
  await writeFile(path.join(dir, 'scaffold', 'b.js'), 'b\n');
  await writeFile(path.join(dir, 'scaffold', 'c.js'), 'c\n');
  const info = await dest.inspect('foo', 'https://example.com/foo.git');
  assert.equal(info.dirtyFiles, 3);
});

test('inspect counts commits that are on no remote, including on other branches', async () => {
  const { root, dest } = await repoRoot();
  const dir = path.join(root, 'foo');
  await makeRepo(dir);
  const g = (...a) => run('git', ['-C', dir, ...a]);
  await g('checkout', '-q', '-b', 'side');
  await writeFile(path.join(dir, 'side.txt'), 'x\n');
  await g('add', '.');
  await g('commit', '-q', '-m', 'side work');
  await g('checkout', '-q', 'main');
  // Standing on main, but the at-risk commit lives on `side`.
  const info = await dest.inspect('foo', 'https://example.com/foo.git');
  assert.ok(info.localOnlyCommits >= 1, `expected >=1, got ${info.localOnlyCommits}`);
});

test('remove deletes the folder', async () => {
  const { root, dest } = await repoRoot();
  await makeRepo(path.join(root, 'foo'));
  await dest.remove('foo');
  await assert.rejects(() => stat(path.join(root, 'foo')));
});

test('remove refuses ".." — the regex allows it, containment must not', async () => {
  const { root, dest } = await repoRoot();
  // deriveName('https://host/foo/..') returns the literal '..', which matches
  // /^[A-Za-z0-9._-]+$/. Without the containment check this would rm -rf the
  // PARENT of remoteRoot.
  await assert.rejects(() => dest.remove('..'), /outside|unsafe/);
  await stat(root); // root itself must still be there
});

test('remove refuses names with separators or traversal', async () => {
  const { dest } = await repoRoot();
  await assert.rejects(() => dest.remove('../../etc'), /outside|unsafe/);
  await assert.rejects(() => dest.remove('a/b'), /outside|unsafe/);
  await assert.rejects(() => dest.remove('.'), /outside|unsafe/);
  await assert.rejects(() => dest.remove(''), /outside|unsafe/);
});

test('inspect refuses an unsafe name too', async () => {
  const { dest } = await repoRoot();
  await assert.rejects(() => dest.inspect('..', 'https://example.com/x.git'), /outside|unsafe/);
});
