'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

test('homepage no longer pulls Inter from fonts.googleapis.com', () => {
  const styles = fs.readFileSync(path.join(ROOT, 'src/styles.scss'), 'utf8');
  const fonts = fs.readFileSync(path.join(ROOT, 'src/styles/fonts.css'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  assert.doesNotMatch(styles, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(fonts, /fonts\/inter-latin\.woff2/);
  assert.doesNotMatch(fonts, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(index, /rel="preload"[^>]*href="fonts\/inter-latin\.woff2"/);
  assert.ok(fs.existsSync(path.join(ROOT, 'public/fonts/inter-latin.woff2')));
  assert.ok(fs.existsSync(path.join(ROOT, 'public/images/hero-dashboard.webp')));
  assert.ok(fs.existsSync(path.join(ROOT, 'public/images/hero-dashboard.avif')));
});

test('prerendered homepage preloads a sized hero dashboard image', () => {
  const { pages, render } = require('./prerender-seo.js');
  const template = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  const html = render(template, pages().find((p) => p.path === ''));
  assert.match(html, /rel="preload"[^>]*as="image"[^>]*hero-dashboard\.webp/);
  assert.match(html, /<img[^>]*src="\/images\/hero-dashboard\.webp"/);
  assert.match(html, /width="620"/);
  assert.match(html, /height="854"/);
  assert.match(html, /fetchpriority="high"/);
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
});

test('prerendered /login is noindex, has next-step links, and stays out of the sitemap', () => {
  const { pages, renderAuth, AUTH_PAGES, buildSitemap, canonicalFor } = require('./prerender-seo.js');
  const template = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  const login = AUTH_PAGES.find((p) => p.path === 'login');
  const html = renderAuth(template, login);
  assert.match(html, /<title>Sign In \| Pulzivo Analytics<\/title>/);
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/pulzivo\.com\/login">/);
  assert.match(html, /<h1[^>]*>Sign in<\/h1>/);
  for (const href of ['/', '/signup', '/pricing', '/blog/pulzivo-launch-offer', '/contact', '/login?forgot=1']) {
    assert.match(html, new RegExp(`href="${href.replace(/[.?]/g, '\\$&')}"`));
  }
  assert.match(html, /50% off your first 12 months, launch offer until we reach 100 users/);
  assert.match(html, /\$4\.50, \$14\.50, and \$49\.50/);
  assert.match(html, /10,000 events a month/);
  assert.doesNotMatch(html, /GDPR|CCPA|cookie banner/i);
  const xml = buildSitemap('2026-11-25');
  assert.doesNotMatch(xml, /pulzivo\.com\/login</);
  assert.doesNotMatch(xml, /pulzivo\.com\/signin</);
  const paths = pages().map((p) => p.path);
  assert.ok(!paths.includes('login') && !paths.includes('signin'));
  assert.equal(canonicalFor('login'), 'https://pulzivo.com/login');
});
