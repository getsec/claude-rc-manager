import { readdir, readFile, writeFile, mkdir, rm, rename, stat } from 'node:fs/promises';
import path from 'node:path';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function isValidSlug(slug) {
  return typeof slug === 'string' && slug.length <= 64 && SLUG_RE.test(slug);
}

export function render(body, vars = {}) {
  return String(body).replace(/\$\{([A-Za-z0-9_]+)\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m);
}

export function createProtocols({ dir }) {
  const slugDir = (slug) => path.join(dir, slug);
  const assertSlug = (slug) => { if (!isValidSlug(slug)) throw new Error(`invalid protocol slug: ${slug}`); };

  async function writeAtomic(file, contents) {
    const tmp = `${file}.tmp`;
    await writeFile(tmp, contents);
    await rename(tmp, file);
  }

  async function readOne(slug, withBody) {
    let meta = {};
    try { meta = JSON.parse(await readFile(path.join(slugDir(slug), 'meta.json'), 'utf8')); } catch { meta = {}; }
    const base = { slug, name: meta.name || slug, description: meta.description || '', vars: meta.vars || {} };
    if (!withBody) return base;
    let body = '';
    try { body = await readFile(path.join(slugDir(slug), 'protocol.md'), 'utf8'); } catch { body = ''; }
    return { ...base, body };
  }

  return {
    async list() {
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
      const slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name).filter(isValidSlug);
      return Promise.all(slugs.map((s) => readOne(s, false)));
    },
    async get(slug) { assertSlug(slug); return readOne(slug, true); },
    async save(slug, { name, description, vars, body }) {
      assertSlug(slug);
      const d = slugDir(slug);
      await mkdir(d, { recursive: true });
      await writeAtomic(path.join(d, 'meta.json'), JSON.stringify({ name: name || slug, description: description || '', vars: vars || {} }, null, 2));
      await writeAtomic(path.join(d, 'protocol.md'), body || '');
    },
    async remove(slug) { assertSlug(slug); await rm(slugDir(slug), { recursive: true, force: true }); },
    async exists(slug) { assertSlug(slug); try { return (await stat(slugDir(slug))).isDirectory(); } catch { return false; } },
  };
}

export const BUILTIN = {
  'compose-portblock': {
    name: 'Compose port-block',
    description:
      'Docker-compose projects: each session claims a +INCREMENT*N port block and a unique '
      + 'COMPOSE_PROJECT_NAME, coordinating via the coord SESSIONS.md ledger.',
    vars: { PG_BASE: '5432', API_BASE: '8000', WEB_BASE: '5173', INCREMENT: '10' },
    body: `# Multi-agent coordination

You are one of several Claude Code sessions working on **\${PROJECT}** in parallel, each in
its own git worktree. Before doing any work, follow this protocol so sessions never collide
on ports, databases, or compose stacks.

## 1. Claim a port block
Open \`\${COORD_DIR}/SESSIONS.md\`. Sessions are numbered; session N uses:
- Postgres: \${PG_BASE} + \${INCREMENT}*N
- API:      \${API_BASE} + \${INCREMENT}*N
- Web:      \${WEB_BASE} + \${INCREMENT}*N

Take the next free block, add your row (worktree, branch, COMPOSE_PROJECT_NAME, ports,
status \`active\`, date), and commit it to the coordination branch.

## 2. Configure your worktree
Create \`.env.session\` with a unique \`COMPOSE_PROJECT_NAME\` and your claimed ports, then
bring the stack up with the project's usual command (e.g. \`scripts/dc.sh up\`).

## 3. Stay in your lane
Never use another session's ports or COMPOSE_PROJECT_NAME. Record shared decisions (API
contracts, migration heads) in \`\${COORD_DIR}/handoffs/\`.

## 4. Tear down
When done, mark your SESSIONS.md row \`done\`, commit, and bring your stack down to free the
port block.
`,
  },
};

export async function seedDefaults(protocols) {
  for (const [slug, p] of Object.entries(BUILTIN)) {
    if (await protocols.exists(slug)) continue;
    await protocols.save(slug, p);
  }
}
