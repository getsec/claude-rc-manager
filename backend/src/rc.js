import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

const SAFE_INSTANCE = /^[A-Za-z0-9._-]+$/;
const RC_ARGS = '--remote-control --remote-control-session-name-prefix %i';

// The drop-in file IS the state: systemd already holds the config systemd
// consumes, so there is nothing to keep in sync elsewhere.
export function createRc({ unitDir, daemonReload }) {
  const dropIn = (instance) => path.join(unitDir, `claude-rc@${instance}.service.d`, 'rc.conf');
  const assertSafe = (instance) => {
    if (!SAFE_INSTANCE.test(instance || '')) throw new Error(`unsafe instance: ${instance}`);
  };

  return {
    async isEnabled(instance) {
      assertSafe(instance);
      let body;
      try {
        body = await readFile(dropIn(instance), 'utf8');
      } catch {
        // No drop-in: the template's own default applies, which is RC on.
        // Every session predating this feature is in exactly this state.
        return true;
      }
      return /AM_RC_ARGS=--remote-control/.test(body);
    },
    async set(instance, enabled) {
      assertSafe(instance);
      const file = dropIn(instance);
      await mkdir(path.dirname(file), { recursive: true });
      // The whole assignment must be quoted. Unquoted, systemd splits on
      // spaces and parses the rest as further assignments, silently
      // truncating the value to `--remote-control`.
      const tmp = `${file}.tmp`;
      await writeFile(tmp, `[Service]\nEnvironment="AM_RC_ARGS=${enabled ? RC_ARGS : ''}"\n`);
      await rename(tmp, file);
      await daemonReload();
    },
  };
}
