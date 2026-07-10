// Compact "how long has this been running" string, e.g. "45s", "12m", "3h 5m", "2d 1h".
// Returns null for an unparseable/absent timestamp so callers can omit the badge cleanly.
export function formatUptime(since, nowMs = Date.now()) {
  if (!since) return null;
  const then = new Date(since).getTime();
  if (Number.isNaN(then)) return null;
  const diffSec = Math.max(0, Math.floor((nowMs - then) / 1000));
  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return `${diffSec}s`;
}

// Map a backend session status object to display-ready fields.
export function sessionView(session, worktreeLabel, nowMs = Date.now()) {
  const { activeState, subState, restarts, enabled, since } = session;
  let state;
  if (activeState === 'active') state = 'running';
  else if (activeState === 'failed') state = 'failed';
  else if (activeState === 'activating' || activeState === 'reloading') state = 'starting';
  else state = 'stopped';
  const uptime = state === 'running' ? formatUptime(since, nowMs) : null;
  return {
    state,
    statusText: `${activeState}/${subState}`,
    meta: `restarts: ${restarts} · ${enabled ? 'enabled' : 'disabled'}${uptime ? ` · up ${uptime}` : ''}`,
    worktree: worktreeLabel || null,
  };
}
