import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTrust } from '../src/trust.js';

async function tmpFile(contents) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'am-trust-'));
  const file = path.join(dir, '.claude.json');
  if (contents !== undefined) await writeFile(file, contents);
  return file;
}

test('preseed sets trust keys and preserves existing data', async () => {
  const file = await tmpFile(JSON.stringify({ userID: 'u1', projects: { '/other': { hasTrustDialogAccepted: true } } }));
  const trust = createTrust({ claudeJson: file, isRunning: async () => false });
  await trust.preseed('/repos/new');
  const data = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(data.userID, 'u1');
  assert.equal(data.projects['/other'].hasTrustDialogAccepted, true);
  assert.equal(data.projects['/repos/new'].hasTrustDialogAccepted, true);
  assert.equal(data.projects['/repos/new'].hasCompletedProjectOnboarding, true);
});

test('preseed refuses when a session for the path is running', async () => {
  const file = await tmpFile(JSON.stringify({ projects: {} }));
  const trust = createTrust({ claudeJson: file, isRunning: async (p) => p === '/repos/live' });
  await assert.rejects(() => trust.preseed('/repos/live'), /running/);
});

test('preseed works when file does not exist yet', async () => {
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), 'am-trust-')), '.claude.json');
  const trust = createTrust({ claudeJson: file, isRunning: async () => false });
  await trust.preseed('/repos/fresh');
  const data = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(data.projects['/repos/fresh'].hasTrustDialogAccepted, true);
});

test('preseed refuses to overwrite a corrupt .claude.json and leaves it untouched', async () => {
  const file = await tmpFile('{ this is not valid json');
  const trust = createTrust({ claudeJson: file, isRunning: async () => false });
  await assert.rejects(() => trust.preseed('/repos/x'), /not valid JSON/);
  const after = await readFile(file, 'utf8');
  assert.equal(after, '{ this is not valid json');
});
