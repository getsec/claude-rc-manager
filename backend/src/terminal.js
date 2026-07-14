import { WebSocketServer } from 'ws';

// The instance is interpolated into tmux arguments, so the path itself is the
// validation boundary: anything that is not a safe instance name never matches.
const TERMINAL_PATH = /^\/api\/sessions\/([A-Za-z0-9._-]+)\/terminal$/;

const DEAD = '\r\n\x1b[33msession is not running — start it from the card above\x1b[0m\r\n';

const size = (params) => {
  const n = (key, fallback) => {
    const v = Number(params.get(key));
    return Number.isInteger(v) && v > 0 ? v : fallback;
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
          if (msg.type === 'resize') handle.resize(msg.cols, msg.rows);
        } catch { /* malformed control frame; ignore */ }
      });
      ws.on('close', () => handle.kill());
      ws.on('error', () => handle.kill());

      handle.prime();
    });
  });

  return wss;
}
