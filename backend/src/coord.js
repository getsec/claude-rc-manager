import { stat, appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function ok(promise) {
  const r = await promise;
  if (r.code !== 0) throw new Error(r.stderr.trim() || `exit ${r.code}`);
  return r;
}

async function dirExists(p) {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

const SESSIONS_HEADER = `# Active sessions

One row per active session. Claiming a row = reserving that port block. Mark
\`done\` on teardown to free it. Keep the primary row as-is.

| Worktree | Branch | COMPOSE_PROJECT_NAME | Ports (pg/api/web) | Task | Status | Updated |
|---|---|---|---|---|---|---|
`;

export function createCoord(run, { root }) {
  const coordDir = (name) => path.join(root, `${name}-coord`);
  return {
    coordDir,
    async hasCoord(name) {
      return dirExists(coordDir(name));
    },
    async scaffold(name, { primaryWorktree, primaryBranch, date }) {
      const dir = coordDir(name);
      if (await dirExists(dir)) return false;
      const mainDir = path.join(root, name);
      await ok(run('git', ['-C', mainDir, 'worktree', 'add', dir, '-b', 'coordination']));
      const row = `| ${primaryWorktree} | ${primaryBranch} | — | — | — | active | ${date} |\n`;
      await writeFile(path.join(dir, 'SESSIONS.md'), SESSIONS_HEADER + row);
      await ok(run('git', ['-C', dir, 'add', 'SESSIONS.md']));
      await ok(run('git', ['-C', dir, 'commit', '-m', 'coord: scaffold SESSIONS.md']));
      return true;
    },
    async addSessionRow(name, { worktree, branch, date }) {
      const dir = coordDir(name);
      const row = `| ${worktree} | ${branch} | — | — | — | active | ${date} |\n`;
      await appendFile(path.join(dir, 'SESSIONS.md'), row);
      await ok(run('git', ['-C', dir, 'add', 'SESSIONS.md']));
      await ok(run('git', ['-C', dir, 'commit', '-m', `session: claim ${worktree}`]));
    },
  };
}
