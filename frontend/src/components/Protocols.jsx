import { useEffect, useState } from 'react';
import { Modal } from './Modal.jsx';
import { api } from '../api.js';

const varsToText = (vars) => Object.entries(vars || {}).map(([k, v]) => `${k}=${v}`).join('\n');
const textToVars = (text) => Object.fromEntries(
  text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf('=');
    return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);

export function Protocols({ onClose }) {
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null); // { slug, name, description, varsText, body }
  const refresh = () => api.listProtocols().then(setList);
  useEffect(() => { refresh(); }, []);

  const open = async (slug) => {
    const p = await api.getProtocol(slug);
    setSel({ slug: p.slug, name: p.name, description: p.description, varsText: varsToText(p.vars), body: p.body });
  };
  const create = () => setSel({ slug: '', name: '', description: '', varsText: '', body: '# Multi-agent coordination\n' });
  const save = async () => {
    const slug = sel.slug.trim();
    if (!slug) return;
    await api.saveProtocol(slug, { name: sel.name, description: sel.description, vars: textToVars(sel.varsText), body: sel.body });
    await refresh();
  };
  const del = async () => { if (sel?.slug) { await api.deleteProtocol(sel.slug); setSel(null); await refresh(); } };

  return (
    <Modal title="Coordination protocols" onClose={onClose}>
      <div className="proto-layout">
        <div className="proto-list">
          <button className="btn-accent" onClick={create}>+ new</button>
          {list.map((p) => (
            <button key={p.slug} className={`proto-item${sel?.slug === p.slug ? ' sel' : ''}`} onClick={() => open(p.slug)}>
              <span className="proto-name">{p.name}</span>
              <span className="proto-desc">{p.description}</span>
            </button>
          ))}
        </div>
        <div className="proto-editor">
          {!sel && <p className="empty">Select a protocol, or create a new one.</p>}
          {sel && (
            <>
              <label>slug<input value={sel.slug} onChange={(e) => setSel({ ...sel, slug: e.target.value })} placeholder="kebab-case-id" /></label>
              <label>name<input value={sel.name} onChange={(e) => setSel({ ...sel, name: e.target.value })} /></label>
              <label>description<input value={sel.description} onChange={(e) => setSel({ ...sel, description: e.target.value })} /></label>
              <label>vars (KEY=VALUE per line)<textarea rows={3} value={sel.varsText} onChange={(e) => setSel({ ...sel, varsText: e.target.value })} /></label>
              <label>MULTI_AGENT.md<textarea className="proto-body" rows={14} value={sel.body} onChange={(e) => setSel({ ...sel, body: e.target.value })} /></label>
              <div className="proto-actions">
                <button className="btn-primary" onClick={save}>Save</button>
                <button className="ghost-btn" onClick={del}>Delete</button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
