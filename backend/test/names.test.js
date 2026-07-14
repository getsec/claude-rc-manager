import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveName, slugify } from '../src/lib/names.js';

test('deriveName strips .git and path', () => {
  assert.equal(deriveName('https://github.com/example/triage-cspm.git'), 'triage-cspm');
  assert.equal(deriveName('git@github.com:example/foo.git'), 'foo');
  assert.equal(deriveName('https://example.com/bar/'), 'bar');
});

test('slugify makes branch-safe slugs', () => {
  assert.equal(slugify('feat/Detection Advisor'), 'feat-detection-advisor');
});
