import { useEffect, useState } from 'react';
import { Modal } from './Modal.jsx';
import { api } from '../api.js';

export function MultiAgentEditor({ project, onClose }) {
  const [md, setMd] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.getMultiAgent(project).then((r) => { setMd(r.multiAgentMd || ''); setLoaded(true); });
  }, [project]);

  const save = () => api.saveMultiAgent(project, md);
  const resync = () => api.resyncMultiAgent(project).then((r) => setMd(r.multiAgentMd || ''));

  return (
    <Modal title={`MULTI_AGENT.md · ${project}`} onClose={onClose}>
      {!loaded && <p className="empty">Loading…</p>}
      {loaded && (
        <div className="ma-editor">
          <textarea rows={18} value={md} onChange={(e) => setMd(e.target.value)} />
          <div className="proto-actions">
            <button className="btn-primary" onClick={save}>Save</button>
            <button className="ghost-btn" onClick={resync}>re-sync from protocol</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
