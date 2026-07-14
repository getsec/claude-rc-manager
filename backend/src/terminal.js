import { WebSocketServer } from 'ws';

// The instance is interpolated into tmux arguments, so the path itself is the
// validation boundary: anything that is not a safe instance name never matches.
const TERMINAL_PATH = /^\/api\/sessions\/([A-Za-z0-9._-]+)\/terminal$/;

const DEAD = '\r\n\x1b[33msession is not running — start it from the card above\x1b[0m\r\n';

// Shared policy for both the connect path (size()) and the resize control
// frame: reject (never clamp) anything that is not a positive integer up to
// this bound. Kept in one place so the two paths cannot drift apart — see
// the resize command-injection note in the message handler below.
const MAX_DIM = 1000;
const isSafeDim = (v) => Number.isInteger(v) && v > 0 && v <= MAX_DIM;

const size = (params) => {
  const n = (key, fallback) => {
    const v = Number(params.get(key));
    return isSafeDim(v) ? v : fallback;
  };
  return { cols: n('cols', 80), rows: n('rows', 24) };
};

// @fastify/websocket cannot be used here: server.js routes through its own
// http.Server via app.routing(), so Fastify's internal server never sees the
// upgrade. Attaching to the real servers with noServer also means the terminal
// works on every AM_BIND host for free.
export function attachTerminal(server, { tmux }) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    // WebSocket handshakes are exempt from CORS: any page the user has open
    // can point at this endpoint and, with no auth in this app, type into a
    // live Claude session. Origin is the only boundary available, so a
    // browser-sent Origin must match this request's own Host (never a
    // hardcoded host/port — AM_BIND can bind several). A request with no
    // Origin header at all is not a browser page (fetch/WS from a script,
    // the test suite, the live smoke check) — allow those through.
    const origin = req.headers.origin;
    if (origin) {
      let originHost;
      try { originHost = new URL(origin).host; } catch { originHost = null; }
      if (originHost !== req.headers.host) { socket.destroy(); return; }
    }

    const url = new URL(req.url, 'http://localhost');
    const match = TERMINAL_PATH.exec(url.pathname);
    if (!match) { socket.destroy(); return; }
    const instance = match[1];

    wss.handleUpgrade(req, socket, head, (ws) => {
      const handle = tmux.attach(instance, size(url.searchParams));
      const send = (bytes) => { if (ws.readyState === ws.OPEN) ws.send(bytes); };

      handle.onData(send);
      handle.onExit(() => {
        send(Buffer.from(DEAD));
        ws.close();
      });

      ws.on('message', (data, isBinary) => {
        if (isBinary) { handle.write(data); return; }
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'resize') {
            // A JSON string may legally contain a newline, and control mode is
            // line-oriented on tmux's stdin — an unvalidated dimension could
            // smuggle a second arbitrary command after refresh-client. Reject
            // (never clamp) using the same rule as size() above, and let
            // tmux.js enforce it again independently (defence in depth).
            const cols = Number(msg.cols);
            const rows = Number(msg.rows);
            if (isSafeDim(cols) && isSafeDim(rows)) handle.resize(cols, rows);
          }
        } catch { /* malformed control frame; ignore */ }
      });
      ws.on('close', () => handle.kill());
      ws.on('error', () => handle.kill());

      // command() in tmux.js never rejects today (an implicit invariant), but
      // that could change — this backstop keeps a future regression from
      // producing an unhandled rejection that takes the process down.
      handle.prime().catch(() => {});
    });
  });

  return wss;
}
