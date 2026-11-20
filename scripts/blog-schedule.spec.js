'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadExportedValues } = require('./angular-static');
const { pages, buildSitemap, render } = require('./prerender-seo');
const { publishedBundle } = require('./write-published-posts');

const ROOT = path.join(__dirname, '..');
const schedule = loadExportedValues(path.join(ROOT, 'src/app/pages/blog/schedule.ts'));
const allPosts = require('../src/app/pages/blog/posts.json');
const bodies = require('../src/app/pages/blog/posts-content.json');
const template = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');

const BATCH = [
  ['2026-11-21', 'plausible-vs-pulzivo-vs-ga4', 'plausible vs ga4 for small sites'],
  ['2026-11-22', 'track-utm-campaigns', 'how to track utm campaigns'],
  ['2026-11-23', 'core-web-vitals-for-site-owners', 'core web vitals lcp inp cls'],
  ['2026-11-24', 'what-cookieless-analytics-means', 'what cookieless analytics means'],
  ['2026-11-25', 'rage-clicks-and-dead-clicks', 'rage clicks and dead clicks'],
  ['2026-11-26', 'measure-form-abandonment', 'how to measure form abandonment'],
  ['2026-11-27', 'bounce-rate-without-ga4', 'bounce rate without google analytics'],
];

function locCount(xml) {
  return [...xml.matchAll(/<loc>/g)].length;
}

function editorialLinks(html) {
  return [...String(html).matchAll(/href="(\/[^"]*)"/g)]
    .map((match) => match[1])
    .filter((href) => href !== '/signup' && !href.startsWith('/signup?'));
}

test('reading time is computed from the HTML at 225 wpm, rounded up, minimum 1', () => {
  assert.equal(schedule.WORDS_PER_MINUTE, 225);
  assert.ok(schedule.WORDS_PER_MINUTE >= 200 && schedule.WORDS_PER_MINUTE <= 230);
  assert.equal(schedule.readingMinutes('<p>one</p>'), 1);
  assert.equal(schedule.readingMinutes(`<p>${'word '.repeat(225)}</p>`), 1);
  assert.equal(schedule.readingMinutes(`<p>${'word '.repeat(226)}</p>`), 2);
  assert.equal(schedule.readingLabel('<p>one two</p>'), '1 min read');
  for (const post of allPosts) {
    assert.equal(post.minutes, undefined, `${post.slug} must not hard-code minutes`);
    const label = schedule.readingLabel(bodies[post.slug]);
    assert.match(label, /^\d+ min read$/);
  }
});

test('America/Toronto date and the 11:05 UTC deploy cutoff', () => {
  const prev = process.env.PULZIVO_AS_OF;
  delete process.env.PULZIVO_AS_OF;
  try {
    assert.equal(schedule.torontoDate(new Date('2026-11-21T04:30:00Z')), '2026-11-20');
    assert.equal(schedule.torontoDate(new Date('2026-11-21T05:30:00Z')), '2026-11-21');
    assert.equal(schedule.liveAsOf(new Date('2026-11-21T06:17:00Z')), '2026-11-20');
    assert.equal(schedule.liveAsOf(new Date('2026-11-21T11:04:00Z')), '2026-11-20');
    assert.equal(schedule.liveAsOf(new Date('2026-11-21T11:05:00Z')), '2026-11-21');
    assert.equal(schedule.liveAsOf(new Date('2026-11-20T21:10:00Z')), '2026-11-20');
    assert.equal(schedule.asOfDate(new Date('2026-11-21T04:30:00Z')), '2026-11-20');
  } finally {
    if (prev === undefined) delete process.env.PULZIVO_AS_OF;
    else process.env.PULZIVO_AS_OF = prev;
  }
});

