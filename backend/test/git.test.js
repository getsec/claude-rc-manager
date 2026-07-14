import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGit } from '../src/git.js';

function recorder(script = {}) {
  const calls = [];
  const run = async (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    return script[args.join(' ')] || { code: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

test('clone shells git clone into root/name and returns dest', async () => {
  const { run, calls } = recorder();
  const git = createGit(run, { root: '/repos' });
  const dest = await git.clone('https://x/y.git', 'y');
  assert.equal(dest, '/repos/y');
  assert.ok(calls.includes('git clone https://x/y.git /repos/y'));
});

test('worktreeList parses porcelain output', async () => {
  const { run } = recorder({
    '-C /repos/y worktree list --porcelain':
      { code: 0, stdout: 'worktree /repos/y\nHEAD abc\nbranch refs/heads/main\n\nworktree /repos/y-detect\nHEAD def\n', stderr: '' },
  });
  const git = createGit(run, { root: '/repos' });
  assert.deepEqual(await git.worktreeList('/repos/y'), ['/repos/y', '/repos/y-detect']);
});

test('clone throws on failure', async () => {
  const { run } = recorder({ 'clone https://x/y.git /repos/y': { code: 128, stdout: '', stderr: 'fatal: repo not found' } });
  const git = createGit(run, { root: '/repos' });
  await assert.rejects(() => git.clone('https://x/y.git', 'y'), /repo not found/);
});

test('commonGitDir resolves a relative --git-common-dir against the worktree dir', async () => {
  const { run } = recorder({
    '-C /repos/y-detect rev-parse --git-common-dir': { code: 0, stdout: '../y/.git\n', stderr: '' },
  });
  const git = createGit(run, { root: '/repos' });
  assert.equal(await git.commonGitDir('/repos/y-detect'), '/repos/y/.git');
});

test('commonGitDir returns an absolute path unchanged', async () => {
  const { run } = recorder({
    '-C /repos/y rev-parse --git-common-dir': { code: 0, stdout: '/repos/y/.git\n', stderr: '' },
  });
  const git = createGit(run, { root: '/repos' });
  assert.equal(await git.commonGitDir('/repos/y'), '/repos/y/.git');
});

test('diffStat parses insertions and deletions from shortstat', async () => {
  const { run } = recorder({
    '-C /repos/y-detect diff --shortstat main...HEAD':
      { code: 0, stdout: ' 3 files changed, 42 insertions(+), 7 deletions(-)\n', stderr: '' },
  });
  const git = createGit(run, { root: '/repos' });
  assert.deepEqual(await git.diffStat('/repos/y-detect', 'main'), { added: 42, removed: 7 });
});

test('diffStat defaults missing insertions/deletions to 0', async () => {
  const { run } = recorder({
    '-C /repos/y-detect diff --shortstat main...HEAD':
      { code: 0, stdout: ' 1 file changed, 5 insertions(+)\n', stderr: '' },
  });
  const git = createGit(run, { root: '/repos' });
  assert.deepEqual(await git.diffStat('/repos/y-detect', 'main'), { added: 5, removed: 0 });
});

test('diffStat is zero/zero when there is no diff at all', async () => {
  const { run } = recorder({
    '-C /repos/y-detect diff --shortstat main...HEAD': { code: 0, stdout: '', stderr: '' },
  });
  const git = createGit(run, { root: '/repos' });
  assert.deepEqual(await git.diffStat('/repos/y-detect', 'main'), { added: 0, removed: 0 });
});

test('dirtyCount counts porcelain lines', async () => {
  const calls = [];
  const g = createGit(async (cmd, args) => {
    calls.push(args.join(' '));
    return { code: 0, stdout: ' M src/a.js\n?? new.txt\n', stderr: '' };
  }, { root: '/repos' });
  assert.equal(await g.dirtyCount('/repos/foo'), 2);
  assert.ok(calls.includes('-C /repos/foo status --porcelain'));
});

test('dirtyCount is 0 for a clean tree', async () => {
  const g = createGit(async () => ({ code: 0, stdout: '', stderr: '' }), { root: '/repos' });
  assert.equal(await g.dirtyCount('/repos/foo'), 0);
});

test('localOnlyCount counts commits that are on no remote, across all branches', async () => {
  const calls = [];
  const g = createGit(async (cmd, args) => {
    calls.push(args.join(' '));
    return { code: 0, stdout: 'abc\ndef\n', stderr: '' };
  }, { root: '/repos' });
  assert.equal(await g.localOnlyCount('/repos/foo'), 2);
  // --branches (not HEAD): work stranded on a branch you are not standing on
  // is exactly what a replace would destroy irrecoverably.
  assert.ok(calls.includes('-C /repos/foo log --branches --not --remotes --format=%H'));
});

test('both counts reject rather than reporting a false zero when git fails', async () => {
  const g = createGit(async () => ({ code: 128, stdout: '', stderr: 'not a git repository' }), { root: '/repos' });
  await assert.rejects(() => g.dirtyCount('/repos/foo'), /not a git repository/);
  await assert.rejects(() => g.localOnlyCount('/repos/foo'), /not a git repository/);
});
