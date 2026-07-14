import { useState, useEffect } from 'react';
import { useSessions } from './useSessions.js';
import { api } from './api.js';
import { SessionCard } from './components/SessionCard.jsx';
import { AddProject } from './components/AddProject.jsx';
import { AddSession } from './components/AddSession.jsx';
import { Terminal } from './components/Terminal.jsx';
import { Protocols } from './components/Protocols.jsx';
import { EnableMultiSession } from './components/EnableMultiSession.jsx';
import { MultiAgentEditor } from './components/MultiAgentEditor.jsx';

const ACCENTS = ['#35d07f', '#4da3ff', '#e3b341', '#c9d1cd'];

const loadAccent = () => {
  try { return localStorage.getItem('am-accent') || ACCENTS[0]; } catch { return ACCENTS[0]; }
};
const saveAccent = (v) => { try { localStorage.setItem('am-accent', v); } catch { /* no storage */ } };

function deriveName(url) {
  const last = url.replace(/\/+$/, '').split(/[/:]/).pop() || '';
  return last.replace(/\.git$/, '') || 'repo';
}

function cloneView(clone) {
  if (!clone) return null;
  const { name, step, status, message } = clone;
  if (status === 'fail' || step === 'error') {
    return { err: true, spinner: '✕', color: 'danger', label: message || `${step} failed` };
  }
  const labels = {
    derive: `cloning ${name} → ~/remote-projects …`,
    clone: 'pre-seeding trust in ~/.claude.json …',
    trust: `enabling claude-rc@${name} …`,
    enable: `enabling claude-rc@${name} …`,
    record: `enabling claude-rc@${name} …`,
    coord: `scaffolding ${name}-coord …`,
    'multi-agent': 'dropping MULTI_AGENT.md …',
    done: `enabled claude-rc@${name} · session online`,
  };
  const done = step === 'done';
  return { err: false, spinner: done ? '✓' : '⟳', color: done ? 'accent' : 'warn', label: labels[step] || `${step} …` };
}

export function App() {
  const { sessions, connected } = useSessions();
  const [projects, setProjects] = useState({});
  const [logInstance, setLogInstance] = useState(null);
  const [clone, setClone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [accent, setAccent] = useState(loadAccent);
  const [showProtocols, setShowProtocols] = useState(false);
  const [editingMultiAgent, setEditingMultiAgent] = useState(null);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent);
    saveAccent(accent);
  }, [accent]);

  const refreshProjects = () => api.getState().then((s) => setProjects(s.projects || {})).catch(() => {});
  useEffect(() => { refreshProjects(); }, [sessions.length]);

  const projectNames = Object.keys(projects);
  const ownerOf = (instance) => projectNames.find((n) => instance.startsWith(`${n}-`)) || null;

  const removeSessionCard = (instance) => {
    const remove = ownerOf(instance) ? api.removeSession(instance) : api.removeProject(instance);
    remove.then(refreshProjects);
  };

  const startClone = async (url, opts) => {
    setBusy(true);
    setClone({ step: 'derive', status: 'ok', name: deriveName(url) });
    let last = null;
    try {
      await api.addProject(url, opts, (s) => {
        last = { name: s.name || last?.name || deriveName(url), ...s };
        setClone(last);
      });
    } catch (e) {
      last = { step: 'error', status: 'fail', message: String(e.message || e) };
      setClone(last);
    } finally {
      setBusy(false);
      refreshProjects();
      if (last && last.step === 'done') {
        setTimeout(() => setClone((c) => (c === last ? null : c)), 1600);
      }
    }
  };

  const cv = cloneView(clone);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="glyph">A</div>
          <span className="title">Agent Manager</span>
          <span className={`live-pill${connected ? '' : ' off'}`}>
            <span className="live-dot" />{connected ? 'live' : 'offline'}
          </span>
        </div>
        <span className="spacer" />
        <div className="swatches">
          {ACCENTS.map((c) => (
            <button
              key={c}
              className={`swatch${c === accent ? ' sel' : ''}`}
              style={{ background: c, color: c }}
              onClick={() => setAccent(c)}
              aria-label={`accent ${c}`}
            />
          ))}
        </div>
        <button className="ghost-btn" style={{ marginLeft: 0 }} onClick={() => setShowProtocols(true)}>Protocols</button>
        <AddProject onSubmit={startClone} busy={busy} />
      </header>

      {cv && (
        <div className={`clone-strip${cv.err ? ' err' : ''}`}>
          <span className={`spin ${cv.color}`}>{cv.spinner}</span>
          <span>{cv.label}</span>
        </div>
      )}

      <div className="section-head">
        <span className="section-label">Sessions</span>
        <span className="section-hint">systemctl --user</span>
        <button className="ghost-btn" onClick={() => api.restartAll()}>restart all</button>
      </div>
      <div className="grid">
        {sessions.map((s) => {
          const owner = ownerOf(s.instance);
          return (
            <SessionCard
              key={s.instance}
              session={s}
              worktreeLabel={owner ? s.instance.slice(owner.length + 1) : null}
              logsOpen={logInstance === s.instance}
              onAction={(instance, action) => api.action(instance, action)}
              onLogs={(instance) => setLogInstance((cur) => (cur === instance ? null : instance))}
              onRemove={removeSessionCard}
            />
          );
        })}
      </div>
      {sessions.length === 0 && <p className="empty">No sessions yet — add a repo to start one.</p>}

      {logInstance && <Terminal instance={logInstance} onClose={() => setLogInstance(null)} />}

      <div className="section-head">
        <span className="section-label">Projects</span>
        <span className="section-hint">~/remote-projects</span>
      </div>
      {projectNames.length === 0 && <p className="empty">No projects yet.</p>}
      <div className="projects-list">
        {projectNames.map((name) => {
          const worktrees = sessions
            .filter((s) => s.instance.startsWith(`${name}-`))
            .map((s) => s.instance.slice(name.length + 1));
          return (
            <div key={name} className="project">
              <div className="project-head">
                <span className="project-name">{name}</span>
                {projects[name].multiSession ? (
                  <>
                    <span className="chip multi-badge">multi · {projects[name].protocol}</span>
                    <button className="ghost-btn" style={{ marginLeft: 0 }} onClick={() => setEditingMultiAgent(name)}>MULTI_AGENT.md</button>
                  </>
                ) : (
                  <EnableMultiSession project={name} onDone={refreshProjects} />
                )}
                <div className="chips">
                  <span className="chip primary">default</span>
                  {worktrees.map((w) => (
                    <span key={w} className="chip">
                      {w}
                      <button
                        className="chip-x"
                        title="remove session"
                        onClick={() => api.removeSession(`${name}-${w}`).then(refreshProjects)}
                      >✕</button>
                    </span>
                  ))}
                </div>
                <button className="project-remove" onClick={() => api.removeProject(name).then(refreshProjects)}>
                  Remove
                </button>
              </div>
              <AddSession project={name} />
            </div>
          );
        })}
      </div>

      {showProtocols && <Protocols onClose={() => setShowProtocols(false)} />}
      {editingMultiAgent && <MultiAgentEditor project={editingMultiAgent} onClose={() => setEditingMultiAgent(null)} />}
    </div>
  );
}
