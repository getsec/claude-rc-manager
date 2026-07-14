import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Header input bar. Streaming/clone-strip progress is owned by App via onSubmit.
export function AddProject({ onSubmit, busy }) {
  const [url, setUrl] = useState('');
  const [multiSession, setMultiSession] = useState(false);
  const [protocol, setProtocol] = useState('');
  const [remoteControl, setRemoteControl] = useState(false);
  const [protocols, setProtocols] = useState([]);

  useEffect(() => {
    if (multiSession && protocols.length === 0) {
      api.listProtocols().then((list) => {
        setProtocols(list);
        if (list.length && !protocol) setProtocol(list[0].slug);
      });
    }
  }, [multiSession]);

  const go = () => {
    const v = url.trim();
    if (!v || busy) return;
    if (multiSession && !protocol) return;
    onSubmit(v, { remoteControl, ...(multiSession ? { multiSession: true, protocol } : {}) });
    setUrl('');
  };

  return (
    <div className="addbar-wrap">
      <div className="addbar">
        <input
          placeholder="git URL to clone…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
        />
        <button className="btn-primary" disabled={busy || !url.trim() || (multiSession && !protocol)} onClick={go}>Add project</button>
      </div>
      <label className="multi-toggle">
        <input type="checkbox" checked={multiSession} onChange={(e) => setMultiSession(e.target.checked)} />
        multi-session
      </label>
      <label className="multi-toggle">
        <input type="checkbox" checked={remoteControl} onChange={(e) => setRemoteControl(e.target.checked)} />
        remote control
      </label>
      {multiSession && (
        <select className="protocol-pick" value={protocol} onChange={(e) => setProtocol(e.target.value)}>
          {protocols.length === 0 && <option value="">loading…</option>}
          {protocols.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </select>
      )}
    </div>
  );
}
