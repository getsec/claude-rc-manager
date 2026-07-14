import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

// Mirrors isSafeDim in backend/src/terminal.js: the server silently drops any
// resize frame whose cols/rows are not a positive integer up to this bound,
// so there is no point sending one — it would just be a wasted tmux command.
const MAX_DIM = 1000;
const isSafeDim = (v) => Number.isInteger(v) && v > 0 && v <= MAX_DIM;

export function Terminal({ instance, onClose }) {
  const hostRef = useRef(null);

  // The overlay covers the page; without this, dragging inside the terminal
  // scrolls the dashboard behind it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    let disposed = false;
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
    ws.onmessage = (e) => {
      // ws.close() below only starts the closing handshake; a message already
      // in flight can still fire after unmount. `disposed` (checked here) and
      // clearing ws.onmessage (in cleanup) are belt-and-suspenders — either
      // alone is enough in a real browser, but this also protects against a
      // handler reference captured before cleanup ran.
      if (disposed) return;
      term.write(new Uint8Array(e.data));
    };

    const encoder = new TextEncoder();
    const typed = term.onData((s) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(encoder.encode(s));
    });

    // Last dimensions we actually acted on (sent, or decided not to send
    // because they were invalid), so a ResizeObserver callback that fires
    // without the fitted size having changed is a no-op — it fires far more
    // often than the terminal's size actually changes, and each frame we do
    // send is a tmux command.
    let lastCols = term.cols;
    let lastRows = term.rows;
    const refit = () => {
      fit.fit();
      const { cols, rows } = term;
      if (cols === lastCols && rows === lastRows) return;
      lastCols = cols;
      lastRows = rows;
      if (!isSafeDim(cols) || !isSafeDim(rows)) return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    };

    // A `window` resize listener can never see the one event that matters
    // most: the overlay itself appearing and its flex layout settling, which
    // happens with no window resize at all. Observing the terminal's own
    // container catches that first layout plus every later change (window
    // resize included, since the container resizes along with it), so the
    // window listener would just be a second path that can race this one —
    // removed rather than kept.
    const observer = new ResizeObserver(refit);
    observer.observe(hostRef.current);

    term.focus();
    return () => {
      disposed = true;
      observer.disconnect();
      typed.dispose();
      ws.onmessage = null;
      ws.close();
      term.dispose();
    };
  }, [instance]);

  return (
    <div className="term-overlay">
      <div className="term-bar">
        <span className="drawer-dot" />
        <span className="drawer-title">{instance}</span>
        <span className="drawer-sub">· live terminal</span>
        <button className="drawer-close" onClick={onClose}>close</button>
      </div>
      <div className="term-body" ref={hostRef} />
    </div>
  );
}
