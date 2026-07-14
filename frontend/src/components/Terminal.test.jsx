import { test, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Terminal } from './Terminal.jsx';

// xterm needs real DOM measurement that jsdom does not provide, so the emulator
// is mocked and these tests assert the wiring instead.
const term = vi.hoisted(() => ({
  cols: 90,
  rows: 30,
  written: [],
  onDataCb: null,
  write: vi.fn(function (d) { term.written.push(d); }),
  open: vi.fn(),
  dispose: vi.fn(),
  focus: vi.fn(),
  loadAddon: vi.fn(),
  onData: vi.fn((cb) => { term.onDataCb = cb; return { dispose: vi.fn() }; }),
}));

vi.mock('@xterm/xterm', () => ({ Terminal: vi.fn(() => term) }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: vi.fn(() => ({ fit: vi.fn(), activate: vi.fn(), dispose: vi.fn() })) }));
// The xterm CSS import needs no mock — Vitest stubs CSS by default.

let ws;
beforeEach(() => {
  cleanup();
  term.written = [];
  ws = { readyState: 1, sent: [], send: vi.fn(function (d) { ws.sent.push(d); }), close: vi.fn() };
  globalThis.WebSocket = vi.fn(function (url) { ws.url = url; return ws; });
  globalThis.WebSocket.OPEN = 1;
});

test('connects to the session terminal endpoint with the terminal size', () => {
  render(<Terminal instance="app" onClose={() => {}} />);
  expect(ws.url).toMatch(/\/api\/sessions\/app\/terminal\?cols=90&rows=30$/);
});

test('pane bytes from the socket are written to the terminal', () => {
  render(<Terminal instance="app" onClose={() => {}} />);
  ws.onmessage({ data: new TextEncoder().encode('hi').buffer });
  expect(term.write).toHaveBeenCalled();
  expect(new TextDecoder().decode(term.written[0])).toBe('hi');
});

test('keystrokes are sent as binary frames', () => {
  render(<Terminal instance="app" onClose={() => {}} />);
  term.onDataCb('\x1b');
  expect(new TextDecoder().decode(ws.sent[0])).toBe('\x1b');
});

test('a window resize sends a resize control frame', () => {
  render(<Terminal instance="app" onClose={() => {}} />);
  window.dispatchEvent(new Event('resize'));
  expect(ws.sent.map(String)).toContain(JSON.stringify({ type: 'resize', cols: 90, rows: 30 }));
});

test('unmounting closes the socket and disposes the terminal', () => {
  const { unmount } = render(<Terminal instance="app" onClose={() => {}} />);
  unmount();
  expect(ws.close).toHaveBeenCalled();
  expect(term.dispose).toHaveBeenCalled();
});
