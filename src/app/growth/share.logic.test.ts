import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chartPoints, displayShareUrl, parseGa4Import, parsePublicSummary, parseShareLink,
} from './share.logic.ts';

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

test('GA4 import reads rows and a date range string or object', () => {
  assert.deepEqual(parseGa4Import({ rowsImported: 120, dateRange: 'Jan 1 – Jan 31' }), {
    rowsImported: 120, dateRange: 'Jan 1 – Jan 31',
  });
  assert.equal(parseGa4Import({ rowsImported: 3, dateRange: { start: '2026-01-01', end: '2026-01-31' } })?.dateRange, '2026-01-01 – 2026-01-31');
  assert.equal(parseGa4Import({ ok: true }), null);
});
