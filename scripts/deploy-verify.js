'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { GOOGLE_VERIFICATION_FILES, locsFromSitemap, pathnameOf } = require('./site-integrity');

function normalizeBody(value) {
  return String(value).replace(/\r\n/g, '\n').trim();
}

function localPathForUrl(distDir, urlString) {
  const parsed = new URL(urlString);
  const pathName = decodeURIComponent(parsed.pathname);
  if (pathName === '/' || pathName === '/index.html') return path.join(distDir, 'index.html');
  const relative = pathName.replace(/^\/+/, '');
  if (/\.[a-z0-9]+$/i.test(relative)) return path.join(distDir, relative);
  return path.join(distDir, relative, 'index.html');
}

function firstMismatch(local, remote) {
  const a = normalizeBody(local).split('\n');
  const b = normalizeBody(remote).split('\n');
  const limit = Math.max(a.length, b.length);
  for (let i = 0; i < limit; i += 1) {
    if (a[i] !== b[i]) {
      return `line ${i + 1}\n  local:  ${a[i] ?? '<eof>'}\n  remote: ${b[i] ?? '<eof>'}`;
    }
  }
  return '';
}

function cacheBust(url, stamp) {
  const parsed = new URL(url);
  parsed.searchParams.set('pzverify', String(stamp));
  return parsed.toString();
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': 'PulzivoDeployVerify/1.0',
        Accept: '*/*',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    const body = await response.text();
    return { status: response.status, url: response.url, location: response.headers.get('location'), body };
  } finally {
    clearTimeout(timer);
  }
}

async function verifyDeployedSite({ origin, distDir, stamp = Date.now() }) {
  const problems = [];
  const root = origin.replace(/\/$/, '');
  const sitemapPath = path.join(distDir, 'sitemap.xml');
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const locs = locsFromSitemap(sitemap);
  const pages = [...locs, `${root}/sitemap.xml`, `${root}/robots.txt`];

  for (const loc of pages) {
    const target = new URL(loc, `${root}/`);
    target.protocol = 'https:';
    target.hostname = new URL(root).hostname;
    const expectedPath = localPathForUrl(distDir, target.toString());
    if (!fs.existsSync(expectedPath)) {
      problems.push(`build is missing ${path.relative(distDir, expectedPath)} for ${target.pathname}`);
      continue;
    }
    const requestUrl = cacheBust(target.toString(), stamp);
    let response;
    try {
      response = await fetchText(requestUrl);
    } catch (error) {
      problems.push(`${target.pathname} fetch failed: ${error.message}`);
      continue;
    }
    if (response.status !== 200) {
      problems.push(`${target.pathname} status ${response.status}${response.location ? ` -> ${response.location}` : ''}`);
      continue;
    }
    const local = fs.readFileSync(expectedPath, 'utf8');
    const diff = firstMismatch(local, response.body);
    if (diff) problems.push(`${target.pathname} does not match ${path.relative(distDir, expectedPath)}\n${diff}`);
  }

  const probes = [
    ...GOOGLE_VERIFICATION_FILES.map((file) => `/${file}`),
    '/pulzivo-should-not-exist.html',
    '/pulzivo-should-not-exist.php',
  ];
  for (const probe of probes) {
    const requestUrl = cacheBust(`${root}${probe}`, stamp);
    let response;
    try {
      response = await fetchText(requestUrl);
    } catch (error) {
      problems.push(`${probe} fetch failed: ${error.message}`);
      continue;
    }
    if (response.status !== 404) {
      problems.push(`${probe} status ${response.status}, expected 404`);
    }
  }

  return { problems, checked: pages.length + probes.length, pathnames: locs.map((loc) => pathnameOf(loc)) };
}

async function main() {
  const originFlag = process.argv.indexOf('--origin');
  const distFlag = process.argv.indexOf('--dist');
  const origin = originFlag === -1 ? 'https://pulzivo.com' : process.argv[originFlag + 1];
  const distDir = path.resolve(distFlag === -1 ? 'dist/simpletrack-prime-ng/browser' : process.argv[distFlag + 1]);
  const result = await verifyDeployedSite({ origin, distDir });
  if (result.problems.length) {
    console.error(`Deploy verification failed (${result.problems.length}):`);
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exit(1);
  }
  console.log(`Deploy verification ok: ${result.checked} URLs match the build or 404 as required.`);
}

module.exports = {
  normalizeBody,
  localPathForUrl,
  firstMismatch,
  cacheBust,
  verifyDeployedSite,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
