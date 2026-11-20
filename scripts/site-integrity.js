'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ORIGIN = 'https://pulzivo.com';
const SITE = 'Pulzivo Analytics';

// Gambling SEO terms from the 2026-11-20 compromise. "slot" is matched as a
// word in visible text so class names like "improve-slot" in other bundles
// are not the signal; the other three are specific enough to match anywhere.
const SPAM_TEXT = [
  ['slot', /\bslot\b/i],
  ['togel', /togel/i],
  ['gacor', /gacor/i],
  ['betogel', /betogel/i],
];
const SPAM_RAW = [
  ['togel', /togel/i],
  ['gacor', /gacor/i],
  ['betogel', /betogel/i],
];

const GOOGLE_VERIFICATION_FILES = [
  'googlec6a347bbda5b0ae1.html',
  'googleab7dc7f91204aed1.html',
];

const USER_AGENTS = {
  browser: 'Mozilla/5.0 (compatible; PulzivoSiteMonitor/1.0; +https://pulzivo.com/)',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
};

function decodeEntities(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function collapse(value) {
  return decodeEntities(value).replace(/\s+/g, ' ').trim();
}

function visibleText(html) {
  return collapse(
    String(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

function extractTitle(html) {
  const match = String(html).match(/<title>([\s\S]*?)<\/title>/i);
  return match ? collapse(match[1]) : '';
}

function linkHrefs(html, rel) {
  const hrefs = [];
  const re = /<link\b[^>]*>/gi;
  let match;
  while ((match = re.exec(String(html)))) {
    const tag = match[0];
    const relMatch = tag.match(/\brel\s*=\s*["']([^"']+)["']/i);
    if (!relMatch) continue;
    const rels = relMatch[1].toLowerCase().split(/\s+/);
    if (!rels.includes(rel)) continue;
    const hrefMatch = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (hrefMatch) hrefs.push(decodeEntities(hrefMatch[1]).trim());
  }
  return hrefs;
}

function locsFromSitemap(xml) {
  return [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) => match[1].trim());
}

function pathnameOf(url) {
  const parsed = new URL(url, ORIGIN);
  const pathName = parsed.pathname.replace(/\/+$/, '');
  return pathName === '' ? '/' : pathName;
}

function spamHits(value, rules) {
  return rules.filter(([, re]) => re.test(value)).map(([name]) => name);
}

function loadExpectedPages(root) {
  const seoRoutes = JSON.parse(fs.readFileSync(path.join(root, 'src/app/seo/seo-routes.json'), 'utf8'));
  const posts = JSON.parse(fs.readFileSync(path.join(root, 'src/app/pages/blog/posts.json'), 'utf8'));
  const sitemapXml = fs.readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8');
  const titles = new Map();
  for (const route of seoRoutes) {
    const url = route.path ? `${ORIGIN}/${route.path}` : `${ORIGIN}/`;
    titles.set(pathnameOf(url), { url, title: route.title });
  }
  for (const post of posts) {
    const url = `${ORIGIN}/blog/${post.slug}`;
    titles.set(pathnameOf(url), { url, title: `${post.title} | ${SITE}` });
  }
  const sitemapLocs = locsFromSitemap(sitemapXml);
  return { titles, sitemapLocs, sitemapXml };
}

function assessPage({ html, finalUrl, expectedUrl, expectedTitle }) {
  const problems = [];
  const title = extractTitle(html);
  if (title !== expectedTitle) {
    problems.push(`title ${JSON.stringify(title)} != ${JSON.stringify(expectedTitle)}`);
  }
  const textHits = spamHits(visibleText(html), SPAM_TEXT);
  const rawHits = spamHits(html, SPAM_RAW);
  const hits = [...new Set([...textHits, ...rawHits])];
  if (hits.length) problems.push(`spam keywords: ${hits.join(', ')}`);

  const canonicals = linkHrefs(html, 'canonical');
  if (!canonicals.length) {
    problems.push('missing canonical');
  }
  for (const href of canonicals) {
    let parsed;
    try {
      parsed = new URL(href, finalUrl || expectedUrl);
    } catch {
      problems.push(`canonical is not a URL: ${href}`);
      continue;
    }
    if (parsed.hostname !== 'pulzivo.com') {
      problems.push(`canonical points at ${parsed.hostname}`);
    } else if (pathnameOf(parsed.href) !== pathnameOf(expectedUrl)) {
      problems.push(`canonical path ${parsed.pathname} != ${pathnameOf(expectedUrl)}`);
    }
  }
  for (const href of linkHrefs(html, 'amphtml')) {
    let parsed;
    try {
      parsed = new URL(href, finalUrl || expectedUrl);
    } catch {
      problems.push(`amphtml is not a URL: ${href}`);
      continue;
    }
    if (parsed.hostname !== 'pulzivo.com') {
      problems.push(`amphtml points at ${parsed.hostname}`);
    }
  }
  if (finalUrl) {
    let parsed;
    try {
      parsed = new URL(finalUrl);
    } catch {
      problems.push(`final URL is not a URL: ${finalUrl}`);
      parsed = null;
    }
    if (parsed && parsed.hostname !== 'pulzivo.com') {
      problems.push(`response URL host ${parsed.hostname}`);
    }
    if (parsed && pathnameOf(parsed.href) !== pathnameOf(expectedUrl)) {
      problems.push(`response path ${parsed.pathname} != ${pathnameOf(expectedUrl)}`);
    }
  }
  return problems;
}

function assessSitemap(xml, expectedLocs) {
  const problems = [];
  const hits = spamHits(xml, [...SPAM_TEXT, ...SPAM_RAW]);
  if (hits.length) problems.push(`sitemap spam keywords: ${[...new Set(hits)].join(', ')}`);
  const locs = locsFromSitemap(xml);
  if (!locs.length) problems.push('sitemap has no <loc>');
  const expected = new Set(expectedLocs.map((loc) => pathnameOf(loc)));
  const actual = new Set();
  for (const loc of locs) {
    let parsed;
    try {
      parsed = new URL(loc);
    } catch {
      problems.push(`sitemap loc is not a URL: ${loc}`);
      continue;
    }
    if (parsed.hostname !== 'pulzivo.com') {
      problems.push(`sitemap loc host ${parsed.hostname} (${loc})`);
      continue;
    }
    if (parsed.protocol !== 'https:') problems.push(`sitemap loc is not https: ${loc}`);
    actual.add(pathnameOf(loc));
  }
  for (const loc of expected) {
    if (!actual.has(loc)) problems.push(`sitemap missing ${loc}`);
  }
  for (const loc of actual) {
    if (!expected.has(loc)) problems.push(`unexpected sitemap loc ${loc}`);
  }
  return problems;
}

function assessRobots(text) {
  const problems = [];
  const hits = spamHits(text, [...SPAM_TEXT, ...SPAM_RAW]);
  if (hits.length) problems.push(`robots.txt spam keywords: ${[...new Set(hits)].join(', ')}`);
  if (!/Sitemap:\s*https:\/\/pulzivo\.com\/sitemap\.xml/i.test(text)) {
    problems.push('robots.txt is missing Sitemap: https://pulzivo.com/sitemap.xml');
  }
  if (!/Disallow:\s*\/dashboard\b/i.test(text)) problems.push('robots.txt is missing Disallow: /dashboard');
  const sitemapHosts = [...String(text).matchAll(/Sitemap:\s*(\S+)/gi)].map((match) => match[1]);
  for (const href of sitemapHosts) {
    try {
      const parsed = new URL(href);
      if (parsed.hostname !== 'pulzivo.com') problems.push(`robots.txt sitemap host ${parsed.hostname}`);
    } catch {
      problems.push(`robots.txt sitemap is not a URL: ${href}`);
    }
  }
  return problems;
}

function repoSitemapAgrees(expected) {
  const problems = [];
  const titled = new Set(expected.titles.keys());
  const listed = new Set(expected.sitemapLocs.map((loc) => pathnameOf(loc)));
  for (const pathName of titled) {
    if (!listed.has(pathName)) problems.push(`repo sitemap missing ${pathName}`);
  }
  for (const pathName of listed) {
    if (!titled.has(pathName)) problems.push(`repo sitemap has no title for ${pathName}`);
  }
  return problems;
}

module.exports = {
  ORIGIN,
  GOOGLE_VERIFICATION_FILES,
  USER_AGENTS,
  visibleText,
  extractTitle,
  linkHrefs,
  locsFromSitemap,
  pathnameOf,
  loadExpectedPages,
  assessPage,
  assessSitemap,
  assessRobots,
  repoSitemapAgrees,
};
