'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const HTACCESS = path.join(ROOT, 'public', '.htaccess');
const INDEX = path.join(ROOT, 'src', 'index.html');
const DIST_INDEX = path.join(ROOT, 'dist', 'simpletrack-prime-ng', 'browser', 'index.html');
const DIST_HTACCESS = path.join(ROOT, 'dist', 'simpletrack-prime-ng', 'browser', '.htaccess');

function inlineScripts(html) {
  const found = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const attrs = match[1] || '';
    if (/type\s*=\s*["'][^"']*["']/i.test(attrs)) continue;
    found.push(match[2]);
  }
  return found;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('base64');
}

test('index.html has one classic inline script and the CSP hash matches it', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const scripts = inlineScripts(html);
  assert.equal(scripts.length, 1, 'expected the tracker loader and no other classic inline scripts');
  const hash = sha256(scripts[0]);
  const htaccess = fs.readFileSync(HTACCESS, 'utf8');
  assert.match(htaccess, new RegExp(`'sha256-${hash.replace(/\+/g, '\\+')}'`));
  assert.match(htaccess, /Content-Security-Policy "/);
  assert.doesNotMatch(htaccess, /Content-Security-Policy-Report-Only/);
  assert.doesNotMatch(htaccess, /script-src[^;"]*'unsafe-inline'/);
  assert.match(htaccess, /'unsafe-hashes'/);
  assert.doesNotMatch(htaccess, /unsafe-eval/);
  assert.match(htaccess, /style-src 'self' 'unsafe-inline'/);
  assert.match(htaccess, /font-src 'self' https:\/\/fonts\.gstatic\.com data:/);
  assert.match(htaccess, /img-src 'self' data: blob: https:\/\/www\.google\.com https:\/\/\*\.gstatic\.com/);
});

test('security headers are enforcing and HSTS is not preloaded', () => {
  const htaccess = fs.readFileSync(HTACCESS, 'utf8');
  const required = [
    'Header always set Strict-Transport-Security "max-age=31536000"',
    'Header always set X-Content-Type-Options "nosniff"',
    'Header always set X-Frame-Options "DENY"',
    'Header always set Referrer-Policy "strict-origin-when-cross-origin"',
    'Header always set Permissions-Policy "accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()"',
    "connect-src 'self' https://analytics-dot-node-server-apis.ue.r.appspot.com https://pulzivo-analytics-api-167308220305.us-east1.run.app",
    'https://cdn.pulzivo.com',
    "frame-ancestors 'none'",
    "default-src 'self'",
  ];
  for (const line of required) {
    assert.ok(htaccess.includes(line), `missing: ${line}`);
  }
  const hsts = htaccess.match(/Strict-Transport-Security "([^"]*)"/);
  assert.ok(hsts, 'HSTS header missing');
  assert.equal(hsts[1], 'max-age=31536000');
});

test('server-side scripts and unknown html do not fall through to the SPA', () => {
  const htaccess = fs.readFileSync(HTACCESS, 'utf8');
  const php = htaccess.indexOf('php\\d*|phtml|phar|phps');
  const google = htaccess.indexOf('google[^/]*\\.html$');
  const missingHtml = htaccess.indexOf('RewriteRule \\.html?$ - [R=404,L,NC]');
  const spa = htaccess.indexOf('RewriteRule . index.html [L]');
  assert.ok(php > 0 && php < spa, 'php denial must run before the SPA fallback');
  assert.ok(google > 0 && google < spa, 'google*.html denial must run before the SPA fallback');
  assert.ok(missingHtml > 0 && missingHtml < spa, 'missing html 404 must run before the SPA fallback');
  assert.match(htaccess, /RemoveHandler \.php/);
  assert.match(htaccess, /Header set X-Robots-Tag "noindex, nofollow" env=REDIRECT_PZ_NOINDEX/);
  assert.match(htaccess, /ErrorDocument 404 "Not Found"/);
  // Existing behaviour the rest of the site depends on.
  assert.match(htaccess, /DirectorySlash Off/);
  assert.match(htaccess, /RewriteRule \^sitemap\\\.xml\$ - \[L\]/);
  assert.match(htaccess, /RewriteRule \^robots\\\.txt\$ - \[L\]/);
  assert.match(htaccess, /RewriteRule \^tools\/\?\$ https:\/\/pulzivo\.com\/tools\/utm-builder \[R=301,L\]/);
  assert.match(htaccess, /Header set X-Robots-Tag "noindex, nofollow" env=PZ_NOINDEX/);
  assert.match(htaccess, /Header set Cache-Control "no-cache, must-revalidate"/);
});

test('built index.html keeps the same inline script when a build is present', () => {
  if (!fs.existsSync(DIST_INDEX)) {
    return;
  }
  const source = inlineScripts(fs.readFileSync(INDEX, 'utf8'));
  const built = inlineScripts(fs.readFileSync(DIST_INDEX, 'utf8'));
  assert.deepEqual(built, source);
  const htaccess = fs.readFileSync(DIST_HTACCESS, 'utf8');
  assert.equal(htaccess, fs.readFileSync(HTACCESS, 'utf8'));
  const handlers = new Set();
  const re = /\son[a-z]+\s*=\s*(["'])(.*?)\1/gi;
  for (const file of fs.readdirSync(path.dirname(DIST_INDEX), { recursive: true })) {
    if (!String(file).endsWith('.html')) continue;
    const html = fs.readFileSync(path.join(path.dirname(DIST_INDEX), file), 'utf8');
    let match;
    while ((match = re.exec(html))) handlers.add(match[2]);
  }
  assert.ok(handlers.size > 0, 'expected the Angular stylesheet onload handler');
  for (const handler of handlers) {
    const hash = sha256(handler);
    assert.ok(htaccess.includes(`'sha256-${hash}'`), `CSP is missing the hash for on*="${handler}"`);
  }
});
