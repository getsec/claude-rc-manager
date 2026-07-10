async function streamNdjson(url, body, onStep) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onStep(JSON.parse(line));
    }
  }
}

export const api = {
  action: (instance, action) =>
    fetch(`/api/sessions/${instance}/${action}`, { method: 'POST' }).then((r) => r.json()),
  sessionUrl: (instance) => fetch(`/api/sessions/${instance}/url`).then((r) => r.json()),
  sessionGit: (instance) => fetch(`/api/sessions/${instance}/git`).then((r) => r.json()),
  restartAll: () => fetch('/api/restart-all', { method: 'POST' }).then((r) => r.json()),
  getState: () => fetch('/api/state').then((r) => r.json()),
  removeProject: (name) => fetch(`/api/projects/${name}`, { method: 'DELETE' }),
  removeSession: (instance) => fetch(`/api/sessions/${instance}`, { method: 'DELETE' }),
  addProject: (url, opts, onStep) => streamNdjson('/api/projects', { url, ...opts }, onStep),
  addSession: (name, branch, onStep) => streamNdjson(`/api/projects/${name}/sessions`, { branch }, onStep),
  listProtocols: () => fetch('/api/protocols').then((r) => r.json()),
  getProtocol: (slug) => fetch(`/api/protocols/${slug}`).then((r) => r.json()),
  saveProtocol: (slug, data) => fetch(`/api/protocols/${slug}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
  deleteProtocol: (slug) => fetch(`/api/protocols/${slug}`, { method: 'DELETE' }).then((r) => r.json()),
  enableMultiSession: (name, opts, onStep) => streamNdjson(`/api/projects/${name}/multi-session`, opts, onStep),
  getMultiAgent: (name) => fetch(`/api/projects/${name}/multi-agent`).then((r) => r.json()),
  saveMultiAgent: (name, multiAgentMd) => fetch(`/api/projects/${name}/multi-agent`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ multiAgentMd }) }).then((r) => r.json()),
  resyncMultiAgent: (name) => fetch(`/api/projects/${name}/multi-agent/resync`, { method: 'POST' }).then((r) => r.json()),
};
