import path from 'node:path';
import * as fsp from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { run } from './lib/exec.js';
import { config } from './config.js';
import { createSystemd } from './systemd.js';
import { createGit } from './git.js';
import { createTrust } from './trust.js';
import { createCoord } from './coord.js';
import { createStore } from './store.js';
import { createTemplate } from './template.js';
import { createProtocols } from './protocols.js';
import { createMultiAgent } from './multiagent.js';
import { createTmux } from './tmux.js';
import { createRc } from './rc.js';
import { createDest } from './dest.js';

export function buildDeps() {
  const systemd = createSystemd(run);
  const git = createGit(run, { root: config.remoteRoot });
  const dest = createDest({ git, root: config.remoteRoot, fsp });
  const coord = createCoord(run, { root: config.remoteRoot });
  const store = createStore(config.statePath);
  const template = createTemplate({ unitDir: config.unitDir, daemonReload: () => systemd.daemonReload() });
  const rc = createRc({ unitDir: config.unitDir, daemonReload: () => systemd.daemonReload() });
  const trust = createTrust({
    claudeJson: config.claudeJson,
    isRunning: async (absPath) => {
      const instance = path.basename(absPath);
      try {
        const s = await systemd.show(instance);
        return s.activeState === 'active';
      } catch {
        return false;
      }
    },
  });
  const protocols = createProtocols({ dir: config.protocolsDir });
  const multiAgent = createMultiAgent({ git });
  const tmux = createTmux(spawn);
  return { systemd, git, trust, coord, store, template, config, protocols, multiAgent, tmux, rc, dest };
}
