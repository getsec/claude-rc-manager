import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { deriveName, slugify } from './lib/names.js';
import { render } from './protocols.js';

function isSafeGitUrl(url) {
  return typeof url === 'string'
    && !url.startsWith('-')
    && /^(https?:\/\/|ssh:\/\/|git:\/\/|git@[^/]+:)/.test(url);
}

export function createApp(deps) {
  const { systemd, store, git, trust, coord, config, protocols, multiAgent } = deps;
  const app = Fastify({ logger: false });

  async function snapshot() {
    const instances = await systemd.list();
    return Promise.all(instances.map((i) => systemd.show(i)));
  }

  app.get('/api/state', async () => ({
    sessions: await snapshot(),
    projects: await store.all(),
  }));

  app.get('/events', (req, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.hijack();
    let last = '';
    const tick = async () => {
      try {
        const payload = JSON.stringify(await snapshot());
        if (payload !== last) {
          last = payload;
          reply.raw.write(`event: sessions\ndata: ${payload}\n\n`);
        }
      } catch { /* transient systemctl error; retry next tick */ }
    };
    const iv = setInterval(tick, 2000);
    tick();
    req.raw.on('close', () => clearInterval(iv));
  });

  app.get('/api/sessions/:instance/logs', (req, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.hijack();
    const handle = systemd.streamPane(req.params.instance, (snapshot) => {
      const payload = snapshot.split('\n').map((l) => `data: ${l}`).join('\n');
      reply.raw.write(`${payload}\n\n`);
    });
    req.raw.on('close', () => handle.kill());
  });

  app.get('/api/sessions/:instance/url', async (req) => {
    const url = await systemd.sessionUrl(req.params.instance);
    return { url };
  });

  app.get('/api/sessions/:instance/git', async (req) => {
    const { instance } = req.params;
    const dir = `${config.remoteRoot}/${instance}`;
    let branch = null;
    let added = 0;
    let removed = 0;
    try {
      branch = await git.currentBranch(dir);
      const projects = await store.all();
      const owner = projects[instance] ? null : Object.keys(projects).find((n) => instance.startsWith(`${n}-`));
      if (owner) {
        const baseBranch = await git.currentBranch(`${config.remoteRoot}/${owner}`);
        const stat = await git.diffStat(dir, baseBranch);
        added = stat.added;
        removed = stat.removed;
      }
    } catch { /* worktree not present / not a git repo yet */ }
    return { branch, added, removed };
  });

  const ACTIONS = new Set(['start', 'stop', 'restart']);
  app.post('/api/sessions/:instance/:action', async (req, reply) => {
    const { instance, action } = req.params;
    if (!ACTIONS.has(action)) return reply.code(400).send({ error: `unknown action: ${action}` });
    await systemd[action](instance);
    return systemd.show(instance);
  });

  app.post('/api/restart-all', async () => {
    await systemd.restartAll();
    return { ok: true };
  });

  app.post('/api/projects', async (req, reply) => {
    reply.raw.setHeader('Content-Type', 'application/x-ndjson');
    reply.hijack();
    const step = (o) => reply.raw.write(`${JSON.stringify(o)}\n`);
    if (!isSafeGitUrl(req.body && req.body.url)) {
      step({ step: 'validate', status: 'fail', message: 'unsupported or unsafe git URL (expected http(s)/ssh/git URL)' });
      return reply.raw.end();
    }
    const { multiSession, protocol, vars } = req.body || {};
    try {
      const name = deriveName(req.body.url);
      step({ step: 'derive', status: 'ok', name });
      const dest = await git.clone(req.body.url, name);
      step({ step: 'clone', status: 'ok', dest });
      await trust.preseed(dest);
      step({ step: 'trust', status: 'ok' });
      await systemd.enableNow(name);
      step({ step: 'enable', status: 'ok' });
      await store.setProject(name, { url: req.body.url });
      step({ step: 'record', status: 'ok' });
      if (multiSession) {
        const branch = await git.currentBranch(dest);
        const date = new Date().toISOString().slice(0, 10);
        await coord.scaffold(name, { primaryWorktree: name, primaryBranch: branch, date });
        step({ step: 'coord', status: 'ok' });
        if (!(await protocols.exists(protocol))) {
          throw new Error(`no such protocol: ${protocol}`);
        }
        const proto = await protocols.get(protocol);
        const rendered = render(proto.body, { PROJECT: name, COORD_DIR: `../${name}-coord`, ...proto.vars, ...(vars || {}) });
        await multiAgent.drop(dest, rendered);
        step({ step: 'multi-agent', status: 'ok' });
        await store.setProject(name, { multiSession: true, protocol, vars: vars || {}, multiAgentMd: rendered });
      }
      step({ step: 'done', status: 'ok', name });
    } catch (e) {
      step({ step: 'error', status: 'fail', message: String(e.message) });
    }
    reply.raw.end();
  });

  app.post('/api/projects/:name/multi-session', async (req, reply) => {
    const { name } = req.params;
    const { protocol, vars } = req.body || {};
    reply.raw.setHeader('Content-Type', 'application/x-ndjson');
    reply.hijack();
    const step = (o) => reply.raw.write(`${JSON.stringify(o)}\n`);
    try {
      const project = await store.get(name);
      if (!project) {
        step({ step: 'error', status: 'fail', message: `no such project: ${name}` });
        return reply.raw.end();
      }
      if (!(await protocols.exists(protocol))) {
        step({ step: 'error', status: 'fail', message: `no such protocol: ${protocol}` });
        return reply.raw.end();
      }
      const mainDir = `${config.remoteRoot}/${name}`;
      const branch = await git.currentBranch(mainDir);
      const date = new Date().toISOString().slice(0, 10);
      const created = await coord.scaffold(name, { primaryWorktree: name, primaryBranch: branch, date });
      step({ step: 'coord', status: 'ok', created });
      const proto = await protocols.get(protocol);
      const rendered = render(proto.body, { PROJECT: name, COORD_DIR: `../${name}-coord`, ...proto.vars, ...(vars || {}) });
      const worktrees = (await git.worktreeList(mainDir)).filter((p) => path.basename(p) !== `${name}-coord`);
      for (const dir of worktrees) {
        await multiAgent.drop(dir, rendered);
      }
      step({ step: 'multi-agent', status: 'ok', worktrees: worktrees.length });
      await store.setProject(name, { multiSession: true, protocol, vars: vars || {}, multiAgentMd: rendered });
      step({ step: 'done', status: 'ok', name });
    } catch (e) {
      step({ step: 'error', status: 'fail', message: String(e.message) });
    }
    reply.raw.end();
  });

  app.get('/api/projects/:name/multi-agent', async (req, reply) => {
    const project = await store.get(req.params.name);
    if (!project) return reply.code(404).send({ error: `no such project: ${req.params.name}` });
    return { multiAgentMd: project.multiAgentMd || '' };
  });

  app.put('/api/projects/:name/multi-agent', async (req, reply) => {
    const { name } = req.params;
    const project = await store.get(name);
    if (!project) return reply.code(404).send({ error: `no such project: ${name}` });
    const multiAgentMd = (req.body && req.body.multiAgentMd) || '';
    await store.setProject(name, { multiAgentMd });
    const mainDir = `${config.remoteRoot}/${name}`;
    const worktrees = (await git.worktreeList(mainDir)).filter((p) => path.basename(p) !== `${name}-coord`);
    for (const dir of worktrees) {
      await multiAgent.drop(dir, multiAgentMd);
    }
    return { ok: true };
  });

  app.post('/api/projects/:name/multi-agent/resync', async (req, reply) => {
    const { name } = req.params;
    const project = await store.get(name);
    if (!project || !project.protocol) {
      return reply.code(400).send({ error: `${name} has no protocol to re-sync from` });
    }
    if (!(await protocols.exists(project.protocol))) {
      return reply.code(400).send({ error: `no such protocol: ${project.protocol}` });
    }
    const proto = await protocols.get(project.protocol);
    const rendered = render(proto.body, { PROJECT: name, COORD_DIR: `../${name}-coord`, ...proto.vars, ...(project.vars || {}) });
    await store.setProject(name, { multiAgentMd: rendered });
    const mainDir = `${config.remoteRoot}/${name}`;
    const worktrees = (await git.worktreeList(mainDir)).filter((p) => path.basename(p) !== `${name}-coord`);
    for (const dir of worktrees) {
      await multiAgent.drop(dir, rendered);
    }
    return { ok: true, multiAgentMd: rendered };
  });

  app.delete('/api/projects/:name', async (req, reply) => {
    const { name } = req.params;
    const instances = await systemd.list();
    const extras = instances.filter((i) => i.startsWith(`${name}-`));
    if (extras.length) {
      return reply.code(409).send({ error: `remove worktree sessions first: ${extras.join(', ')}` });
    }
    await systemd.disableNow(name);
    await store.deleteProject(name);
    return { ok: true };
  });

  app.post('/api/projects/:name/sessions', async (req, reply) => {
    const { name } = req.params;
    const branch = req.body && req.body.branch;
    reply.raw.setHeader('Content-Type', 'application/x-ndjson');
    reply.hijack();
    const step = (o) => reply.raw.write(`${JSON.stringify(o)}\n`);
    try {
      if (!branch) {
        step({ step: 'validate', status: 'fail', message: 'branch is required' });
        return reply.raw.end();
      }
      if (!(await coord.hasCoord(name))) {
        step({ step: 'coord', status: 'fail', message: `no ${name}-coord exists; create it before adding a session` });
        return reply.raw.end();
      }
      const worktree = `${name}-${slugify(branch)}`;
      const wtPath = `${config.remoteRoot}/${worktree}`;
      await git.worktreeAdd(`${config.remoteRoot}/${name}`, wtPath, branch);
      step({ step: 'worktree', status: 'ok', worktree });
      await trust.preseed(wtPath);
      step({ step: 'trust', status: 'ok' });
      const project = await store.get(name);
      if (project && project.multiAgentMd) {
        await multiAgent.drop(wtPath, project.multiAgentMd);
        step({ step: 'multi-agent', status: 'ok' });
      }
      const date = new Date().toISOString().slice(0, 10);
      await coord.addSessionRow(name, { worktree, branch, date });
      step({ step: 'coord-row', status: 'ok' });
      await systemd.enableNow(worktree);
      step({ step: 'enable', status: 'ok' });
      step({ step: 'done', status: 'ok', worktree });
    } catch (e) {
      step({ step: 'error', status: 'fail', message: String(e.message) });
    }
    reply.raw.end();
  });

  app.delete('/api/sessions/:instance', async (req, reply) => {
    const { instance } = req.params;
    const force = req.query.force === 'true' || req.query.force === '1';
    const projects = await store.all();
    if (projects[instance]) {
      return reply.code(400).send({ error: `${instance} is a primary project session; remove it via DELETE /api/projects/${instance}` });
    }
    const owner = Object.keys(projects).find((name) => instance.startsWith(`${name}-`));
    if (!owner) {
      return reply.code(404).send({ error: `no known project owns worktree session ${instance}` });
    }
    await systemd.disableNow(instance);
    await git.worktreeRemove(`${config.remoteRoot}/${owner}`, `${config.remoteRoot}/${instance}`, { force });
    return { ok: true };
  });

  app.get('/api/protocols', async () => protocols.list());

  app.get('/api/protocols/:slug', async (req, reply) => {
    const { slug } = req.params;
    try {
      if (!(await protocols.exists(slug))) {
        return reply.code(404).send({ error: `no such protocol: ${slug}` });
      }
      return await protocols.get(slug);
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.put('/api/protocols/:slug', async (req, reply) => {
    const { name, description, vars, body } = req.body || {};
    try {
      await protocols.save(req.params.slug, { name, description, vars, body });
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
    return { ok: true };
  });

  app.delete('/api/protocols/:slug', async (req, reply) => {
    try {
      await protocols.remove(req.params.slug);
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
    return { ok: true };
  });

  if (deps.config.staticDir) {
    app.register(fastifyStatic, { root: deps.config.staticDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url.startsWith('/api') || req.raw.url.startsWith('/events')) {
        return reply.code(404).send({ error: 'not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
