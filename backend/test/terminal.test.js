import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { attachTerminal } from '../src/terminal.js';

// app.inject() cannot perform a WebSocket upgrade, so these tests use a real
// server on an ephemeral port and a real client. That is a deliberate departure
// from the other app tests.
async function serve(tmux) {
  const server = http.createServer((req, res) => res.end('http'));
  attachTerminal(server, { tmux });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `ws://127.0.0.1:${server.address().port}`;
  return { server, url, close: () => new Promise((r) => server.close(r)) };
}

// Fake tmux handle recording what the route asked of it.
function fakeTmux() {
  const log = { attached: null, written: [], resized: [], killed: false, primed: false };
  let emitData = () => {};
  let emitExit = () => {};
  const tmux = {
    attach(instance, size) {
      log.attached = { instance, size };
      return {
        onData: (cb) => { emitData = cb; },
        onExit: (cb) => { emitExit = cb; },
        write: (b) => log.written.push(Buffer.from(b).toString()),
        resize: (c, r) => log.resized.push(`${c}x${r}`),
        kill: () => { log.killed = true; },
        prime: async () => { log.primed = true; },
      };
    },
  };
  return { tmux, log, data: (s) => emitData(Buffer.from(s)), exit: () => emitExit() };
}

test('attaches with the requested size and primes the screen', async () => {
  const f = fakeTmux();
  const s = await serve(f.tmux);
  const ws = new WebSocket(`${s.url}/api/sessions/app/terminal?cols=90&rows=30`);
  await once(ws, 'open');
  assert.deepEqual(f.log.attached, { instance: 'app', size: { cols: 90, rows: 30 } });
  assert.equal(f.log.primed, true);
  ws.close();
  await s.close();
});

test('defaults to 80x24 when the size is absent or junk', async () => {
  const f = fakeTmux();
  const s = await serve(f.tmux);
  const ws = new WebSocket(`${s.url}/api/sessions/app/terminal?cols=abc`);
  await once(ws, 'open');
  assert.deepEqual(f.log.attached.size, { cols: 80, rows: 24 });
  ws.close();
  await s.close();
});

test('pane bytes reach the client as binary frames', async () => {
  const f = fakeTmux();
  const s = await serve(f.tmux);
  const ws = new WebSocket(`${s.url}/api/sessions/app/terminal`);
  await once(ws, 'open');
  const got = once(ws, 'message');
  f.data('hello');
  const [buf] = await got;
  assert.equal(buf.toString(), 'hello');
  ws.close();
  await s.close();
});

test('binary frames from the client are typed into the pane', async () => {
  const f = fakeTmux();
  const s = await serve(f.tmux);
  const ws = new WebSocket(`${s.url}/api/sessions/app/terminal`);
  await once(ws, 'open');
  ws.send(Buffer.from('\x1b'));   // Escape — the key that matters most here
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(f.log.written, ['\x1b']);
  ws.close();
  await s.close();
});

test('a resize control frame resizes the client', async () => {
  const f = fakeTmux();
  const s = await serve(f.tmux);
  const ws = new WebSocket(`${s.url}/api/sessions/app/terminal`);
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'resize', cols: 100, rows: 40 }));
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(f.log.resized, ['100x40']);
  ws.close();
  await s.close();
});

test('a malformed control frame is ignored, not fatal', async () => {
  const f = fakeTmux();
  const s = await serve(f.tmux);
  const ws = new WebSocket(`${s.url}/api/sessions/app/terminal`);
  await once(ws, 'open');
  ws.send('not json');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(ws.readyState, WebSocket.OPEN);
  assert.deepEqual(f.log.resized, []);
  ws.close();
  await s.close();
});

test('a dead session tells the user in plain English, then closes', async () => {
  const f = fakeTmux();
  const s = await serve(f.tmux);
  const ws = new WebSocket(`${s.url}/api/sessions/app/terminal`);
  await once(ws, 'open');
  const got = once(ws, 'message');
  f.exit();
  const [buf] = await got;
  assert.match(buf.toString(), /session is not running/);
  await once(ws, 'close');
  await s.close();
});

test('closing the socket kills the tmux client', async () => {
  const f = fakeTmux();
  const s = await serve(f.tmux);
  const ws = new WebSocket(`${s.url}/api/sessions/app/terminal`);
  await once(ws, 'open');
  ws.close();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(f.log.killed, true);
  await s.close();
});

test('an unsafe instance name is rejected before anything is spawned', async () => {
  const f = fakeTmux();
  const s = await serve(f.tmux);
  const ws = new WebSocket(`${s.url}/api/sessions/..%2Fevil/terminal`);
  await once(ws, 'error').catch(() => {});
  assert.equal(f.log.attached, null);
  await s.close();
});

test('a non-terminal upgrade path is refused', async () => {
  const f = fakeTmux();
  const s = await serve(f.tmux);
  const ws = new WebSocket(`${s.url}/api/state`);
  await once(ws, 'error').catch(() => {});
  assert.equal(f.log.attached, null);
  await s.close();
});
