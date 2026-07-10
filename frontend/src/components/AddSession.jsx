import { useEffect, useState } from 'react';
import { api } from '../api.js';

export function AddSession({ project }) {
  const [branch, setBranch] = useState('');
  const [status, setStatus] = useState(null); // { kind: 'error'|'progress'|'coord', message }
  const [busy, setBusy] = useState(false);
  const [protocols, setProtocols] = useState([]);
  const [protocol, setProtocol] = useState('');

  useEffect(() => {
    if (status?.kind === 'coord' && protocols.length === 0) {
      api.listProtocols().then((list) => {
        setProtocols(list);
        if (list.length) setProtocol(list[0].slug);
      });
    }
  }, [status]);

  const runSubmit = async (b) => {
    setStatus(null);
    let last = null;
    try {
      await api.addSession(project, b, (s) => {
        last = s;
        if (s.status === 'fail') {
          setStatus(s.step === 'coord' ? { kind: 'coord', message: s.message } : { kind: 'error', message: s.message });
        } else if (s.step === 'done') {
          setStatus(null);
        } else {
          setStatus({ kind: 'progress', message: s.step });
        }
      });
    } catch (e) {
      setStatus({ kind: 'error', message: String(e.message || e) });
    }
    return last;
  };

  const submit = async () => {
    const b = branch.trim();
    if (!b || busy) return;
    setBusy(true);
    const last = await runSubmit(b);
    setBusy(false);
    if (last && last.step === 'done') { setBranch(''); setStatus(null); }
  };

  const enableAndRetry = async () => {
    const b = branch.trim();
    if (!protocol || busy || !b) return;
    setBusy(true);
    try {
      await api.enableMultiSession(project, { protocol }, () => {});
      const last = await runSubmit(b);
      if (last && last.step === 'done') { setBranch(''); setStatus(null); }
    } catch (e) {
      setStatus({ kind: 'error', message: String(e.message || e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="addsession">
        <input
          placeholder="branch (e.g. feat/x)"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
        <button className="btn-accent" disabled={busy || !branch.trim()} onClick={submit}>Add session</button>
      </div>
      {status?.kind === 'error' && (
        <div className="coord-error"><span>✕</span><span>{status.message}</span></div>
      )}
      {status?.kind === 'coord' && (
        <div className="enable-multi">
          <span className="coord-error"><span>✕</span><span>coord: {status.message}</span></span>
          <select value={protocol} onChange={(e) => setProtocol(e.target.value)}>
            {protocols.length === 0 && <option value="">loading…</option>}
            {protocols.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
          <button className="btn-accent" disabled={busy || !protocol} onClick={enableAndRetry}>enable multi-session</button>
        </div>
      )}
      {status?.kind === 'progress' && <div className="session-status">⟳ {status.message} …</div>}
    </>
  );
}
