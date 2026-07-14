import path from 'node:path';

async function ok(promise) {
  const r = await promise;
  if (r.code !== 0) throw new Error(r.stderr.trim() || `git exit ${r.code}`);
  return r;
}

export function createGit(run, { root }) {
  const git = (...args) => run('git', args);
  return {
    async clone(url, name) {
      const dest = `${root}/${name}`;
      await ok(git('clone', url, dest));
      return dest;
    },
    async remoteUrl(dir) {
      const { stdout } = await ok(git('-C', dir, 'remote', 'get-url', 'origin'));
      return stdout.trim();
    },
    async currentBranch(dir) {
      const { stdout } = await ok(git('-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'));
      return stdout.trim();
    },
    async worktreeAdd(mainDir, worktreeDir, branch) {
      await ok(git('-C', mainDir, 'worktree', 'add', worktreeDir, '-b', branch));
    },
    async worktreeRemove(mainDir, worktreeDir, { force = false } = {}) {
      const args = ['-C', mainDir, 'worktree', 'remove'];
      if (force) args.push('--force');
      args.push(worktreeDir);
      await ok(git(...args));
    },
    async worktreeList(mainDir) {
      const { stdout } = await ok(git('-C', mainDir, 'worktree', 'list', '--porcelain'));
      return stdout.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice('worktree '.length));
    },
    async commonGitDir(dir) {
      const { stdout } = await ok(git('-C', dir, 'rev-parse', '--git-common-dir'));
      const p = stdout.trim();
      return path.isAbsolute(p) ? p : path.join(dir, p);
    },
    async diffStat(dir, baseBranch) {
      const { stdout } = await ok(git('-C', dir, 'diff', '--shortstat', `${baseBranch}...HEAD`));
      const ins = /(\d+) insertion/.exec(stdout);
      const del = /(\d+) deletion/.exec(stdout);
      return { added: ins ? Number(ins[1]) : 0, removed: del ? Number(del[1]) : 0 };
    },
    async dirtyCount(dir) {
      // --untracked-files=all is load-bearing: without it, git status --porcelain
      // collapses an entire untracked directory to a single ?? line, silently undercounting
      // the work that would be destroyed in a replace (delete + re-clone).
      const { stdout } = await ok(git('-C', dir, 'status', '--porcelain', '--untracked-files=all'));
      return stdout.split('\n').filter((l) => l.trim()).length;
    },
    // Commits that exist on no remote, across ALL branches — not just the one
    // checked out. This is the work a replace would destroy irrecoverably.
    // Note: --branches only expands refs/heads/*, so commits reachable only from a
    // detached HEAD are invisible to this count. This is a known blind spot.
    async localOnlyCount(dir) {
      const { stdout } = await ok(git('-C', dir, 'log', '--branches', '--not', '--remotes', '--format=%H'));
      return stdout.split('\n').filter((l) => l.trim()).length;
    },
  };
}
