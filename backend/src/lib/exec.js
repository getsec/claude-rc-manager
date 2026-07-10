import { spawn } from 'node:child_process';

export function run(cmd, args = [], opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, opts);
    let stdout = '', stderr = '';
    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: String(err.message) }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

export function stream(cmd, args, onLine, onClose) {
  const child = spawn(cmd, args);
  let buf = '';
  let done = false;
  const onData = (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      onLine(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
  };
  const finish = () => {
    if (done) return;
    done = true;
    if (buf.length) { onLine(buf); buf = ''; }
    if (onClose) onClose();
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('error', finish);
  child.on('close', finish);
  return { kill: () => child.kill() };
}
