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
let ro;
beforeEach(() => {
  cleanup();
  term.cols = 90;
  term.rows = 30;
  term.written = [];
  term.write.mockClear();
  ws = { readyState: 1, sent: [], send: vi.fn(function (d) { ws.sent.push(d); }), close: vi.fn() };
  globalThis.WebSocket = vi.fn(function (url) { ws.url = url; return ws; });
  globalThis.WebSocket.OPEN = 1;

  // jsdom has no ResizeObserver; stub it and capture the callback + the
  // instance so tests can both trigger it and assert disconnect() on unmount.
  ro = { callback: null, observe: vi.fn(), disconnect: vi.fn() };
  globalThis.ResizeObserver = vi.fn(function (cb) {
    ro.callback = cb;
    ro.observe = this.observe = vi.fn();
    ro.disconnect = this.disconnect = vi.fn();
  });
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

test('a container resize to new valid dimensions sends exactly one resize frame', () => {
  render(<Terminal instance="app" onClose={() => {}} />);
  term.cols = 120;
  term.rows = 40;
  ro.callback();
  expect(ws.sent).toEqual([JSON.stringify({ type: 'resize', cols: 120, rows: 40 })]);
});

test('a container resize to the same dimensions sends nothing', () => {
  render(<Terminal instance="app" onClose={() => {}} />);
  ro.callback();
  ro.callback();
  expect(ws.sent).toEqual([]);
});

test.each([
  ['zero', 0, 30],
  ['negative', -5, 30],
  ['NaN', NaN, 30],
  ['non-integer', 90.5, 30],
  ['over the 1000 cap', 1001, 30],
])('a container resize to a server-rejected size (%s) is never sent', (_label, cols, rows) => {
  render(<Terminal instance="app" onClose={() => {}} />);
  term.cols = cols;
  term.rows = rows;
  ro.callback();
  expect(ws.sent).toEqual([]);
});

test('the resize observer is disconnected on unmount', () => {
  const { unmount } = render(<Terminal instance="app" onClose={() => {}} />);
  unmount();
  expect(ro.disconnect).toHaveBeenCalled();
});

test('unmounting closes the socket and disposes the terminal', () => {
  const { unmount } = render(<Terminal instance="app" onClose={() => {}} />);
  unmount();
  expect(ws.close).toHaveBeenCalled();
  expect(term.dispose).toHaveBeenCalled();
});

test('a message that arrives after unmount is not written to the disposed terminal', () => {
  const { unmount } = render(<Terminal instance="app" onClose={() => {}} />);
  const lateHandler = ws.onmessage;
  unmount();
  expect(() => lateHandler({ data: new TextEncoder().encode('late').buffer })).not.toThrow();
  expect(term.write).not.toHaveBeenCalled();
});
