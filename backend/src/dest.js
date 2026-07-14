import path from 'node:path';

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

// The only module that touches a project's destination directory — including
// the rm -rf behind "replace".
export function createDest({ git, root, fsp }) {
  // `name` comes from deriveName(url), which is just the URL's last path
  // segment: deriveName('https://host/foo/..') returns the literal '..', and
  // '..' MATCHES the regex, because dots are legal in repo names. So the regex
  // alone is not enough — resolve the path and require it to sit directly
  // under root. Without this, remove('..') would rm -rf root's parent.
  const resolve = (name) => {
    if (!SAFE_NAME.test(name || '')) throw new Error(`unsafe project name: ${name}`);
    const dir = path.resolve(root, name);
    if (path.dirname(dir) !== path.resolve(root) || path.basename(dir) !== name) {
      throw new Error(`refusing to touch a path outside ${root}: ${name}`);
    }
    return dir;
  };

  return {
    path: resolve,

    async inspect(name, url) {
      const dir = resolve(name);
      try {
        await fsp.stat(dir);
      } catch {
        return { exists: false };
      }
      // null means "we could not tell" — never conflate it with "clean".
      const info = {
        exists: true, dir, isRepo: false, sameRepo: false,
        remoteUrl: null, branch: null, dirtyFiles: null, localOnlyCommits: null,
      };
      try {
        info.remoteUrl = await git.remoteUrl(dir);
        info.isRepo = true;
      } catch {
        return info; // there, but not a repo (or no origin) — replace only
      }
      info.sameRepo = info.remoteUrl === url;
      try { info.branch = await git.currentBranch(dir); } catch { /* detached or empty */ }
      try { info.dirtyFiles = await git.dirtyCount(dir); } catch { /* unknown */ }
      try { info.localOnlyCommits = await git.localOnlyCount(dir); } catch { /* unknown */ }
      return info;
    },

    async remove(name) {
      await fsp.rm(resolve(name), { recursive: true, force: true });
    },
  };
}
