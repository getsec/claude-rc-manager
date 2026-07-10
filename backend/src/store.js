import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

export function createStore(statePath) {
  async function load() {
    try {
      return JSON.parse(await readFile(statePath, 'utf8'));
    } catch {
      return { projects: {} };
    }
  }
  async function save(data) {
    await mkdir(path.dirname(statePath), { recursive: true });
    const tmp = `${statePath}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2));
    await rename(tmp, statePath);
  }
  return {
    async all() {
      return (await load()).projects || {};
    },
    async get(name) {
      return (await load()).projects?.[name] || null;
    },
    async setProject(name, info) {
      const d = await load();
      d.projects = d.projects || {};
      d.projects[name] = { ...(d.projects[name] || {}), ...info };
      await save(d);
    },
    async deleteProject(name) {
      const d = await load();
      if (d.projects) delete d.projects[name];
      await save(d);
    },
  };
}
