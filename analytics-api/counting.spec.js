'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./server');
const { createMemoryDb } = require('./memory-db');

const KEY = 'PULZ-COUNT';

async function withServer(app, fn) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try { return await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('report counts skip crawler events that were already stored and keep a Cubot phone', async () => {
  const now = Date.now();
  const docs = [
    { apiKey: KEY, event_name: 'page_view', user_id: 'human', session_id: 'h', timestamp: now, page: '/', data: { page: '/', userAgent: 'Mozilla/5.0 Chrome/120.0.0.0' } },
    { apiKey: KEY, event_name: 'page_view', user_id: 'bot', session_id: 'b', timestamp: now, page: '/news', data: { page: '/news', userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' } },
    { apiKey: KEY, event_name: 'page_view', user_id: 'phone', session_id: 'p', timestamp: now, page: '/m', data: { page: '/m', userAgent: 'Mozilla/5.0 (Linux; Android 12; CUBOT P50) Chrome/120.0.0.0' } },
    { apiKey: KEY, event_name: 'page_view', user_id: 'other', session_id: 'o', timestamp: now, page: '/', data: { page: '/' }, apiKey: 'OTHER-SITE' },
  ];
  docs[3].apiKey = 'OTHER-SITE';
  const before = docs.length;
  await withServer(createApp({ db: createMemoryDb({ events: docs }) }), async (url) => {
    const res = await fetch(`${url}/analytics/metrics?apiKey=${KEY}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.totalPageViews, 2);
    assert.equal(body.uniqueVisitors, 2);
  });
  assert.equal(docs.length, before);
});

test('conversion and bounce are unavailable when the range has no visitors or sessions', async () => {
  await withServer(createApp({ db: createMemoryDb({ events: [] }) }), async (url) => {
    const res = await fetch(`${url}/analytics/metrics?apiKey=${KEY}`);
    const body = await res.json();
    assert.equal(body.conversionRate, null);
    assert.equal(body.bounceRate, null);
    assert.equal(body.newVsReturning.new, null);
    assert.equal(body.newVsReturning.returning, null);
    assert.equal(body.totalPageViews, 0);
  });
});

test('a goal without a page view does not invent a 100% conversion rate', async () => {
  const now = Date.now();
  const docs = [
    { apiKey: KEY, event_name: 'goal', user_id: 'u1', session_id: 's1', timestamp: now, data: { goal: 'signup' } },
  ];
  await withServer(createApp({ db: createMemoryDb({ events: docs }) }), async (url) => {
    const body = await (await fetch(`${url}/analytics/metrics?apiKey=${KEY}`)).json();
    assert.equal(body.uniqueVisitors, 0);
    assert.notEqual(body.conversionRate, 100);
    assert.equal(body.conversionRate, null);
  });
});
