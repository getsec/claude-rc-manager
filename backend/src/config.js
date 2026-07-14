import os from 'node:os';
import path from 'node:path';

const home = os.homedir();

export const config = {
  remoteRoot: process.env.AM_REMOTE_ROOT || path.join(home, 'remote-projects'),
  claudeBin: process.env.AM_CLAUDE_BIN || path.join(home, '.local/bin/claude'),
  unitDir: process.env.AM_UNIT_DIR || path.join(home, '.config/systemd/user'),
  claudeJson: process.env.AM_CLAUDE_JSON || path.join(home, '.claude.json'),
  statePath: process.env.AM_STATE || path.join(home, '.config/agent-manager/state.json'),
  protocolsDir: process.env.AM_PROTOCOLS_DIR || path.join(home, '.config/agent-manager/protocols'),
  // Loopback-only by default. To reach the UI from other machines on your LAN,
  // set AM_BIND to a comma-separated list, e.g. AM_BIND=127.0.0.1,192.168.1.50
  bindHosts: (process.env.AM_BIND || '127.0.0.1').split(',').map((h) => h.trim()).filter(Boolean),
  port: Number(process.env.AM_PORT || 8787),
  staticDir: process.env.AM_STATIC || null,
};
