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

test('robots.txt still points at /sitemap.xml and hides noindex app routes', () => {
  const robots = fs.readFileSync(path.join(ROOT, 'public', 'robots.txt'), 'utf8');
  assert.match(robots, /Sitemap: https:\/\/pulzivo\.com\/sitemap\.xml/);
  for (const route of ['/dashboard', '/reset-password', '/login', '/signin', '/signup', '/register', '/demo', '/api/']) {
    assert.match(robots, new RegExp(`Disallow:\\s*${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`));
  }
  assert.doesNotMatch(robots, /Disallow:\s*\/share\b/);
  assert.doesNotMatch(robots, /Strict-Transport-Security/i);
  const htaccess = fs.readFileSync(path.join(ROOT, 'public', '.htaccess'), 'utf8');
  assert.match(
    htaccess,
    /SetEnvIf Request_URI "\^\/\(dashboard\|reset-password\|login\|signin\|signup\|register\|demo\|share\)" PZ_NOINDEX/,
  );
  assert.doesNotMatch(htaccess, /Strict-Transport-Security/i);
});

test('Features Free badges match script + pricing (page views, clicks, custom events)', () => {
  const features = fs.readFileSync(path.join(ROOT, 'src/app/pages/features/features.ts'), 'utf8');
  const pricing = fs.readFileSync(path.join(ROOT, 'src/app/pages/pricing/pricing.ts'), 'utf8');
  const sdk = fs.readFileSync(path.join(ROOT, 'public/pulzivo-analytics.js'), 'utf8');

  assert.equal(featureTag(features, 'Page Views'), 'Free');
  assert.equal(featureTag(features, 'Click Tracking'), 'Free');
  assert.equal(featureTag(features, 'Custom Events API'), 'Free');
  assert.equal(featureTag(features, 'Scroll Depth'), 'Free');
  assert.equal(featureTag(features, 'Core Web Vitals'), 'Free');
  assert.equal(featureTag(features, 'Error Tracking'), 'Pro');
  assert.doesNotMatch(features, /LCP, FID/);

  const freePlan = pricing.slice(pricing.indexOf("type: 'free'"), pricing.indexOf("type: 'starter'"));
  assert.match(freePlan, /Page view tracking/);
  assert.match(freePlan, /Click tracking/);
  assert.match(freePlan, /Custom event tracking/);

  assert.match(sdk, /free:\s*\[[^\]]*['"]page_views['"]/);
  assert.match(sdk, /free:\s*\[[^\]]*['"]clicks['"]/);
  assert.match(sdk, /free:\s*\[[^\]]*['"]custom_events['"]/);
});

test('sitemap.xml matches the prerendered SEO routes and blog posts', () => {
  const { pages, canonicalFor } = require('./scripts/prerender-seo.js');
  const xml = fs.readFileSync(path.join(ROOT, 'public', 'sitemap.xml'), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  const expected = pages().map((p) => canonicalFor(p.path)).sort();
  assert.deepEqual(locs, expected, 'regenerate with: node scripts/prerender-seo.js --sitemap YYYY-MM-DD > public/sitemap.xml');
});

test('prerendered pages render unique title, description and self canonical', () => {
  const { pages, render, canonicalFor } = require('./scripts/prerender-seo.js');
  const template = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  const titles = new Set();
  for (const page of pages()) {
    const html = render(template, page);
    const title = html.match(/<title>([^<]*)<\/title>/)[1];
    assert.ok(!titles.has(title), `duplicate title ${title}`);
    titles.add(title);
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonicalFor(page.path).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}">`));
    assert.equal((html.match(/<meta name="description"/g) || []).length, 1);
    assert.doesNotMatch(html, /noindex/);
  }
});

test('marketing + blog copy avoids compliance and script-size-vs-competitor claims', () => {
  const files = [
    'src/index.html',
    'src/app/seo/seo-routes.json',
    'src/app/pages/blog/posts.json',
    'src/app/pages/blog/posts-content.json',
    'src/app/pages/guides/guide-copy.ts',
    'src/app/pages/tools/tools-index/tools-index.html',
    'src/app/pages/tools/utm-builder/utm-builder.html',
    'src/app/pages/tools/page-speed-checker/page-speed-checker.html',
    'src/app/pages/tools/tools-index/tools-index.ts',
    'src/app/pages/tools/utm-builder/utm-builder.ts',
    'src/app/pages/tools/page-speed-checker/page-speed-checker.ts',
  ];
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(text, /GDPR|CCPA/i, `${f} claims GDPR/CCPA`);
    assert.doesNotMatch(text, /smaller than (Plausible|Fathom)/i, `${f} claims smaller script than competitor`);
  }
});

test('every prerendered page links to the blog and all articles with plain <a href>', () => {
  const { pages, render } = require('./scripts/prerender-seo.js');
  const posts = require('./src/app/pages/blog/posts.json');
  const template = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  for (const page of pages()) {
    const html = render(template, page);
    assert.match(html, /<a href="\/blog">/);
    assert.match(html, /<nav class="prerendered-nav sr-only"[^>]*style="position:absolute;width:1px;height:1px;[^"]*clip-path:inset\(50%\)[^"]*"/, `${page.path} nav must be visually hidden`);
    assert.doesNotMatch(html, /<nav[^>]*(display:\s*none|visibility:\s*hidden|\shidden[\s>])/);
    for (const p of posts) assert.ok(html.includes(`<a href="/blog/${p.slug}"`), `${page.path} missing ${p.slug}`);
  }
});

function h1Text(html) {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  assert.ok(match, 'expected an h1');
  return match[1]
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

test('prerendered marketing routes include each page h1 in visible HTML', () => {
  const { pages, render } = require('./scripts/prerender-seo.js');
  const { PAGES } = require('./scripts/angular-static.js');
  const template = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  for (const page of pages()) {
    if (page.post) continue;
    const html = render(template, page);
    const source = fs.readFileSync(path.join(ROOT, PAGES[page.path].template), 'utf8');
    const expected = h1Text(source);
    assert.equal(h1Text(html), expected, `/${page.path}`);
    const visibleStart = html.indexOf('<div class="prerendered">');
    const navStart = html.indexOf('<nav class="prerendered-nav');
    assert.ok(visibleStart !== -1 && navStart > visibleStart, `${page.path} visible body missing`);
    const visible = html.slice(visibleStart, navStart);
    assert.match(visible, /<h1\b/i, `${page.path} h1 is not in the visible prerender`);
    assert.doesNotMatch(visible, /sr-only|display:\s*none|visibility:\s*hidden/);
  }
});

test('prerendered home and pricing keep the live offer, size, and plan copy', () => {
  const { pages, render } = require('./scripts/prerender-seo.js');
  const template = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  const home = render(template, pages().find((p) => p.path === ''));
  const pricing = render(template, pages().find((p) => p.path === 'pricing'));
  assert.match(home, /No cookies, no personal data collected by default/);
  assert.match(home, /~9KB gzip/);
  assert.match(home, /Founder offer: 50% off any paid plan for 12 months with code FOUNDER50, limited to the first 10 paying customers\./);
  assert.match(pricing, /Founder offer: 50% off any paid plan for 12 months with code FOUNDER50, limited to the first 10 paying customers\. Enter the code at checkout\./);
  assert.match(pricing, /\$0/);
  assert.match(pricing, /\$9\/mo/);
  assert.match(pricing, /\$29\/mo/);
  assert.match(pricing, /\$99\/mo/);
  assert.match(pricing, /Page view tracking/);
  assert.match(pricing, /href="\/signup\?plan=starter"/);
});

test('generated sitemap lastmod is the build date for pages and the post date for posts', () => {
  const { buildSitemap, pages, canonicalFor } = require('./scripts/prerender-seo.js');
  const today = new Date().toISOString().slice(0, 10);
  const xml = buildSitemap(today);
  const committed = fs.readFileSync(path.join(ROOT, 'public', 'sitemap.xml'), 'utf8');
  assert.match(committed, /<lastmod>2026-10-29<\/lastmod>/);
  assert.notEqual(xml, committed);
  const rows = [...xml.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)];
  assert.equal(rows.length, pages().length);
  for (const [, loc, lastmod] of rows) {
    const page = pages().find((p) => canonicalFor(p.path) === loc);
    assert.ok(page, loc);
    assert.match(lastmod, /^\d{4}-\d{2}-\d{2}$/);
    if (page.post) assert.equal(lastmod, page.post.date, loc);
    else {
      assert.equal(lastmod, today, loc);
      assert.notEqual(lastmod, '2026-10-29', loc);
    }
  }
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'prerender-seo.js'), 'utf8');
  assert.match(src, /writeFileSync\(path\.join\(OUT, 'sitemap\.xml'\), buildSitemap\(/);
  assert.doesNotMatch(src, /readFileSync\(path\.join\(ROOT, 'public', 'sitemap\.xml'\)\)/);
});

test('homepage JSON-LD names Pulzivo Analytics, prices real plans, and drops the demo sitelink', () => {
  const { pages, render } = require('./scripts/prerender-seo.js');
  const { pageScope } = require('./scripts/angular-static.js');
  const template = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  const html = render(template, pages().find((p) => p.path === ''));
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const org = blocks.find((b) => b['@type'] === 'Organization');
  const app = blocks.find((b) => b['@type'] === 'SoftwareApplication');
  const nav = blocks.find((b) => b['@type'] === 'ItemList');
  assert.equal(org.name, 'Pulzivo Analytics');
  assert.equal(org.url, 'https://pulzivo.com/');
  assert.ok(org.logo);
  assert.equal(app.name, 'Pulzivo Analytics');
  assert.equal(app.url, 'https://pulzivo.com/');
  const plans = pageScope('pricing').plans;
  assert.deepEqual(plans.map((p) => [p.name, p.price]), [
    ['Free', 0],
    ['Starter', 9],
    ['Pro', 29],
    ['Enterprise', 99],
  ]);
  assert.deepEqual(
    app.offers.map((o) => [o.name, o.price, o.priceCurrency]),
    plans.map((p) => [p.name, String(p.price), 'USD']),
  );
  for (const offer of app.offers) assert.match(offer.description, /USD\/month/);
  assert.ok(nav.itemListElement.length >= 5);
  assert.ok(nav.itemListElement.every((item) => !String(item.url).includes('/demo')));
  assert.doesNotMatch(html, /pulzivo\.com\/demo\/overview/);
});


test('prerender resolves imported constants used by docs FAQ answers', () => {
  const { pages, render } = require('./scripts/prerender-seo.js');
  const { pageScope } = require('./scripts/angular-static.js');
  const logic = fs.readFileSync(path.join(ROOT, 'src/app/components/owner-exclusion/owner-exclusion.logic.ts'), 'utf8');
  const faq = (logic.match(/export const OWNER_EXCLUSION_FAQ\s*=\s*'([^']*)'/) || [])[1];
  assert.ok(faq, 'OWNER_EXCLUSION_FAQ string should still exist for docs copy');
  const scope = pageScope('docs');
  assert.ok(Array.isArray(scope.faqItems) && scope.faqItems.length > 0, 'docs faqItems should be evaluated');
  assert.ok(scope.faqItems.some((item) => item && String(item.answer).includes('?pulz_owner=1')), 'docs FAQ should include the owner-exclusion answer');
  const template = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  const html = render(template, pages().find((p) => p.path === 'docs'));
  assert.match(html, /\?pulz_owner=1/);
  assert.match(html, /<div class="prerendered">/);
});

function guideWords(html) {
  const article = html.match(/<article class="guide">([\s\S]*?)<\/article>/);
  assert.ok(article, 'guide article missing');
  const text = article[1]
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.split(' ').filter(Boolean);
}

test('comparison pages are in the sitemap, canonical, honest, and 800-1200 words', () => {
  const { pages, render, canonicalFor } = require('./scripts/prerender-seo.js');
  const template = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  const xml = fs.readFileSync(path.join(ROOT, 'public', 'sitemap.xml'), 'utf8');
  const paths = [
    ['ga4-alternative', 'Google Analytics 4 alternative for small sites'],
    ['compare/plausible', 'Pulzivo vs Plausible'],
    ['compare/fathom', 'Pulzivo vs Fathom'],
    ['compare/google-analytics', 'Pulzivo vs Google Analytics 4'],
    ['compare/simple-analytics', 'Pulzivo vs Simple Analytics'],
    ['cookieless-analytics', 'What cookieless analytics is, and how Pulzivo does it'],
  ];
  for (const [routePath, h1] of paths) {
    assert.match(xml, new RegExp(`<loc>${canonicalFor(routePath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`));
    const page = pages().find((item) => item.path === routePath);
    assert.ok(page, routePath);
    const html = render(template, page);
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonicalFor(routePath).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}">`));
    assert.match(html, new RegExp(`<h1>${h1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h1>`));
    assert.doesNotMatch(html, /(?<![0-9])5\s*[Kk][Bb]\b/);
    assert.match(html, /FOUNDER50/);
    assert.match(html, /"@type": "FAQPage"/);
    const cells = [...html.matchAll(/<td[^>]*>([^<]+)<\/td>/g)].map((match) => match[1].trim());
    assert.ok(cells.length > 0, routePath);
    for (const cell of cells) assert.match(cell, /^(Yes|No|Partial)$/, `${routePath} cell ${cell}`);
    const count = guideWords(html).length;
    assert.ok(count >= 800 && count <= 1200, `${routePath} is ${count} words`);
  }
});

test('/docs is in the sitemap, prerendered, and linked from the visible nav and footer', () => {
  const { pages, render, canonicalFor, buildSitemap } = require('./scripts/prerender-seo.js');
  const template = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  const committed = fs.readFileSync(path.join(ROOT, 'public', 'sitemap.xml'), 'utf8');
  const generated = buildSitemap('2026-11-19');
  for (const xml of [committed, generated]) {
    assert.match(xml, /<loc>https:\/\/pulzivo\.com\/docs<\/loc>/);
  }
  const routes = fs.readFileSync(path.join(ROOT, 'src/app/app.routes.ts'), 'utf8');
  const docsPaths = [...routes.matchAll(/path:\s*'((?:docs)[^']*)'/g)].map((match) => match[1]);
  assert.deepEqual(docsPaths, ['docs'], 'docs sections are in-page anchors, not extra routes');
  const page = pages().find((item) => item.path === 'docs');
  const html = render(template, page);
  assert.match(html, /<title>Documentation — Install &amp; Track Events \| Pulzivo Analytics<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/pulzivo\.com\/docs">/);
  assert.match(html, /<h1\b[^>]*>[\s\S]*Getting Started[\s\S]*<\/h1>/);
  assert.doesNotMatch(html, /(?<![0-9])5\s*[Kk][Bb]\b/);
  const header = fs.readFileSync(path.join(ROOT, 'src/app/layout/header/header.ts'), 'utf8');
  const footer = fs.readFileSync(path.join(ROOT, 'src/app/layout/footer/footer.html'), 'utf8');
  assert.match(header, /label:\s*'Docs',\s*path:\s*'\/docs'/);
  assert.match(footer, /routerLink="\/docs"/);
  for (const item of pages()) {
    const rendered = render(template, item);
    const visibleStart = rendered.indexOf('<div class="prerendered">');
    const hiddenStart = rendered.indexOf('<nav class="prerendered-nav');
    const visible = rendered.slice(visibleStart, hiddenStart);
    const headerHtml = visible.match(/<header[\s\S]*?<\/header>/);
    const footerHtml = visible.match(/<footer[\s\S]*?<\/footer>/);
    assert.ok(headerHtml, `${item.path} missing prerendered header`);
    assert.ok(footerHtml, `${item.path} missing prerendered footer`);
    assert.match(headerHtml[0], /<nav aria-label="Primary navigation">[\s\S]*<a href="\/docs">Docs<\/a>/);
    assert.match(footerHtml[0], /<a href="\/docs">Docs<\/a>/);
    assert.doesNotMatch(headerHtml[0] + footerHtml[0], /sr-only|display:\s*none|visibility:\s*hidden/);
  }
});

test('free tool pages have titles, canonicals, sitemap entries, and honest CTAs', () => {
  const { pages, render, canonicalFor } = require('./scripts/prerender-seo.js');
  const template = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  const xml = fs.readFileSync(path.join(ROOT, 'public', 'sitemap.xml'), 'utf8');
  const header = fs.readFileSync(path.join(ROOT, 'src/app/layout/header/header.ts'), 'utf8');
  const footer = fs.readFileSync(path.join(ROOT, 'src/app/layout/footer/footer.html'), 'utf8');
  assert.match(header, /label:\s*'Free tools',\s*path:\s*'\/tools'/);
  assert.match(footer, /aria-label="Free tools"/);
  assert.match(footer, /footer-group-label">Free tools</);
  assert.match(footer, /routerLink="\/tools\/utm-builder"/);
  assert.match(footer, /routerLink="\/tools\/page-speed-checker"/);

  const expected = [
    ['tools', 'Free tools — UTM builder and page speed | Pulzivo Analytics', 'Free tools'],
    ['tools/utm-builder', 'UTM campaign URL builder | Pulzivo Analytics', 'UTM campaign URL builder'],
    ['tools/page-speed-checker', 'Page speed checker — Core Web Vitals | Pulzivo Analytics', 'Page speed checker'],
  ];
  for (const [routePath, title, h1] of expected) {
    assert.match(xml, new RegExp(`<loc>${canonicalFor(routePath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`));
    const page = pages().find((item) => item.path === routePath);
    assert.equal(page.title, title);
    const html = render(template, page);
    assert.match(html, new RegExp(`<title>${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</title>`));
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonicalFor(routePath).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}">`));
    assert.match(html, new RegExp(`<h1>${h1}</h1>`));
    assert.match(html, /"@type": "FAQPage"/);
    assert.doesNotMatch(html, /GDPR|CCPA/i);
    assert.doesNotMatch(html, /(?<![0-9])5\s*[Kk][Bb]\b/);
    const visibleStart = html.indexOf('<div class="prerendered">');
    const hiddenStart = html.indexOf('<nav class="prerendered-nav');
    const visible = html.slice(visibleStart, hiddenStart);
    assert.match(visible, /<a href="\/tools">Free tools<\/a>/);
    assert.match(visible, /Free tools/);
    assert.match(visible, /<a href="\/tools\/utm-builder">/);
    assert.match(visible, /<a href="\/tools\/page-speed-checker">/);
  }

  const utm = render(template, pages().find((item) => item.path === 'tools/utm-builder'));
  assert.match(utm, /https:\/\/example\.com\/pricing\?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=spring-launch&amp;utm_content=hero/);
  assert.match(utm, /google \/ cpc/);
  assert.match(utm, /See which campaigns actually convert: Pulzivo shows UTM attribution on Starter\. Free plan to start\./);
  assert.match(utm, /href="\/signup"/);

  const speed = render(template, pages().find((item) => item.path === 'tools/page-speed-checker'));
  assert.match(speed, /lab proxy/);
  assert.match(speed, /TBT is not INP/);
  assert.match(speed, /Lab tests are one visit\. Pulzivo records real Core Web Vitals from every visitor, on the free plan\./);
  assert.match(speed, /href="\/signup"/);
});

test('prerender loads exported constants from relative imports and skips unresolved fields', () => {
  const os = require('os');
  const { loadComponent } = require('./scripts/angular-static.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulzivo-prerender-'));
  try {
    fs.writeFileSync(path.join(dir, 'values.ts'), [
      "export const GREETING = 'hello from a relative import';",
      "export const COUNT = 3;",
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'widget.ts'), [
      "import { Component } from '@angular/core';",
      "import { GREETING, COUNT } from './values';",
      '',
      "@Component({ selector: 'app-widget', template: '' })",
      'export class Widget {',
      '  title = GREETING;',
      '  count = COUNT;',
      "  ok = 'kept';",
      '  broken = NOT_A_REAL_IDENTIFIER;',
      '}',
      '',
    ].join('\n'));
    const warns = [];
    const orig = console.warn;
    console.warn = (...args) => { warns.push(args.join(' ')); };
    let scope;
    try {
      scope = loadComponent(path.join(dir, 'widget.ts'));
    } finally {
      console.warn = orig;
    }
    assert.equal(scope.title, 'hello from a relative import');
    assert.equal(scope.count, 3);
    assert.equal(scope.ok, 'kept');
    assert.equal(scope.broken, undefined);
    assert.ok(warns.some((line) => /field broken/.test(line) && /skipped/.test(line)), `expected a skipped-field warning, got: ${warns.join(' | ')}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
