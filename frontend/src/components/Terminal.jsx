import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function Terminal({ instance, onClose }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      theme: { background: '#0a0c0f' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${proto}//${window.location.host}/api/sessions/${instance}/terminal?cols=${term.cols}&rows=${term.rows}`,
    );
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (e) => term.write(new Uint8Array(e.data));

    const encoder = new TextEncoder();
    const typed = term.onData((s) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(encoder.encode(s));
    });

    const onResize = () => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };
    window.addEventListener('resize', onResize);

    term.focus();
    return () => {
      window.removeEventListener('resize', onResize);
      typed.dispose();
      ws.close();
      term.dispose();
    };
  }, [instance]);

  return (
    <div className="drawer">
      <div className="drawer-head">
        <span className="drawer-dot" />
        <span className="drawer-title">{instance}</span>
        <span className="drawer-sub">· live terminal · click to type</span>
        <button className="drawer-close" onClick={onClose}>close</button>
      </div>
      <div className="drawer-term" ref={hostRef} />
    </div>
  );
}
