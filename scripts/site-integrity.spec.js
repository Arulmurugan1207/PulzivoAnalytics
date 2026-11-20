'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ORIGIN,
  GOOGLE_VERIFICATION_FILES,
  assessPage,
  assessRobots,
  assessSitemap,
  extractTitle,
  loadExpectedPages,
  locsFromSitemap,
  repoSitemapAgrees,
  visibleText,
} = require('./site-integrity');

const ROOT = require('node:path').join(__dirname, '..');

function page(title, canonical, extra = '') {
  return `<!doctype html><html><head>
    <title>${title}</title>
    <link rel="canonical" href="${canonical}">
    ${extra}
  </head><body><h1>Pulzivo</h1><p>Privacy-first analytics.</p></body></html>`;
}

test('repo sitemap covers every SEO route and blog post', () => {
  const expected = loadExpectedPages(ROOT);
  assert.deepEqual(repoSitemapAgrees(expected), []);
  assert.ok(expected.sitemapLocs.includes(`${ORIGIN}/pricing`));
  assert.ok(expected.sitemapLocs.includes(`${ORIGIN}/`));
  assert.equal(GOOGLE_VERIFICATION_FILES.length, 2);
});

test('clean marketing HTML passes and spam or off-site canonicals fail', () => {
  const expected = loadExpectedPages(ROOT);
  const pricing = expected.titles.get('/pricing');
  assert.deepEqual(assessPage({
    html: page(pricing.title, pricing.url),
    finalUrl: pricing.url,
    expectedUrl: pricing.url,
    expectedTitle: pricing.title,
  }), []);

  const spam = assessPage({
    html: page(pricing.title, pricing.url, '<p>Situs slot gacor togel betogel</p>'),
    finalUrl: pricing.url,
    expectedUrl: pricing.url,
    expectedTitle: pricing.title,
  });
  assert.ok(spam.some((problem) => problem.includes('slot')));
  assert.ok(spam.some((problem) => problem.includes('togel')));
  assert.ok(spam.some((problem) => problem.includes('gacor')));
  assert.ok(spam.some((problem) => problem.includes('betogel')));

  const hijack = assessPage({
    html: page(pricing.title, 'https://evil.example/pricing', '<link rel="amphtml" href="https://evil.example/amp">'),
    finalUrl: 'https://evil.example/pricing',
    expectedUrl: pricing.url,
    expectedTitle: pricing.title,
  });
  assert.ok(hijack.some((problem) => problem.includes('canonical points at evil.example')));
  assert.ok(hijack.some((problem) => problem.includes('amphtml points at evil.example')));
  assert.ok(hijack.some((problem) => problem.includes('response URL host')));
});

test('class names containing slot are not spam, hidden keyword stuffing is', () => {
  assert.equal(visibleText('<div class="improve-slot">Dashboard</div>'), 'Dashboard');
  const expected = loadExpectedPages(ROOT);
  const home = expected.titles.get('/');
  const clean = assessPage({
    html: page(home.title, home.url, '<div class="improve-slot"></div>'),
    finalUrl: home.url,
    expectedUrl: home.url,
    expectedTitle: home.title,
  });
  assert.deepEqual(clean, []);
  const hidden = assessPage({
    html: page(home.title, home.url, '<meta name="keywords" content="togel">'),
    finalUrl: home.url,
    expectedUrl: home.url,
    expectedTitle: home.title,
  });
  assert.ok(hidden.some((problem) => problem.includes('togel')));
});

test('sitemap and robots checks reject extra hosts and missing markers', () => {
  const expected = loadExpectedPages(ROOT);
  assert.deepEqual(assessSitemap(expected.sitemapXml, expected.sitemapLocs), []);
  const dirty = expected.sitemapXml.replace(
    '</urlset>',
    '  <url><loc>https://spam.example/slot-gacor</loc></url>\n</urlset>',
  );
  const problems = assessSitemap(dirty, expected.sitemapLocs);
  assert.ok(problems.some((problem) => problem.includes('spam.example')));
  assert.ok(problems.some((problem) => problem.includes('slot') || problem.includes('gacor')));

  const robots = require('node:fs').readFileSync(require('node:path').join(ROOT, 'public/robots.txt'), 'utf8');
  assert.deepEqual(assessRobots(robots), []);
  assert.ok(assessRobots('User-agent: *\nAllow: /\n').some((problem) => problem.includes('Sitemap')));
  assert.deepEqual(locsFromSitemap('<loc>https://pulzivo.com/pricing</loc>'), ['https://pulzivo.com/pricing']);
  assert.equal(extractTitle('<title>Pricing — Free Plan &amp; Paid Tiers | Pulzivo Analytics</title>').includes('&'), true);
});
