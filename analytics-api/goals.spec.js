'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./server');
const { createMemoryDb } = require('./memory-db');
const { computeGoalReport } = require('./goals');

const KEY = 'PULZ-GOAL';

async function withServer(app, fn) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try { return await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

function ev(name, extra, session = 's1') {
  return {
    apiKey: KEY,
    event_name: name,
    user_id: 'u-' + session,
    session_id: session,
    timestamp: extra.timestamp || Date.now(),
    page: extra.page || '/',
    data: { session_id: session, page: extra.page || '/', ...extra },
  };
}

test('event goal rate uses page-view visitors and ignores another site', () => {
  const events = [
    ev('page_view', { page: '/', attribution: { utm_source: 'ig', utm_campaign: 'spring', landing_page: '/' } }, 's1'),
    ev('goal', { goal: 'signup' }, 's1'),
    ev('page_view', { page: '/pricing', attribution: { referrer_domain: 'news.ycombinator.com', landing_page: '/pricing' } }, 's2'),
    ev('page_view', { page: '/docs' }, 's3'),
    { ...ev('goal', { goal: 'signup' }, 's9'), apiKey: 'OTHER' },
  ];
  const report = computeGoalReport(events.filter((e) => e.apiKey === KEY), { type: 'event', value: 'signup' });
  assert.equal(report.visitors, 3);
  assert.equal(report.conversions, 1);
  assert.equal(report.rate, 33.3);
  assert.equal(report.bySource.find((row) => row.label === 'Instagram').conversions, 1);
  assert.equal(report.byCampaign.find((row) => row.label === 'spring').visitors, 1);
  assert.equal(report.byLanding.find((row) => row.label === '/pricing').conversions, 0);
  assert.ok(report.bySource.some((row) => row.label === 'Unavailable' && row.available === false));
});

test('page goal and a goal without a page view are not a conversion', () => {
  const events = [
    ev('page_view', { page: '/pricing' }, 's1'),
    ev('page_view', { page: '/' }, 's2'),
    ev('goal', { goal: 'signup' }, 's3'),
  ];
  const page = computeGoalReport(events, { type: 'page', value: '/pricing' });
  assert.equal(page.visitors, 2);
  assert.equal(page.conversions, 1);
  assert.equal(page.rate, 50);
  const orphan = computeGoalReport([ev('goal', { goal: 'signup' }, 's3')], { type: 'event', value: 'signup' });
  assert.equal(orphan.status, 'insufficient_data');
  assert.equal(orphan.rate, null);
  assert.equal(orphan.conversions, 0);
});

test('GET /analytics/goal-conversion is scoped to the api key and rejects a missing goal', async () => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const docs = [
    ev('page_view', { page: '/', timestamp: now - day, attribution: { utm_source: 'google', landing_page: '/' } }, 's1'),
    ev('goal', { goal: 'signup', timestamp: now - day }, 's1'),
    ev('page_view', { page: '/', timestamp: now - 10 * day, attribution: { utm_source: 'google', landing_page: '/' } }, 'old'),
    ev('goal', { goal: 'signup', timestamp: now - 10 * day }, 'old'),
    ev('page_view', { page: '/', timestamp: now - day, userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }, 'bot'),
    ev('goal', { goal: 'signup', timestamp: now - day, userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }, 'bot'),
    { ...ev('page_view', { timestamp: now - day }, 'x'), apiKey: 'OTHER' },
    { ...ev('goal', { goal: 'signup', timestamp: now - day }, 'x'), apiKey: 'OTHER' },
  ];
  await withServer(createApp({ db: createMemoryDb({ events: docs }) }), async (url) => {
    const missing = await fetch(`${url}/analytics/goal-conversion?apiKey=${KEY}`);
    assert.equal(missing.status, 400);
    const start = new Date(now - 7 * day).toISOString();
    const end = new Date(now).toISOString();
    const res = await fetch(`${url}/analytics/goal-conversion?apiKey=${KEY}&goalType=event&goalValue=signup&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.visitors, 1);
    assert.equal(body.conversions, 1);
    assert.equal(body.rate, 100);
    assert.equal(body.previous.visitors, 1);
    assert.equal(body.previous.conversions, 1);
    assert.equal(body.changePct, 0);
    const other = await (await fetch(`${url}/analytics/goal-conversion?apiKey=OTHER&goalType=event&goalValue=signup&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`)).json();
    assert.equal(other.visitors, 1);
    assert.equal(other.conversions, 1);
  });
});
