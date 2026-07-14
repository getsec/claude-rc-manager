import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createTmux, unescapeOutput } from '../src/tmux.js';

// Minimal stand-in for a ChildProcess: stdout/stderr emitters + a recording stdin.
function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr = new EventEmitter();
  child.written = [];
  child.stdin = { write: (s) => child.written.push(s) };
  child.killed = false;
  child.kill = () => { child.killed = true; };
  return child;
}

function harness() {
  const child = fakeChild();
  const calls = [];
  const spawn = (cmd, args) => { calls.push([cmd, ...args].join(' ')); return child; };
  const tmux = createTmux(spawn);
  return { child, calls, tmux };
}

// Feed raw text to the fake stdout, as tmux would.
const feed = (child, text) => child.stdout.emit('data', text);
// Commands the client wrote, without trailing newlines.
const sent = (child) => child.written.map((s) => s.trim());
// Let awaited command promises settle. prime() only sends its next command after
// the previous one resolves, so a fake must yield between blocks — real tmux
// cannot reply before it has been asked.
const tick = () => new Promise((r) => setImmediate(r));

test('unescapeOutput decodes octal escapes and literal backslashes byte-exactly', () => {
  assert.equal(unescapeOutput('\\033[31mhi').toString('latin1'), '\x1b[31mhi');
  assert.equal(unescapeOutput('a\\\\b').toString('latin1'), 'a\\b');
  assert.equal(unescapeOutput('plain').toString('latin1'), 'plain');
});

test('attach spawns a control-mode client against the instance socket and session', () => {
  const { calls, tmux } = harness();
  tmux.attach('foo-bar', { cols: 80, rows: 24 });
  assert.equal(calls[0], 'tmux -L rc-foo-bar -C attach -t claude-rc-foo-bar');
});

test('%output payloads are unescaped and delivered to onData', () => {
  const { child, tmux } = harness();
  const h = tmux.attach('app', { cols: 80, rows: 24 });
  const seen = [];
  h.onData((b) => seen.push(b.toString('latin1')));
  feed(child, '%output %0 \\033[31mRED\\033[0m\n');
  assert.deepEqual(seen, ['\x1b[31mRED\x1b[0m']);
});

test('%begin/%end block contents never leak into pane data', () => {
  const { child, tmux } = harness();
  const h = tmux.attach('app', { cols: 80, rows: 24 });
  const seen = [];
  h.onData((b) => seen.push(b.toString('latin1')));
  feed(child, '%begin 123 1 1\nnot pane data\n%end 123 1 1\n%output %0 real\n');
  assert.deepEqual(seen, ['real']);
});

test('write() emits hex-encoded send-keys', () => {
  const { child, tmux } = harness();
  const h = tmux.attach('app', { cols: 80, rows: 24 });
  h.write(Buffer.from('hi\r'));
  assert.ok(sent(child).includes('send-keys -t claude-rc-app -H 68 69 0d'));
});

test('write() ignores empty input rather than emitting a bare send-keys', () => {
  const { child, tmux } = harness();
  const h = tmux.attach('app', { cols: 80, rows: 24 });
  h.write(Buffer.from(''));
  assert.deepEqual(sent(child).filter((s) => s.startsWith('send-keys')), []);
});

test('resize() emits refresh-client', () => {
  const { child, tmux } = harness();
  const h = tmux.attach('app', { cols: 80, rows: 24 });
  h.resize(90, 24);
  assert.ok(sent(child).includes('refresh-client -C 90x24'));
});

test('prime() sizes the client, paints the captured screen, and places the cursor', async () => {
  const { child, tmux } = harness();
  const h = tmux.attach('app', { cols: 90, rows: 30 });
  const seen = [];
  h.onData((b) => seen.push(b.toString('latin1')));

  const done = h.prime();
  // Each command resolves on its own %begin..%end block, in order. Yield between
  // blocks so prime() gets to send the next command first.
  feed(child, '%begin 1 1 1\n%end 1 1 1\n');                       // refresh-client
  await tick();
  feed(child, '%begin 2 2 1\nline one\nline two\n%end 2 2 1\n');   // capture-pane
  await tick();
  feed(child, '%begin 3 3 1\n5,7\n%end 3 3 1\n');                  // display-message
  await done;

  const cmds = sent(child);
  assert.ok(cmds.includes('refresh-client -C 90x30'));
  assert.ok(cmds.includes('capture-pane -p -e -J -t claude-rc-app'));
  // The format MUST be quoted — unquoted, '#' starts a tmux comment.
  assert.ok(cmds.includes('display-message -p -t claude-rc-app "#{cursor_y},#{cursor_x}"'));
  // Clear + home, screen joined with CRLF, then cursor to 1-based (row 6, col 8).
  assert.equal(seen.join(''), '\x1b[H\x1b[2Jline one\r\nline two\x1b[6;8H');
});

test('%exit fires onExit once', () => {
  const { child, tmux } = harness();
  const h = tmux.attach('app', { cols: 80, rows: 24 });
  let exits = 0;
  h.onExit(() => { exits += 1; });
  feed(child, '%exit\n');
  child.emit('close');
  assert.equal(exits, 1);
});

test('onExit registered after the child already died still fires', () => {
  const { child, tmux } = harness();
  const h = tmux.attach('app', { cols: 80, rows: 24 });
  child.emit('close');
  let fired = false;
  h.onExit(() => { fired = true; });
  assert.equal(fired, true);
});

test('a malformed line is dropped without throwing', () => {
  const { child, tmux } = harness();
  const h = tmux.attach('app', { cols: 80, rows: 24 });
  const seen = [];
  h.onData((b) => seen.push(b.toString('latin1')));
  assert.doesNotThrow(() => feed(child, '%output\n%output %0\n%bogus\n%output %0 ok\n'));
  assert.deepEqual(seen, ['ok']);
});

test('kill() kills the child', () => {
  const { child, tmux } = harness();
  tmux.attach('app', { cols: 80, rows: 24 }).kill();
  assert.equal(child.killed, true);
});

test('kill() suppresses onExit for the subsequent close event', () => {
  const { child, tmux } = harness();
  const h = tmux.attach('app', { cols: 80, rows: 24 });
  let fired = false;
  h.onExit(() => { fired = true; });
  h.kill();
  child.emit('close');
  assert.equal(fired, false);
});

test('a command whose reply is %begin..%error resolves to an empty block', async () => {
  const { child, tmux } = harness();
  const h = tmux.attach('app', { cols: 80, rows: 24 });
  const seen = [];
  h.onData((b) => seen.push(b.toString('latin1')));

  const done = h.prime();
  feed(child, '%begin 1 1 1\n%end 1 1 1\n');           // refresh-client
  await tick();
  feed(child, '%begin 2 2 1\n%error 2 2 1\n');          // capture-pane fails
  await tick();
  feed(child, '%begin 3 3 1\n%end 3 3 1\n');            // display-message
  await done;

  // Empty capture-pane block still paints, just with nothing between the
  // clear/home escape and the cursor placement (row 1, col 1: no reply).
  assert.equal(seen.join(''), '\x1b[H\x1b[2J\x1b[1;1H');
});

test('the child dying mid-command settles pending commands instead of hanging prime() forever', async () => {
  const { child, tmux } = harness();
  const h = tmux.attach('app', { cols: 80, rows: 24 });
  h.onData(() => {});

  const done = h.prime();
  // No reply blocks are ever fed — the child just dies.
  child.emit('close');

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('prime() did not settle after child death')), 200);
  });
  await Promise.race([done, timeout]);
});
