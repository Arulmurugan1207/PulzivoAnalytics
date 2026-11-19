import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SHARE_BADGE_HREF, SHARE_CTA_HREF, SHARE_CTA_LINE,
  chartPoints, displayShareUrl, parseGa4Import, parsePublicSummary, parseShareLink,
} from './share.logic.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('share link prefers the API url and falls back to /share/:token', () => {
  assert.equal(parseShareLink({ token: 'abc', url: 'https://pulzivo.com/share/abc' })?.url, 'https://pulzivo.com/share/abc');
  assert.equal(displayShareUrl({ token: 'abc', url: '/share/abc' }, 'https://pulzivo.com'), 'https://pulzivo.com/share/abc');
  assert.equal(parseShareLink({}), null);
  assert.equal(parseShareLink(null), null);
});

test('public summary prefers the account API fields', () => {
  const summary = parsePublicSummary({
    site: 'example.com',
    range: '7d',
    visitors: 3,
    pageviews: 8,
    topPages: [{ path: '/pricing', title: 'Pricing', visitors: 4, views: 99 }],
    sources: [{ name: 'Google', visitors: 2, visits: 9 }],
    countries: [{ code: 'CA', name: 'Canada', visitors: 1, views: 5 }],
    chart: [{ date: '2026-11-01', visitors: 1, pageviews: 5 }],
  });
  assert.equal(summary?.siteName, 'example.com');
  assert.equal(summary?.visitors, 3);
  assert.equal(summary?.pageviews, 8);
  assert.equal(summary?.topPages[0].label, 'Pricing');
  assert.equal(summary?.topPages[0].value, 4);
  assert.equal(summary?.sources[0].label, 'Google');
  assert.equal(summary?.sources[0].value, 2);
  assert.equal(summary?.countries[0].label, 'Canada');
  assert.equal(summary?.countries[0].value, 1);
  assert.equal(summary?.chart[0].label, '2026-11-01');
  assert.equal(summary?.chart[0].value, 5);
});

test('public summary accepts the contract and a few friendly aliases', () => {
  const summary = parsePublicSummary({
    siteName: 'example.com',
    visitors: 12,
    pageviews: 40,
    topPages: [{ page: '/', views: 20 }, { path: '/pricing', count: 4 }],
    sources: [{ source: 'Google', visits: 9 }],
    countries: [{ country: 'Canada', visitors: 3 }],
    chart: [{ date: 'Nov 1', pageviews: 5 }, { date: 'Nov 2', pageviews: 10 }],
  });
  assert.equal(summary?.visitors, 12);
  assert.equal(summary?.topPages[1].label, '/pricing');
  assert.equal(summary?.sources[0].label, 'Google');
  assert.equal(summary?.countries[0].value, 3);
  assert.match(chartPoints(summary!.chart), /,/);
  assert.equal(chartPoints([]), '');
  assert.equal(parsePublicSummary([]), null);
  assert.equal(parsePublicSummary({ uniqueVisitors: 2, totalPageViews: 8 })?.pageviews, 8);
});

test('public share pages link home with the powered-by campaign', () => {
  assert.equal(
    SHARE_BADGE_HREF,
    'https://pulzivo.com/?utm_source=share&utm_medium=badge&utm_campaign=powered_by',
  );
  assert.equal(SHARE_CTA_HREF, `${SHARE_BADGE_HREF}&utm_content=cta`);
  assert.equal(
    SHARE_CTA_LINE,
    'Want stats like this for your site? Pulzivo is free for up to 10K events/month.',
  );
  assert.doesNotMatch(`${SHARE_CTA_LINE} ${SHARE_BADGE_HREF}`, /GDPR|CCPA/i);

  const page = fs.readFileSync(path.join(ROOT, 'src/app/pages/share/share-dashboard.ts'), 'utf8');
  assert.match(page, /\[href\]="badgeHref"/);
  assert.match(page, /\[href\]="ctaHref"/);
  assert.match(page, /\{\{ ctaLine \}\}/);
  assert.match(page, /Powered by Pulzivo/);
  assert.match(page, />Start free</);
  assert.equal((page.match(/rel="noopener"/g) || []).length, 2);
  assert.equal((page.match(/target="_blank"/g) || []).length, 2);
  assert.doesNotMatch(page, /routerLink="\/signup"/);
  assert.doesNotMatch(page, /GDPR|CCPA/i);
});

test('share pages stay noindex and do not touch owner exclusion', () => {
  const page = fs.readFileSync(path.join(ROOT, 'src/app/pages/share/share-dashboard.ts'), 'utf8');
  assert.doesNotMatch(page, /pulz_is_owner|pulz_owner|exclude_owner|localStorage|disableTracking|setOwner/);

  const routes = fs.readFileSync(path.join(ROOT, 'src/app/app.routes.ts'), 'utf8');
  const share = routes.slice(routes.indexOf("path: 'share/:token'"), routes.indexOf("path: 'demo'"));
  assert.match(share, /robots:\s*'noindex, nofollow'/);

  const htaccess = fs.readFileSync(path.join(ROOT, 'public/.htaccess'), 'utf8');
  assert.match(
    htaccess,
    /SetEnvIf Request_URI "\^\/\(dashboard\|reset-password\|login\|signin\|signup\|register\|demo\|share\)" PZ_NOINDEX/,
  );
  assert.match(htaccess, /Header set X-Robots-Tag "noindex, nofollow" env=PZ_NOINDEX/);

  const robots = fs.readFileSync(path.join(ROOT, 'public/robots.txt'), 'utf8');
  assert.doesNotMatch(robots, /Disallow:\s*\/share\b/);

  const tracker = fs.readFileSync(path.join(ROOT, 'public/pulzivo-analytics.js'), 'utf8');
  assert.match(tracker, /pulz_is_owner/);
  assert.match(tracker, /pulz_owner/);

  const settings = fs.readFileSync(path.join(ROOT, 'src/app/growth/share-settings.ts'), 'utf8');
  assert.doesNotMatch(settings, /hide badge|showBadge|badgeVisible|poweredBy/i);
});

test('GA4 import reads rows and a date range string or object', () => {
  assert.deepEqual(parseGa4Import({ rowsImported: 120, dateRange: 'Jan 1 – Jan 31' }), {
    rowsImported: 120, dateRange: 'Jan 1 – Jan 31',
  });
  assert.equal(parseGa4Import({ rowsImported: 3, dateRange: { start: '2026-01-01', end: '2026-01-31' } })?.dateRange, '2026-01-01 – 2026-01-31');
  assert.equal(parseGa4Import({ ok: true }), null);
});