test('PULZIVO_AS_OF overrides the clock and is how tests simulate a later day', () => {
  const prev = process.env.PULZIVO_AS_OF;
  process.env.PULZIVO_AS_OF = '2026-11-27';
  try {
    assert.equal(schedule.asOfDate(new Date('2026-11-20T15:00:00Z')), '2026-11-27');
    assert.equal(pages().filter((page) => page.post).length, 10);
    assert.equal(locCount(buildSitemap('2026-11-27')), 27);
  } finally {
    if (prev === undefined) delete process.env.PULZIVO_AS_OF;
    else process.env.PULZIVO_AS_OF = prev;
  }
});

test('2026-11-20 excludes the batch and 2026-11-27 includes it', () => {
  const early = pages('2026-11-20');
  const late = pages('2026-11-27');
  const earlySlugs = early.filter((page) => page.post).map((page) => page.post.slug);
  const lateSlugs = late.filter((page) => page.post).map((page) => page.post.slug);
  assert.deepEqual(earlySlugs, [
    'simple-google-analytics-alternative',
    'privacy-friendly-analytics-small-sites',
    'pulzivo-vs-ga4-vs-plausible-pricing',
  ]);
  assert.equal(early.length, 20);
  assert.equal(locCount(buildSitemap('2026-11-20', '2026-11-20')), 20);
  assert.equal(lateSlugs.length, 10);
  assert.equal(late.length, 27);
  assert.equal(locCount(buildSitemap('2026-11-27', '2026-11-27')), 27);
  for (const [, slug] of BATCH) {
    assert.equal(early.some((page) => page.path === `blog/${slug}`), false, slug);
    assert.equal(late.some((page) => page.path === `blog/${slug}`), true, slug);
    assert.doesNotMatch(buildSitemap('2026-11-20', '2026-11-20'), new RegExp(slug));
    assert.match(buildSitemap('2026-11-27', '2026-11-27'), new RegExp(`<loc>https://pulzivo.com/blog/${slug}</loc>`));
  }
  const home = render(template, early.find((page) => page.path === ''), '2026-11-20');
  for (const [, slug] of BATCH) {
    assert.equal(home.includes(`/blog/${slug}`), false, `homepage nav leaked ${slug}`);
  }
});

test('each batch post appears on its publishDate and not the day before', () => {
  for (const [date, slug] of BATCH) {
    const previous = schedule.shiftIsoDate(date, -1);
    assert.equal(pages(previous).some((page) => page.path === `blog/${slug}`), false, previous);
    assert.equal(pages(date).some((page) => page.path === `blog/${slug}`), true, date);
    const page = pages(date).find((item) => item.path === `blog/${slug}`);
    const html = render(template, page, date);
    assert.match(html, new RegExp(`"datePublished": "${date}"|"datePublished":"${date}"`));
    assert.match(html, new RegExp(`<link rel="canonical" href="https://pulzivo.com/blog/${slug}">`));
    assert.match(html, /<span class="reading-time">\d+ min read<\/span>/);
    const hrefs = [...html.matchAll(/href="\/blog\/([^"]+)"/g)].map((match) => match[1]);
    const live = new Set(pages(date).filter((item) => item.post).map((item) => item.post.slug));
    for (const linked of hrefs) {
      assert.equal(live.has(linked), true, `${slug} on ${date} links to unpublished ${linked}`);
    }
  }
});

