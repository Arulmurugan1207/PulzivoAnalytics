'use strict';

/**
 * Fetch the live marketing site and fail if it drifts from this repo.
 *
 * No secrets. A failing scheduled run is emailed by GitHub to the account
 * that introduced (or last edited) this workflow's cron. See
 * .github/workflows/monitor-site.yml.
 *
 * Usage: node scripts/monitor-live-site.js [--origin https://pulzivo.com]
 */

const {
  ORIGIN,
  GOOGLE_VERIFICATION_FILES,
  USER_AGENTS,
  loadExpectedPages,
  assessPage,
  assessSitemap,
  assessRobots,
  repoSitemapAgrees,
  pathnameOf,
} = require('./site-integrity');

const path = require('node:path');

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const origin = arg('--origin', ORIGIN).replace(/\/$/, '');
const root = path.join(__dirname, '..');

async function fetchText(url, userAgent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    const body = await response.text();
    return { status: response.status, url: response.url, body };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const expected = loadExpectedPages(root);
  const problems = [];
  const repoProblems = repoSitemapAgrees(expected);
  for (const problem of repoProblems) problems.push(`repo: ${problem}`);

  const agents = Object.entries(USER_AGENTS);
  for (const loc of expected.sitemapLocs) {
    const url = new URL(loc);
    url.protocol = 'https:';
    url.hostname = new URL(origin).hostname;
    const pageUrl = url.toString();
    const meta = expected.titles.get(pathnameOf(loc));
    for (const [label, userAgent] of agents) {
      let response;
      try {
        response = await fetchText(pageUrl, userAgent);
      } catch (error) {
        problems.push(`${label} ${pageUrl} fetch failed: ${error.message}`);
        continue;
      }
      if (response.status !== 200) {
        problems.push(`${label} ${pageUrl} status ${response.status}`);
        continue;
      }
      if (!meta) {
        problems.push(`${label} ${pageUrl} has no expected title in seo-routes.json or posts.json`);
        continue;
      }
      for (const problem of assessPage({
        html: response.body,
        finalUrl: response.url,
        expectedUrl: meta.url,
        expectedTitle: meta.title,
      })) {
        problems.push(`${label} ${pageUrl}: ${problem}`);
      }
    }
  }

  for (const [label, userAgent] of agents) {
    for (const [name, assess] of [
      ['/sitemap.xml', (body) => assessSitemap(body, expected.sitemapLocs)],
      ['/robots.txt', (body) => assessRobots(body)],
    ]) {
      const url = `${origin}${name}`;
      let response;
      try {
        response = await fetchText(url, userAgent);
      } catch (error) {
        problems.push(`${label} ${url} fetch failed: ${error.message}`);
        continue;
      }
      if (response.status !== 200) {
        problems.push(`${label} ${url} status ${response.status}`);
        continue;
      }
      for (const problem of assess(response.body)) problems.push(`${label} ${url}: ${problem}`);
    }

    for (const file of GOOGLE_VERIFICATION_FILES) {
      const url = `${origin}/${file}`;
      let response;
      try {
        response = await fetchText(url, userAgent);
      } catch (error) {
        problems.push(`${label} ${url} fetch failed: ${error.message}`);
        continue;
      }
      if (response.status !== 404) {
        problems.push(`${label} ${url} status ${response.status}, expected 404`);
      }
    }
  }

  if (problems.length) {
    console.error(`Site integrity failed (${problems.length}):`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }
  console.log(`Site integrity ok: ${expected.sitemapLocs.length} sitemap URLs, /sitemap.xml, /robots.txt, ${GOOGLE_VERIFICATION_FILES.length} google*.html probes, ${agents.length} user agents.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
