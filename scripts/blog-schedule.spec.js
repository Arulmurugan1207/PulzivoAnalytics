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

function visibleHtml(html) {
  const start = html.indexOf('<div class="prerendered">');
  const hidden = html.indexOf('<nav class="prerendered-nav');
  assert.ok(start !== -1 && hidden > start, 'prerendered body missing');
  return html.slice(start, hidden);
}

function linkedPaths(html) {
  return [...String(html).matchAll(/href="([^"]+)"/g)].map((match) => {
    const pathName = match[1].split('?')[0].split('#')[0];
    if (!pathName.startsWith('/')) return null;
    const trimmed = pathName.replace(/\/$/, '');
    return trimmed || '/';
  }).filter(Boolean);
}

test('no future-dated article appears in homepage links or the sitemap', () => {
  for (const asOf of ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-27']) {
    const published = schedule.publishedPosts(allPosts, asOf);
    const future = allPosts.filter((post) => !published.some((item) => item.slug === post.slug));
    const homePage = pages(asOf).find((page) => page.path === '');
    const home = render(template, homePage, asOf);
    const sitemap = buildSitemap(asOf, asOf);
    const visible = visibleHtml(home);
    const section = visible.match(/<section\b[^>]*id="latest-articles"[^>]*>[\s\S]*?<\/section>/);
    assert.ok(section, `homepage is missing Latest articles on ${asOf}`);
    assert.match(section[0], /<h2>Latest articles<\/h2>/);
    const linked = [...section[0].matchAll(/href="\/blog\/([^"?#]+)"/g)].map((match) => match[1]);
    const expected = schedule.latestPosts(published, 3).map((post) => post.slug);
    assert.deepEqual(linked, expected, asOf);
    assert.ok(linked.length > 0 && linked.length <= 3, asOf);
    for (const slug of linked) {
      assert.equal(published.some((post) => post.slug === slug), true, slug);
    }
    for (const post of future) {
      assert.equal(home.includes(`/blog/${post.slug}`), false, `${post.slug} leaked onto the homepage as of ${asOf}`);
      assert.equal(sitemap.includes(`/blog/${post.slug}`), false, `${post.slug} leaked into the sitemap as of ${asOf}`);
      assert.equal(sitemap.includes(post.slug), false, `${post.slug} leaked into the sitemap as of ${asOf}`);
    }
    for (const post of published) {
      assert.match(sitemap, new RegExp(`<loc>https://pulzivo.com/blog/${post.slug}</loc>`));
    }
  }
});

test('the blog index links every published post with a plain href', () => {
  for (const asOf of ['2026-11-20', '2026-11-22', '2026-11-27']) {
    const published = schedule.publishedPosts(allPosts, asOf);
    const index = render(template, pages(asOf).find((page) => page.path === 'blog'), asOf);
    const visible = visibleHtml(index);
    for (const post of published) {
      assert.match(visible, new RegExp(`<a href="/blog/${post.slug}">[\\s\\S]*${post.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
    for (const post of allPosts) {
      if (published.some((item) => item.slug === post.slug)) continue;
      assert.equal(index.includes(`/blog/${post.slug}`), false, `${post.slug} leaked into the blog index as of ${asOf}`);
    }
  }
});

test('each article ends with related published posts and a soft start-free link', () => {
  for (const asOf of ['2026-11-20', '2026-11-27']) {
    const published = schedule.publishedPosts(allPosts, asOf);
    for (const page of pages(asOf).filter((item) => item.post)) {
      const html = render(template, page, asOf);
      const visible = visibleHtml(html);
      const article = visible.match(/<article[\s\S]*?<\/article>/);
      assert.ok(article, page.path);
      assert.match(article[0], /<nav class="post-related" aria-label="Related articles"><h2>Related articles<\/h2>/);
      assert.match(article[0], /<aside class="post-cta">[\s\S]*<h2>Start free<\/h2>[\s\S]*<a href="\/signup">Start free<\/a>/);
      assert.doesNotMatch(article[0], /today only|hurry|last chance|only \d+ left|countdown/i);
      const related = article[0].match(/<nav class="post-related"[\s\S]*?<\/nav>/);
      const slugs = [...related[0].matchAll(/href="\/blog\/([^"]+)"/g)].map((match) => match[1]);
      const expected = schedule.relatedPosts(published, page.post.slug, 3).map((post) => post.slug);
      assert.deepEqual(slugs, expected, `${page.path} on ${asOf}`);
      assert.equal(slugs.includes(page.post.slug), false);
      assert.ok(slugs.length >= 2 && slugs.length <= 3, `${page.path} has ${slugs.length} related`);
      for (const slug of slugs) {
        assert.equal(published.some((post) => post.slug === slug), true, slug);
      }
    }
  }
});

test('docs and the UTM article link the builder in the prerendered body', () => {
  const asOf = '2026-11-22';
  const docs = render(template, pages(asOf).find((page) => page.path === 'docs'), asOf);
  const docsBody = visibleHtml(docs).replace(/<header[\s\S]*?<\/header>/, '').replace(/<footer[\s\S]*?<\/footer>/, '');
  assert.match(docsBody, /<a href="\/tools\/utm-builder">free UTM builder<\/a>/);
  const article = render(template, pages(asOf).find((page) => page.path === 'blog/track-utm-campaigns'), asOf);
  const body = visibleHtml(article).match(/<article[\s\S]*?<\/article>/)[0];
  assert.match(body, /<a href="\/tools\/utm-builder">UTM campaign URL builder<\/a>/);
});

test('every sitemap URL has a visible inbound link from another prerendered page', () => {
  const asOf = '2026-11-27';
  const list = pages(asOf);
  const rendered = list.map((page) => ({ page, html: visibleHtml(render(template, page, asOf)) }));
  for (const target of list) {
    const want = target.path ? `/${target.path}` : '/';
    const from = rendered.filter(({ page, html }) => page.path !== target.path && linkedPaths(html).includes(want));
    assert.ok(from.length > 0, `${want} has no visible inbound <a href>`);
  }
  const footer = fs.readFileSync(path.join(ROOT, 'src/app/layout/footer/footer.html'), 'utf8');
  for (const pathName of ['/blog', '/tools/utm-builder', '/use-cases', '/ga4-alternative', '/cookieless-analytics', '/compare/plausible', '/compare/fathom', '/compare/google-analytics', '/compare/simple-analytics']) {
    assert.match(footer, new RegExp(`routerLink="${pathName}"`));
  }
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
