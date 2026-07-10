import http from 'node:http';
import { createApp } from './app.js';
import { buildDeps } from './deps.js';
import { config } from './config.js';
import { seedDefaults } from './protocols.js';

const deps = buildDeps();
const app = createApp(deps);

await deps.template.install();
await seedDefaults(deps.protocols);
await app.ready();

for (const host of config.bindHosts) {
  const server = http.createServer((req, res) => app.routing(req, res));
  server.on('error', (err) => {
    console.error(`agent-manager: failed to bind http://${host}:${config.port}: ${err.message}`);
  });
  server.listen(config.port, host, () => {
    console.log(`agent-manager listening on http://${host}:${config.port}`);
  });
}
