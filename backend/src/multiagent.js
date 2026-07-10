import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const EXCLUDE_LINES = ['MULTI_AGENT.md', 'CLAUDE.local.md'];

export function createMultiAgent({ git }) {
  return {
    async drop(worktreeDir, markdown) {
      await writeFile(path.join(worktreeDir, 'MULTI_AGENT.md'), markdown);
      await writeFile(path.join(worktreeDir, 'CLAUDE.local.md'), '@MULTI_AGENT.md\n');
      await excludeFiles(worktreeDir, git);
    },
  };
}

async function excludeFiles(worktreeDir, git) {
  const commonDir = await git.commonGitDir(worktreeDir);
  const file = path.join(commonDir, 'info', 'exclude');
  let existing = '';
  try {
    existing = await readFile(file, 'utf8');
  } catch {
    existing = '';
  }
  const lines = existing.split('\n');
  const missing = EXCLUDE_LINES.filter((l) => !lines.includes(l));
  if (!missing.length) return;
  await mkdir(path.dirname(file), { recursive: true });
  const sep = existing && !existing.endsWith('\n') ? '\n' : '';
  await writeFile(file, existing + sep + missing.join('\n') + '\n');
}
