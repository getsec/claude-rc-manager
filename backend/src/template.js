import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// claude runs an INTERACTIVE TUI and requires a TTY; run headless (systemd
// Type=simple, no PTY) it falls into --print mode and exits with "Input must be
// provided ... when using --print". So each session runs inside its own private
// tmux server (-L rc-%i) which supplies the PTY. The per-service socket (not the
// shared default) keeps sessions in their own cgroup — stopping one never
// touches another. The session terminal attaches to that same tmux server.
//
// AM_RC_ARGS is what makes remote control per-session: rc.js writes a drop-in
// per instance to override it. The command is NOT single-quoted because systemd
// does not expand $VAR inside single quotes; tmux accepts the command as
// separate arguments instead.
export const TEMPLATE_UNIT = `[Unit]
Description=Claude Code session for %i
After=network-online.target
Wants=network-online.target
ConditionPathIsDirectory=%h/remote-projects/%i

[Service]
Type=forking
GuessMainPID=no
RemainAfterExit=yes
Environment=PATH=%h/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=AM_RC_ARGS=--remote-control --remote-control-session-name-prefix %i
WorkingDirectory=%h/remote-projects/%i
ExecStartPre=-/usr/bin/tmux -L rc-%i kill-server
ExecStart=/usr/bin/tmux -L rc-%i new-session -d -s claude-rc-%i %h/.local/bin/claude $AM_RC_ARGS
ExecStop=-/usr/bin/tmux -L rc-%i kill-server
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
`;

export function createTemplate({ unitDir, daemonReload }) {
  return {
    async install() {
      const file = path.join(unitDir, 'claude-rc@.service');
      let current = null;
      try {
        current = await readFile(file, 'utf8');
      } catch {
        current = null;
      }
      if (current === TEMPLATE_UNIT) return false;
      await mkdir(unitDir, { recursive: true });
      await writeFile(file, TEMPLATE_UNIT);
      await daemonReload();
      return true;
    },
  };
}
