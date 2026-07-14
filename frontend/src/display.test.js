import { test, expect } from 'vitest';
import { formatUptime, sessionView } from './display.js';

test('formatUptime returns null for an absent or unparseable timestamp', () => {
  expect(formatUptime(null)).toBeNull();
  expect(formatUptime('')).toBeNull();
  expect(formatUptime('not a date')).toBeNull();
});

test('formatUptime formats seconds, minutes, hours+minutes, and days+hours', () => {
  const since = '2026-07-10T09:00:00.000Z';
  const base = new Date(since).getTime();
  expect(formatUptime(since, base + 45 * 1000)).toBe('45s');
  expect(formatUptime(since, base + 12 * 60 * 1000)).toBe('12m');
  expect(formatUptime(since, base + (3 * 3600 + 5 * 60) * 1000)).toBe('3h 5m');
  expect(formatUptime(since, base + (2 * 86400 + 1 * 3600) * 1000)).toBe('2d 1h');
});

test('sessionView includes uptime in meta only when the session is running', () => {
  const since = '2026-07-10T09:00:00.000Z';
  const now = new Date(since).getTime() + 12 * 60 * 1000;

  const running = sessionView({ activeState: 'active', subState: 'running', restarts: 0, enabled: true, since }, null, now);
  expect(running.meta).toBe('restarts: 0 · enabled · up 12m');

  const stopped = sessionView({ activeState: 'inactive', subState: 'dead', restarts: 0, enabled: true, since }, null, now);
  expect(stopped.meta).toBe('restarts: 0 · enabled');
});
