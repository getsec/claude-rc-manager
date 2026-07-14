import { readFile, writeFile, rename } from 'node:fs/promises';

export function createTrust({ claudeJson, isRunning }) {
  return {
    async preseed(absPath) {
      if (await isRunning(absPath)) {
        throw new Error(`refusing to edit trust: a session for ${absPath} is running`);
      }
      let raw = null;
      try {
        raw = await readFile(claudeJson, 'utf8');
      } catch (e) {
        if (e.code !== 'ENOENT') throw new Error(`cannot read ${claudeJson}: ${e.message}`);
        raw = null; // file absent → start fresh
      }
      let data = {};
      if (raw !== null) {
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(`refusing to overwrite ${claudeJson}: existing file is not valid JSON`);
        }
      }
      data.projects = data.projects || {};
      data.projects[absPath] = {
        ...(data.projects[absPath] || {}),
        hasTrustDialogAccepted: true,
        hasCompletedProjectOnboarding: true,
      };
      const tmp = `${claudeJson}.am-tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 2));
      await rename(tmp, claudeJson);
    },
  };
}
