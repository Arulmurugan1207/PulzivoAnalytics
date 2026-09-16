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

test('serves /sitemap.xml as 200 XML and never SPA-falls-back', async (t) => {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulzivo-dist-'));
  fs.writeFileSync(path.join(distDir, 'index.html'), '<html><body>spa</body></html>');
  fs.writeFileSync(
    path.join(distDir, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://pulzivo.com/</loc></url></urlset>\n',
  );
  fs.writeFileSync(
    path.join(distDir, 'robots.txt'),
    'User-agent: *\nAllow: /\nSitemap: https://pulzivo.com/sitemap.xml\n',
  );

  const port = await listenPort();
  const child = await startServer({ port, distDir });
  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(distDir, { recursive: true, force: true });
  });

  const sitemap = await fetch(`http://127.0.0.1:${port}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get('content-type') || '', /xml/);
  const xml = await sitemap.text();
  assert.match(xml, /<urlset/);
  assert.match(xml, /https:\/\/pulzivo\.com\//);
  assert.doesNotMatch(xml, /spa/);

  const robots = await fetch(`http://127.0.0.1:${port}/robots.txt`);
  assert.equal(robots.status, 200);
  const robotsBody = await robots.text();
  assert.match(robotsBody, /Sitemap: https:\/\/pulzivo\.com\/sitemap\.xml/);
  assert.doesNotMatch(robotsBody, /spa/);
});

test('missing sitemap.xml still returns 200 valid XML, not HTML', async (t) => {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulzivo-dist-'));
  fs.writeFileSync(path.join(distDir, 'index.html'), '<html><body>spa</body></html>');

  const port = await listenPort();
  const child = await startServer({ port, distDir });
  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(distDir, { recursive: true, force: true });
  });

  const sitemap = await fetch(`http://127.0.0.1:${port}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get('content-type') || '', /xml/);
  const xml = await sitemap.text();
  assert.match(xml, /<urlset/);
  assert.match(xml, /https:\/\/pulzivo\.com\/features/);
  assert.match(xml, /https:\/\/pulzivo\.com\/pricing/);
  assert.match(xml, /https:\/\/pulzivo\.com\/docs/);
  assert.doesNotMatch(xml, /spa/);
});
