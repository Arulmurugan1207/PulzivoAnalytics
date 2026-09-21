'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

function localRequires(fileName) {
  const text = fs.readFileSync(path.join(ROOT, fileName), 'utf8');
  return [...text.matchAll(/require\(['"]\.\/([^'"]+)['"]\)/g)].map((m) => {
    const spec = m[1];
    return spec.endsWith('.js') ? spec : `${spec}.js`;
  });
}

function collectRuntimeModules(entry = 'server.js') {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!fs.existsSync(path.join(ROOT, file))) continue;
    for (const dep of localRequires(file)) queue.push(dep);
  }
  return [...seen];
}

test('Dockerfile copies the full runtime tree, not only server.js', () => {
  const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /COPY \. \./);
  assert.doesNotMatch(
    dockerfile,
    /^\s*COPY server\.js \.\/\s*$/m,
    'COPY server.js ./ alone drops query.js / metrics.js and crashes Cloud Run',
  );
});

test('dockerignore / gcloudignore do not drop runtime modules', () => {
  const dockerignore = fs.readFileSync(path.join(ROOT, '.dockerignore'), 'utf8');
  const gcloudignore = fs.readFileSync(path.join(ROOT, '.gcloudignore'), 'utf8');
  for (const file of ['query.js', 'metrics.js', 'server.js', 'package.json', 'package-lock.json']) {
    assert.doesNotMatch(dockerignore, new RegExp(`^${file.replace('.', '\\.')}$`, 'm'));
    assert.doesNotMatch(gcloudignore, new RegExp(`^${file.replace('.', '\\.')}$`, 'm'));
  }
  assert.doesNotMatch(dockerignore, /^\*\.js$/m);
  assert.doesNotMatch(gcloudignore, /^\*\.js$/m);
});

test('server.js local requires exist on disk (query, metrics, …)', () => {
  const modules = collectRuntimeModules('server.js');
  assert.ok(modules.includes('query.js'));
  assert.ok(modules.includes('metrics.js'));
  for (const file of modules) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `missing ${file}`);
  }
  require('./query');
  require('./metrics');
  const api = require('./server');
  assert.equal(typeof api.createApp, 'function');
});
