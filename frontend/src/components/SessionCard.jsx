import { useEffect, useState } from 'react';
import { sessionView } from '../display.js';
import { api } from '../api.js';

export function SessionCard({ session, worktreeLabel, terminalOpen, onAction, onTerminal, onRemove }) {
  const name = session.instance;
  const [urlMsg, setUrlMsg] = useState(null);
  const [git, setGit] = useState({ branch: null, added: 0, removed: 0 });
  const [, tick] = useState(0);

  // Keeps the "up Xm" uptime advancing between SSE status updates.
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(iv);
  }, []);

  const v = sessionView(session, worktreeLabel);

  useEffect(() => {
    let alive = true;
    const load = () => api.sessionGit(name).then((g) => { if (alive) setGit(g); }).catch(() => {});
    load();
    const iv = setInterval(load, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, [name]);

  const openSession = async () => {
    setUrlMsg(null);
    try {
      const { url } = await api.sessionUrl(name);
      if (url) window.open(url, '_blank', 'noopener');
      else setUrlMsg('no session url yet');
    } catch {
      setUrlMsg('could not reach session');
    }
  };

  const removeSession = () => {
    if (window.confirm(`Remove session "${name}"?`)) onRemove(name);
  };

  return (
    <div className="card">
      <div className="card-top">
        <span className="card-name" title={name}>{name}</span>
        <span className={`card-dot ${v.state}`} />
      </div>
      <span className={`status-pill ${v.state}`}>{v.statusText}</span>
      <div className="card-meta">{v.meta}</div>
      <div className="card-git">
        {git.branch && <span className="branch" title={git.branch}>⎇ {git.branch}</span>}
        {v.worktree && <span className="worktree-tag" title={`worktree · ${v.worktree}`}>↳ {v.worktree}</span>}
        {(git.added > 0 || git.removed > 0) && (
          <span className="diffstat">
            <span className="plus">+{git.added}</span> <span className="minus">-{git.removed}</span>
          </span>
        )}
      </div>
      <div className="card-buttons">
        <div className="card-actions">
          <button className="act-start" onClick={() => onAction(name, 'start')}>start</button>
          <button className="act-stop" onClick={() => onAction(name, 'stop')}>stop</button>
          <button className="act-rst" onClick={() => onAction(name, 'restart')}>rst</button>
          <button className={`act-logs${terminalOpen ? ' on' : ''}`} onClick={() => onTerminal(name)}>terminal</button>
        </div>
        <div className="card-actions">
          {v.state !== 'stopped' && <button className="act-open" onClick={openSession}>open ↗</button>}
          <button className="act-remove" onClick={removeSession}>delete</button>
        </div>
      </div>
      {urlMsg && <div className="card-url-msg">{urlMsg}</div>}
    </div>
  );
}
