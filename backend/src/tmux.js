import { Buffer } from 'node:buffer';

const OCTAL = /^[0-7]{3}$/;

// tmux control mode escapes non-printable bytes in %output as \OOO (octal) and a
// literal backslash as \\. Callers read stdout as latin1, so one char is one byte
// and this stays byte-exact even for UTF-8 pane content.
export function unescapeOutput(s) {
  const bytes = [];
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '\\') {
      const oct = s.slice(i + 1, i + 4);
      if (OCTAL.test(oct)) { bytes.push(parseInt(oct, 8)); i += 3; continue; }
      if (s[i + 1] === '\\') { bytes.push(0x5c); i += 1; continue; }
    }
    bytes.push(s.charCodeAt(i) & 0xff);
  }
  return Buffer.from(bytes);
}

export function createTmux(spawn) {
  return {
    attach(instance, { cols, rows }) {
      const session = `claude-rc-${instance}`;
      const child = spawn('tmux', ['-L', `rc-${instance}`, '-C', 'attach', '-t', session]);
      child.stdout.setEncoding('latin1');

      let onData = () => {};
      let onExit = () => {};
      let exited = false;
      const pending = [];   // resolvers for in-flight commands, FIFO
      let block = null;     // lines collected inside the current %begin..%end
      let buf = '';

      const finish = () => {
        if (exited) return;
        exited = true;
        // Flush any commands still awaiting a %begin/%end reply — the child is
        // gone, so no reply is ever coming. Resolve with an empty block (the
        // same shape %error already produces) so callers like prime() settle
        // instead of hanging forever.
        while (pending.length) pending.shift()([]);
        onExit();
      };

      const send = (line) => {
        try { child.stdin.write(`${line}\n`); } catch { /* child already gone */ }
      };

      // tmux answers every command with a %begin..%end block, in order.
      const command = (line) => new Promise((resolve) => {
        // The child is already gone — nothing will ever reply, so don't queue
        // a resolver finish() will never get another chance to flush. This
        // matters for sequential callers like prime(): finish() only flushes
        // whatever was in-flight *at the moment it ran*; later commands issued
        // after death (e.g. prime()'s next `await command(...)`) must settle
        // immediately too, or they'd hang forever.
        if (exited) { resolve([]); return; }
        pending.push(resolve);
        send(line);
      });

      const handleLine = (line) => {
        if (block) {
          if (line.startsWith('%end') || line.startsWith('%error')) {
            const out = line.startsWith('%error') ? [] : block;
            block = null;
            const resolve = pending.shift();
            if (resolve) resolve(out);
          } else {
            block.push(line);
          }
          return;
        }
        if (line.startsWith('%begin')) { block = []; return; }
        if (line.startsWith('%output')) {
          const sp = line.indexOf(' ', '%output '.length);
          if (sp < 0) return;  // no payload; malformed
          onData(unescapeOutput(line.slice(sp + 1)));
          return;
        }
        if (line.startsWith('%exit')) finish();
        // Everything else (%session-changed, %window-add, ...) is not our business.
      };

      child.stdout.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).replace(/\r$/, '');
          buf = buf.slice(i + 1);
          // A bad line must never take the socket down.
          try { handleLine(line); } catch { /* drop it */ }
        }
      });
      child.on('error', finish);
      child.on('close', finish);

      return {
        onData: (cb) => { onData = cb; },
        onExit: (cb) => { onExit = cb; if (exited) cb(); },
        write: (bytes) => {
          const b = Buffer.from(bytes);
          if (!b.length) return;
          send(`send-keys -t ${session} -H ${b.toString('hex').match(/../g).join(' ')}`);
        },
        resize: (c, r) => send(`refresh-client -C ${c}x${r}`),
        // Marking exited before killing suppresses onExit for this teardown: the
        // caller initiated it deliberately (e.g. the socket layer killing the
        // session on socket close), so "the session exited" isn't news to them.
        kill: () => { exited = true; child.kill(); },
        async prime() {
          await command(`refresh-client -C ${cols}x${rows}`);
          // Block output carries LITERAL escapes, unlike %output — no unescaping here.
          const screen = await command(`capture-pane -p -e -J -t ${session}`);
          // The format must stay quoted: unquoted '#' starts a comment in tmux.
          const pos = await command(`display-message -p -t ${session} "#{cursor_y},#{cursor_x}"`);
          const [y = '0', x = '0'] = String(pos[0] || '').split(',');
          const cursor = `\x1b[${Number(y) + 1};${Number(x) + 1}H`;
          onData(Buffer.from(`\x1b[H\x1b[2J${screen.join('\r\n')}${cursor}`, 'latin1'));
        },
      };
    },
  };
}
