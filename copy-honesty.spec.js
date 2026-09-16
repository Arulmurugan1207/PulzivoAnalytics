'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.angular']);
const SKIP_FILES = new Set(['package-lock.json', 'copy-honesty.spec.js']);
const TEXT_EXT = new Set([
  '.ts',
  '.js',
  '.html',
  '.scss',
  '.css',
  '.md',
  '.json',
  '.xml',
  '.txt',
  '.yml',
  '.yaml',
]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.cursor')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (!SKIP_FILES.has(entry.name) && TEXT_EXT.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function featureTag(source, title) {
  const re = new RegExp(`tag: '([^']+)'[\\s\\S]{0,120}title: '${title}'`);
  const match = source.match(re);
  return match ? match[1] : null;
}

test('no leftover 5KB marketing claims', () => {
  const hits = [];
  for (const file of walk(ROOT)) {
    const rel = path.relative(ROOT, file);
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (/(?<![0-9])5\s*[Kk][Bb]\b/.test(line)) {
        hits.push(`${rel}:${i + 1}:${line.trim()}`);
      }
    });
  }
  assert.deepEqual(hits, [], `leftover 5KB claims:\n${hits.join('\n')}`);
});

test('no leftover pulzivo.io product-domain strings', () => {
  const hits = [];
  for (const file of walk(ROOT)) {
    const rel = path.relative(ROOT, file);
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (/pulzivo\.io/i.test(line)) {
        hits.push(`${rel}:${i + 1}:${line.trim()}`);
      }
    });
  }
  assert.deepEqual(hits, [], `leftover pulzivo.io strings:\n${hits.join('\n')}`);
});

test('public sitemap is valid XML with marketing URLs', () => {
  const xml = fs.readFileSync(path.join(ROOT, 'public', 'sitemap.xml'), 'utf8');
  assert.doesNotMatch(xml, /xsi:schemaLocation/);
  assert.match(xml, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  for (const loc of [
    'https://pulzivo.com/',
    'https://pulzivo.com/features',
    'https://pulzivo.com/pricing',
    'https://pulzivo.com/docs',
    'https://pulzivo.com/why-pulzivo',
    'https://pulzivo.com/contact',
  ]) {
    assert.match(xml, new RegExp(`<loc>${loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`));
  }
});

test('robots.txt still points at /sitemap.xml', () => {
  const robots = fs.readFileSync(path.join(ROOT, 'public', 'robots.txt'), 'utf8');
  assert.match(robots, /Sitemap: https:\/\/pulzivo\.com\/sitemap\.xml/);
});

test('Features Free badges match script + pricing (page views, clicks, custom events)', () => {
  const features = fs.readFileSync(path.join(ROOT, 'src/app/pages/features/features.ts'), 'utf8');
  const pricing = fs.readFileSync(path.join(ROOT, 'src/app/pages/pricing/pricing.ts'), 'utf8');
  const sdk = fs.readFileSync(path.join(ROOT, 'public/pulzivo-analytics.js'), 'utf8');

  assert.equal(featureTag(features, 'Page Views'), 'Free');
  assert.equal(featureTag(features, 'Click Tracking'), 'Free');
  assert.equal(featureTag(features, 'Custom Events API'), 'Free');

  const freePlan = pricing.slice(pricing.indexOf("type: 'free'"), pricing.indexOf("type: 'starter'"));
  assert.match(freePlan, /Page view tracking/);
  assert.match(freePlan, /Click tracking/);
  assert.match(freePlan, /Custom event tracking/);

  assert.match(sdk, /free:\s*\[[^\]]*['"]page_views['"]/);
  assert.match(sdk, /free:\s*\[[^\]]*['"]clicks['"]/);
  assert.match(sdk, /free:\s*\[[^\]]*['"]custom_events['"]/);
});
