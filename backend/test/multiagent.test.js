import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMultiAgent } from '../src/multiagent.js';

async function tmpWorktree() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'am-ma-'));
  const commonDir = path.join(dir, '.git-common');
  await mkdir(commonDir, { recursive: true });
  const git = { commonGitDir: async () => commonDir };
  return { dir, commonDir, git };
}

test('drop writes MULTI_AGENT.md and CLAUDE.local.md into the worktree', async () => {
  const { dir, git } = await tmpWorktree();
  const ma = createMultiAgent({ git });
  await ma.drop(dir, '# hello');
  assert.equal(await readFile(path.join(dir, 'MULTI_AGENT.md'), 'utf8'), '# hello');
  assert.equal(await readFile(path.join(dir, 'CLAUDE.local.md'), 'utf8'), '@MULTI_AGENT.md\n');
});

test('drop adds both filenames to the common git dir info/exclude, without duplicating on a second call', async () => {
  const { dir, commonDir, git } = await tmpWorktree();
  const ma = createMultiAgent({ git });
  await ma.drop(dir, '# hello');
  const excludeFile = path.join(commonDir, 'info', 'exclude');
  const contents = await readFile(excludeFile, 'utf8');
  assert.match(contents, /^MULTI_AGENT\.md$/m);
  assert.match(contents, /^CLAUDE\.local\.md$/m);

  await ma.drop(dir, '# hello again');
  const contents2 = await readFile(excludeFile, 'utf8');
  assert.equal((contents2.match(/MULTI_AGENT\.md/g) || []).length, 1);
  assert.equal((contents2.match(/CLAUDE\.local\.md/g) || []).length, 1);
});

test('drop preserves pre-existing lines already in info/exclude', async () => {
  const { dir, commonDir, git } = await tmpWorktree();
  const excludeFile = path.join(commonDir, 'info', 'exclude');
  await mkdir(path.dirname(excludeFile), { recursive: true });
  await writeFile(excludeFile, '.env.session\n');
  const ma = createMultiAgent({ git });
  await ma.drop(dir, '# hello');
  const contents = await readFile(excludeFile, 'utf8');
  assert.match(contents, /\.env\.session/);
  assert.match(contents, /MULTI_AGENT\.md/);
});