test('new articles are 900-1500 words, titled, described, and linked', () => {
  const titles = new Set(allPosts.map((post) => post.title));
  assert.equal(titles.size, allPosts.length);
  for (const [date, slug, keyword] of BATCH) {
    const post = allPosts.find((item) => item.slug === slug);
    assert.ok(post, slug);
    assert.equal(post.publishDate, date);
    assert.equal(post.date, date);
    assert.equal(post.keyword, undefined, 'keyword stays out of the public post object');
    assert.ok(keyword.length > 0);
    assert.ok(post.title.length > 0 && post.title.length <= 60, `${slug} title ${post.title.length}`);
    assert.ok(post.description.length > 0 && post.description.length <= 155, `${slug} description ${post.description.length}`);
    const html = bodies[slug];
    const words = schedule.wordCount(html);
    assert.ok(words >= 900 && words <= 1500, `${slug} is ${words} words`);
    assert.match(html, /<h2>/);
    assert.match(html, /<h3>/);
    const links = editorialLinks(html);
    assert.ok(links.length >= 2 && links.length <= 4, `${slug} has ${links.length} editorial links: ${links.join(', ')}`);
    assert.match(html, /href="\/signup"/);
    assert.doesNotMatch(html, /GDPR|CCPA|cookie banner/i);
    assert.doesNotMatch(html, /(?<![0-9])5\s*[Kk][Bb]\b/);
    assert.doesNotMatch(html, /today only|hurry|last chance|only \d+ left|countdown/i);
    if (/events a month|events\/month/i.test(html)) assert.match(html, /10,000 events/);
  }
});

test('existing posts show a computed reading time in the prerendered header', () => {
  const page = pages('2026-11-20').find((item) => item.path === 'blog/simple-google-analytics-alternative');
  const html = render(template, page, '2026-11-20');
  const label = schedule.readingLabel(bodies[page.post.slug]);
  assert.match(html, new RegExp(`<span class="reading-time">${label}</span>`));
  assert.match(html, /<time datetime="2026-10-29">2026-10-29<\/time>/);
  const index = render(template, pages('2026-11-20').find((item) => item.path === 'blog'), '2026-11-20');
  assert.match(index, new RegExp(label.replace(' ', ' ')));
  assert.match(index, /min read/);
});

test('the Angular snapshot committed for 2026-11-20 omits future posts', () => {
  const bundle = publishedBundle('2026-11-20');
  const later = publishedBundle('2026-11-27');
  const posts = require('../src/app/pages/blog/published-posts.json');
  const content = require('../src/app/pages/blog/published-content.json');
  assert.deepEqual(posts, bundle.posts);
  assert.deepEqual(content, bundle.content);
  assert.equal(bundle.posts.length, 3);
  assert.equal(later.posts.length, 10);
  assert.equal(later.content['bounce-rate-without-ga4']?.includes('<h2>'), true);
  assert.equal(bundle.content['bounce-rate-without-ga4'], undefined);
  const routes = fs.readFileSync(path.join(ROOT, 'src/app/app.routes.ts'), 'utf8');
  const blog = fs.readFileSync(path.join(ROOT, 'src/app/pages/blog/blog.ts'), 'utf8');
  const post = fs.readFileSync(path.join(ROOT, 'src/app/pages/blog/blog-post.ts'), 'utf8');
  assert.match(routes, /published-posts\.json/);
  assert.doesNotMatch(routes, /blog\/posts\.json/);
  assert.match(blog, /published-posts\.json/);
  assert.match(blog, /readingMinutes/);
  assert.match(post, /published-content\.json/);
  assert.doesNotMatch(post, /posts-content\.json/);
});

test('the daily deploy keeps the cPanel hardening and does not pin the sitemap', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/deploy-cpanel.yml'), 'utf8');
  assert.match(yml, /cron:\s*'5 11 \* \* \*'/);
  assert.match(yml, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(yml, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/);
  assert.match(yml, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.match(yml, /SamKirkland\/FTP-Deploy-Action@a51268f67f6605236975928ae28b0f7e9971d50a/);
  assert.match(yml, /scripts\/clear-ftp-sync-state\.py/);
  assert.match(yml, /scripts\/deploy-verify\.js/);
  assert.match(yml, /protocol: ftp/);
  assert.doesNotMatch(yml, /PULZIVO_AS_OF\s*[:=]/);
  const verify = fs.readFileSync(path.join(ROOT, 'scripts/deploy-verify.js'), 'utf8');
  assert.match(verify, /pulzivo-should-not-exist\.html/);
  assert.match(verify, /urlsFromSitemap/);
});
