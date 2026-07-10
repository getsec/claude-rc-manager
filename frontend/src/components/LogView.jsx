import { useEffect, useRef, useState } from 'react';

function lineClass(line) {
  const l = line.toLowerCase();
  if (/\b(error|fail|failed|fatal)\b/.test(l)) return 'log-line err';
  if (/\bwarn/.test(l)) return 'log-line warn';
  return 'log-line';
}

export function LogView({ instance, onClose }) {
  const [lines, setLines] = useState([]);
  const boxRef = useRef(null);

  useEffect(() => {
    setLines([]);
    const es = new EventSource(`/api/sessions/${instance}/logs`);
    es.onmessage = (e) => setLines((prev) => [...prev, e.data].slice(-500));
    return () => es.close();
  }, [instance]);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [lines]);

  return (
    <div className="drawer">
      <div className="drawer-head">
        <span className="drawer-dot" />
        <span className="drawer-title">{instance}</span>
        <span className="drawer-sub">· live journal</span>
        <button className="drawer-close" onClick={onClose}>close</button>
      </div>
      <div className="drawer-body" ref={boxRef}>
        {lines.map((l, i) => <div key={i} className={lineClass(l)}>{l}</div>)}
        <div className="log-cursor">▊<span>_</span></div>
      </div>
    </div>
  );
}
