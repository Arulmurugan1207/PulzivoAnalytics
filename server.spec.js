'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function listenPort() {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const probe = http.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close((err) => (err ? reject(err) : resolve(port)));
    });
    probe.on('error', reject);
  });
}

function startServer({ port, distDir }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        DIST_DIR: distDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(err);
    };

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (!settled && stdout.includes(`listening on http://127.0.0.1:${port}`)) {
        settled = true;
        resolve(child);
      }
    });
    child.stderr.on('data', (chunk) => {
      fail(new Error(chunk.toString()));
    });
    child.on('error', fail);
    child.on('exit', (code) => {
      fail(new Error(`server exited early with code ${code}`));
    });

    setTimeout(() => fail(new Error(`server did not bind to PORT=${port} in time\n${stdout}`)), 5000);
  });
}

test('listens on process.env.PORT and serves / plus SPA fallback', async (t) => {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulzivo-dist-'));
  fs.writeFileSync(path.join(distDir, 'index.html'), '<html><body>ok</body></html>');
  fs.writeFileSync(path.join(distDir, 'health.txt'), 'ready');

  const port = await listenPort();
  const child = await startServer({ port, distDir });
  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(distDir, { recursive: true, force: true });
  });

  const root = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(root.status, 200);
  assert.match(await root.text(), /ok/);

  const spa = await fetch(`http://127.0.0.1:${port}/dashboard/overview`);
  assert.equal(spa.status, 200);
  assert.match(await spa.text(), /ok/);

  const asset = await fetch(`http://127.0.0.1:${port}/health.txt`);
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), 'ready');
});
