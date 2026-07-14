import { useEffect, useState } from 'react';
import { api } from '../api.js';

export function EnableMultiSession({ project, onDone }) {
  const [open, setOpen] = useState(false);
  const [protocols, setProtocols] = useState([]);
  const [protocol, setProtocol] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && protocols.length === 0) {
      api.listProtocols().then((list) => {
        setProtocols(list);
        if (list.length) setProtocol(list[0].slug);
      });
    }
  }, [open]);

  const enable = async () => {
    if (!protocol || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      await api.enableMultiSession(project, { protocol }, (s) => {
        if (s.status === 'fail') setStatus({ kind: 'error', message: s.message });
      });
    } catch (e) {
      setStatus({ kind: 'error', message: String(e.message || e) });
    } finally {
      setBusy(false);
      setOpen(false);
      onDone();
    }
  };

  if (!open) {
    return <button className="ghost-btn" onClick={() => setOpen(true)}>enable multi-session</button>;
  }

  return (
    <div className="enable-multi">
      <select value={protocol} onChange={(e) => setProtocol(e.target.value)}>
        {protocols.length === 0 && <option value="">loading…</option>}
        {protocols.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
      </select>
      <button className="btn-accent" disabled={busy || !protocol} onClick={enable}>enable</button>
      {status?.kind === 'error' && <span className="coord-error">{status.message}</span>}
    </div>
  );
}
