'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp, DEFAULT_ORIGINS, normalizeEvents, buildDateFilter } = require('./server');
const { createMemoryDb, matches } = require('./memory-db');

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
    server.on('error', reject);
  });
}

async function withServer(app, fn) {
  const { server, url } = await listen(app);
  try {
    return await fn(url);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('OPTIONS /analytics/log is 204 with CORS for tabletennistube.com', async () => {
  await withServer(createApp(), async (url) => {
    const res = await fetch(`${url}/analytics/log`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://tabletennistube.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://tabletennistube.com');
    const methods = (res.headers.get('access-control-allow-methods') || '').toUpperCase();
    assert.match(methods, /POST/);
    assert.match(methods, /OPTIONS/);
  });
});

test('OPTIONS /analytics/log allows all four production origins', async () => {
  await withServer(createApp(), async (url) => {
    for (const origin of DEFAULT_ORIGINS) {
      const res = await fetch(`${url}/analytics/log`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
        },
      });
      assert.equal(res.status, 204, origin);
      assert.equal(res.headers.get('access-control-allow-origin'), origin, origin);
    }
  });
});

test('OPTIONS /analytics/log does not reflect unknown origins', async () => {
  await withServer(createApp(), async (url) => {
    const res = await fetch(`${url}/analytics/log`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'POST',
      },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });
});

test('POST /analytics/log returns {"status":"ok"} for SDK array payload', async () => {
  await withServer(createApp(), async (url) => {
    const res = await fetch(`${url}/analytics/log`, {
      method: 'POST',
      headers: {
        Origin: 'https://pulzivo.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        event_name: 'page_view',
        user_id: 'spec-user',
        data: { page: '/spec' },
        service: 'PULZ-PRD-TEST',
      }]),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://pulzivo.com');
    assert.deepEqual(await res.json(), { status: 'ok' });
  });
});

test('POST /analytics/log accepts {apiKey,events} envelope', async () => {
  await withServer(createApp(), async (url) => {
    const res = await fetch(`${url}/analytics/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://www.tabletennistube.com' },
      body: JSON.stringify({
        apiKey: 'PULZ-PRD-TEST',
        events: [{ event_name: 'page_views', page: '/home' }],
      }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  });
});

test('GET /analytics/log is 404', async () => {
  await withServer(createApp(), async (url) => {
    const res = await fetch(`${url}/analytics/log`);
    assert.equal(res.status, 404);
  });
});

test('GET /health is 200', async () => {
  await withServer(createApp(), async (url) => {
    const res = await fetch(`${url}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, 'pulzivo-analytics-api');
  });
});

test('POST persists events when Mongo db is injected', async () => {
  const inserted = [];
  const fakeDb = {
    collection(name) {
      assert.equal(name, 'events');
      return {
        async insertMany(docs) {
          inserted.push(...docs);
          return { insertedCount: docs.length };
        },
      };
    },
  };
  await withServer(createApp({ db: fakeDb }), async (url) => {
    const res = await fetch(`${url}/analytics/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ event_name: 'click', service: 'PULZ-PRD-TEST', data: { page: '/' } }]),
    });
    assert.equal(res.status, 200);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].event_name, 'click');
    assert.equal(inserted[0].apiKey, 'PULZ-PRD-TEST');
  });
});

test('GET /api-keys/:key/validate returns 401 for unknown key', async () => {
  const fakeDb = {
    collection() {
      return { async findOne() { return null; } };
    },
  };
  await withServer(createApp({ db: fakeDb }), async (url) => {
    const res = await fetch(`${url}/api-keys/INVALID-KEY/validate`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.valid, false);
  });
});

test('GET /api-keys/:key/validate returns plan for active key', async () => {
  const fakeDb = {
    collection() {
      return {
        async findOne() {
          return {
            apiKey: 'PULZ-PRD-TEST',
            plan: 'enterprise',
            userId: 'user-1',
            name: 'Prod',
            limits: { daily: null, monthly: null, rateLimitPerMinute: null },
          };
        },
      };
    },
  };
  await withServer(createApp({ db: fakeDb }), async (url) => {
    const res = await fetch(`${url}/api-keys/PULZ-PRD-TEST/validate`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.valid, true);
    assert.equal(body.plan, 'enterprise');
    assert.equal(body.name, 'Prod');
  });
});


test('GET /analytics/public-stats requires apiKey or resolvable origin', async () => {
  const fakeDb = {
    collection(name) {
      return {
        async countDocuments() { return name === 'events' ? 42 : 0; },
        async findOne() { return null; },
      };
    },
  };
  await withServer(createApp({ db: fakeDb }), async (url) => {
    const missing = await fetch(`${url}/analytics/public-stats`);
    assert.equal(missing.status, 400);
    const ok = await fetch(`${url}/analytics/public-stats?apiKey=PULZ-PRD-TEST`);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { totalPageViews: 42, scriptCopied: 42 });
  });
});

test('GET /analytics/page-stats returns counts and prefix for tournament roots', async () => {
  const filters = [];
  const fakeDb = {
    collection() {
      return {
        async countDocuments(filter) {
          filters.push(filter);
          return 7;
        },
        async findOne() { return { apiKey: 'PULZ-PRD-TEST' }; },
      };
    },
  };
  await withServer(createApp({ db: fakeDb }), async (url) => {
    const res = await fetch(`${url}/analytics/page-stats?apiKey=PULZ-PRD-TEST&path=/tournaments/abc`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.totalPageViews, 7);
    assert.equal(body.pageViews, 7);
    assert.equal(body.count, 7);
    assert.equal(body.match, 'prefix');
    assert.equal(body.path, '/tournaments/abc');
    assert.ok(filters[0]['data.page'].$regex);
  });
});

function tttDocs() {
  const now = Date.now();
  return [
    {
      event_name: 'page_view',
      apiKey: 'PULZ-PRD-TTT',
      user_id: 'u1',
      session_id: 's1',
      page: '/',
      timestamp: now - 60 * 60 * 1000,
      data: {
        page: '/',
        session_id: 's1',
        visit_count: 1,
        timezone: 'America/New_York',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        attribution: { referrer_domain: 'google.com', utm_source: 'google', utm_medium: 'organic', utm_campaign: 'brand' },
        scroll_depth: 40,
        time_on_page: 12,
      },
    },
    {
      event_name: 'page_view',
      apiKey: 'PULZ-PRD-TTT',
      user_id: 'u1',
      session_id: 's1',
      page: '/news',
      timestamp: now - 30 * 60 * 1000,
      data: {
        page: '/news',
        session_id: 's1',
        visit_count: 1,
        timezone: 'America/New_York',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      },
    },
    {
      event_name: 'click',
      apiKey: 'PULZ-PRD-TTT',
      user_id: 'u1',
      session_id: 's1',
      timestamp: now - 20 * 60 * 1000,
      data: { page: '/news', element: 'a.signup', event_label: 'Join', session_id: 's1' },
    },
    {
      event_name: 'page_view',
      apiKey: 'PULZ-PRD-TTT',
      user_id: 'u2',
      session_id: 's2',
      page: '/',
      timestamp: now - 10 * 60 * 1000,
      data: {
        page: '/',
        session_id: 's2',
        visit_count: 4,
        timezone: 'Europe/Berlin',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile Safari',
      },
    },
    {
      event_name: 'signup_completed',
      apiKey: 'PULZ-PRD-OTHER',
      user_id: 'other',
      timestamp: now,
      data: { page: '/' },
    },
  ];
}

test('normalizeEvents stores timestamp as Date', () => {
  const events = normalizeEvents({
    body: [{ event_name: 'page_view', service: 'K', timestamp: 1_700_000_000_000, data: { page: '/' } }],
    query: {},
  });
  assert.equal(events.length, 1);
  assert.ok(events[0].timestamp instanceof Date);
  assert.equal(events[0].timestamp.getTime(), 1_700_000_000_000);
});

test('buildDateFilter matches numeric ingest timestamps via $or', () => {
  const start = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const end = new Date();
  const filter = buildDateFilter({ query: { startDate: start.toISOString(), endDate: end.toISOString() } });
  assert.ok(Array.isArray(filter.$or));
  assert.ok(filter.$or.some((clause) => typeof clause.timestamp?.$gte === 'number'));
  const numericDoc = { timestamp: Date.now() - 30 * 60 * 1000 };
  const oldDoc = { timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 };
  assert.equal(matches(numericDoc, filter), true);
  assert.equal(matches(oldDoc, filter), false);
});

test('GET /analytics/metrics requires apiKey', async () => {
  await withServer(createApp({ db: createMemoryDb({ events: [] }) }), async (url) => {
    const res = await fetch(`${url}/analytics/metrics`);
    assert.equal(res.status, 400);
  });
});

test('GET /analytics/metrics reads the same store ingest writes, including numeric timestamps', async () => {
  const db = createMemoryDb({ events: tttDocs() });
  await withServer(createApp({ db }), async (url) => {
    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const end = new Date().toISOString();
    const res = await fetch(`${url}/analytics/metrics?apiKey=PULZ-PRD-TTT&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.totalPageViews, 3);
    assert.equal(body.uniqueVisitors, 2);
    assert.ok(body.totalSessions >= 2);
  });
});

test('GET /analytics/page-views and top-pages scope by apiKey', async () => {
  const db = createMemoryDb({ events: tttDocs() });
  await withServer(createApp({ db }), async (url) => {
    const views = await fetch(`${url}/analytics/page-views?apiKey=PULZ-PRD-TTT`);
    assert.equal(views.status, 200);
    const trend = await views.json();
    assert.ok(Array.isArray(trend.trend));
    assert.ok(trend.trend.reduce((sum, row) => sum + row.pageViews, 0) >= 3);

    const pages = await fetch(`${url}/analytics/top-pages?apiKey=PULZ-PRD-TTT&limit=10`);
    const body = await pages.json();
    assert.equal(body.totalPageViews, 3);
    assert.ok(body.pages.some((p) => p.path === '/' && p.views >= 2));
  });
});

test('GET /analytics/event-history returns recent events for the ingest key', async () => {
  const db = createMemoryDb({ events: tttDocs() });
  await withServer(createApp({ db }), async (url) => {
    const res = await fetch(`${url}/analytics/event-history?apiKey=PULZ-PRD-TTT&limit=50`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total, 4);
    assert.equal(body.events.length, 4);
    assert.ok(body.eventTypes.includes('page_view'));
    assert.ok(body.filterOptions.countries.includes('United States'));
    assert.ok(body.filterOptions.devices.includes('Desktop'));
  });
});

test('GET /analytics/events-breakdown and geographic use stored events only', async () => {
  const db = createMemoryDb({ events: tttDocs() });
  await withServer(createApp({ db }), async (url) => {
    const breakdown = await (await fetch(`${url}/analytics/events-breakdown?apiKey=PULZ-PRD-TTT`)).json();
    assert.equal(breakdown.totalEvents, 4);
    assert.ok(breakdown.events.some((e) => e.name === 'page_view' && e.count === 3));
    assert.equal(breakdown.topClicks[0].element, 'a.signup');

    const geo = await (await fetch(`${url}/analytics/geographic?apiKey=PULZ-PRD-TTT`)).json();
    assert.ok(geo.geographic.some((row) => row.country === 'United States' && row.visitors >= 2));
  });
});

test('GET /analytics/device-breakdown and traffic-sources derive from event payloads', async () => {
  const db = createMemoryDb({ events: tttDocs() });
  await withServer(createApp({ db }), async (url) => {
    const devices = await (await fetch(`${url}/analytics/device-breakdown?apiKey=PULZ-PRD-TTT`)).json();
    assert.ok(devices.devices.some((d) => d.device === 'Desktop'));
    assert.ok(devices.devices.some((d) => d.device === 'Mobile'));

    const traffic = await (await fetch(`${url}/analytics/traffic-sources?apiKey=PULZ-PRD-TTT`)).json();
    assert.ok(traffic.sources.some((s) => s.source === 'Organic Search'));
    assert.ok(traffic.utmSources.some((u) => u.source === 'google' && u.campaign === 'brand'));
  });
});

test('POST /analytics/events aliases ingest and is readable via metrics', async () => {
  const db = createMemoryDb({ events: [] });
  await withServer(createApp({ db }), async (url) => {
    const posted = await fetch(`${url}/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://pulzivo.com' },
      body: JSON.stringify([{
        event_name: 'page_view',
        service: 'PULZ-PRD-TTT',
        user_id: 'fresh',
        data: { page: '/live', session_id: 's-live' },
      }]),
    });
    assert.equal(posted.status, 200);
    const metrics = await (await fetch(`${url}/analytics/metrics?apiKey=PULZ-PRD-TTT`)).json();
    assert.equal(metrics.totalPageViews, 1);
  });
});

test('page-stats date filter includes numeric timestamps from ingest', async () => {
  const now = Date.now();
  const db = createMemoryDb({
    events: [{
      event_name: 'page_view',
      apiKey: 'PULZ-PRD-TTT',
      timestamp: now - 15 * 60 * 1000,
      data: { page: '/' },
    }],
  });
  await withServer(createApp({ db }), async (url) => {
    const start = new Date(now - 60 * 60 * 1000).toISOString();
    const end = new Date(now).toISOString();
    const res = await fetch(`${url}/analytics/page-stats?apiKey=PULZ-PRD-TTT&path=/&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).totalPageViews, 1);
  });
});
