'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { cacheBust, firstMismatch, localPathForUrl, normalizeBody, urlsFromSitemap } = require('./deploy-verify');

test('deploy paths map marketing URLs onto prerendered files', () => {
  const dist = path.join('/tmp', 'browser');
  assert.equal(localPathForUrl(dist, 'https://pulzivo.com/'), path.join(dist, 'index.html'));
  assert.equal(localPathForUrl(dist, 'https://pulzivo.com/pricing'), path.join(dist, 'pricing', 'index.html'));
  assert.equal(
    localPathForUrl(dist, 'https://pulzivo.com/blog/simple-google-analytics-alternative'),
    path.join(dist, 'blog', 'simple-google-analytics-alternative', 'index.html'),
  );
  assert.equal(localPathForUrl(dist, 'https://pulzivo.com/sitemap.xml'), path.join(dist, 'sitemap.xml'));
  assert.equal(localPathForUrl(dist, 'https://pulzivo.com/robots.txt'), path.join(dist, 'robots.txt'));
});

test('body compare ignores CR LF and trailing whitespace only', () => {
  assert.equal(normalizeBody('a\r\nb\n'), 'a\nb');
  assert.equal(firstMismatch('<html>\n<title>Ok</title>\n', '<html>\r\n<title>Ok</title>\r\n'), '');
  assert.match(firstMismatch('<html>\n<title>Ok</title>\n', '<html>\n<title>Slot</title>\n'), /line 2/);
});

test('verify follows the sitemap from this build, so a newly published post is checked and a future one is not', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://pulzivo.com/</loc><lastmod>2026-11-27</lastmod></url>
  <url><loc>https://pulzivo.com/blog/bounce-rate-without-ga4</loc><lastmod>2026-11-27</lastmod></url>
</urlset>`;
  const urls = urlsFromSitemap('https://pulzivo.com', xml);
  assert.deepEqual(urls, [
    'https://pulzivo.com/',
    'https://pulzivo.com/blog/bounce-rate-without-ga4',
    'https://pulzivo.com/sitemap.xml',
    'https://pulzivo.com/robots.txt',
  ]);
  assert.equal(urls.some((url) => url.includes('not-published-yet')), false);
});

test('cache buster is a query so LiteSpeed empty-query cache is skipped', () => {
  const url = new URL(cacheBust('https://pulzivo.com/pricing', 123));
  assert.equal(url.pathname, '/pricing');
  assert.equal(url.searchParams.get('pzverify'), '123');
});
