import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTemplate, TEMPLATE_UNIT } from '../src/template.js';

test('install writes the unit and reloads on first run, no-op second run', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'am-tmpl-'));
  let reloads = 0;
  const tmpl = createTemplate({ unitDir: dir, daemonReload: async () => { reloads++; } });

  const first = await tmpl.install();
  assert.equal(first, true);
  assert.equal(reloads, 1);
  const written = await readFile(path.join(dir, 'claude-rc@.service'), 'utf8');
  assert.equal(written, TEMPLATE_UNIT);

  const second = await tmpl.install();
  assert.equal(second, false);
  assert.equal(reloads, 1);
});

test('template runs --user (default.target, no root Environment)', () => {
  assert.match(TEMPLATE_UNIT, /WantedBy=default\.target/);
  assert.match(TEMPLATE_UNIT, /--remote-control/);
  assert.doesNotMatch(TEMPLATE_UNIT, /HOME=\/root/);
});

test('template gives claude a PTY via a private per-service tmux socket', () => {
  // --remote-control needs a TTY; a private tmux socket per instance supplies it
  // and keeps each session isolated in its own cgroup.
  assert.match(TEMPLATE_UNIT, /tmux -L rc-%i/);
  assert.match(TEMPLATE_UNIT, /Type=forking/);
});
