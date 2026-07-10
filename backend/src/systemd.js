const PROPS = ['ActiveState', 'SubState', 'NRestarts', 'ActiveEnterTimestamp', 'UnitFileState'];

async function ok(promise) {
  const r = await promise;
  if (r.code !== 0) throw new Error(r.stderr.trim() || `exit ${r.code}`);
  return r;
}

export function createSystemd(run, stream) {
  const uctl = (...args) => run('systemctl', ['--user', ...args]);

  return {
    async list() {
      const { stdout } = await ok(uctl('list-units', '--all', '--type=service', '--plain', '--no-legend', 'claude-rc@*'));
      return stdout.split('\n').map((l) => l.trim()).filter(Boolean)
        .map((l) => l.split(/\s+/)[0])
        .map((u) => u.replace(/\.service$/, '').replace(/^claude-rc@/, ''))
        .filter(Boolean);
    },
    async show(instance) {
      const unit = `claude-rc@${instance}.service`;
      const { stdout } = await ok(uctl('show', unit, `--property=${PROPS.join(',')}`));
      const p = Object.fromEntries(stdout.split('\n').filter(Boolean).map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1)];
      }));
      return {
        instance,
        unit,
        activeState: p.ActiveState || 'unknown',
        subState: p.SubState || 'unknown',
        restarts: Number(p.NRestarts || 0),
        since: p.ActiveEnterTimestamp || '',
        enabled: p.UnitFileState === 'enabled',
      };
    },
    async start(i) { await ok(uctl('start', `claude-rc@${i}`)); },
    async stop(i) { await ok(uctl('stop', `claude-rc@${i}`)); },
    async restart(i) { await ok(uctl('restart', `claude-rc@${i}`)); },
    async enableNow(i) { await ok(uctl('enable', '--now', `claude-rc@${i}`)); },
    async disableNow(i) { await ok(uctl('disable', '--now', `claude-rc@${i}`)); },
    async daemonReload() { await ok(uctl('daemon-reload')); },
    async restartAll() { await ok(uctl('restart', 'claude-rc@*')); },
    streamLogs(instance, onLine) {
      return stream('journalctl', ['--user', '-f', '-n', '100', '-u', `claude-rc@${instance}.service`], onLine);
    },
    async sessionUrl(instance) {
      const r = await run('tmux', ['-L', `rc-${instance}`, 'capture-pane', '-p', '-t', `claude-rc-${instance}`]);
      if (r.code !== 0) return null;
      const m = r.stdout.match(/https:\/\/claude\.ai\/code\/session_[A-Za-z0-9_-]+/);
      return m ? m[0] : null;
    },
  };
}
