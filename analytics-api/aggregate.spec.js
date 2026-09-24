'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./server');
const { createMemoryDb, MemoryCollection } = require('./memory-db');
const { computeCoreMetrics, groupSessions, pageViewsTrend } = require('./metrics');
const { EVENT_INDEXES, ensureEventIndexes } = require('./indexes');
const {
  aggregate,
  coreMetricsPipeline,
  shapeCoreMetrics,
  sessionStatsPipeline,
  shapeSessionStats,
  funnelPipeline,
  shapeFunnel,
  pageViewsPipeline,
  shapePageViews,
} = require('./aggregate');
const { percent, trendPct } = require('./query');

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

function mixedDocs() {
  const base = Date.UTC(2024, 5, 10, 12, 0, 0);
  return [
    {
      event_name: 'page_view',
      apiKey: 'K',
      user_id: 'u1',
      session_id: 's1',
      page: '/',
      timestamp: base,
      data: {
        page: '/',
        session_id: 's1',
        visit_count: 1,
        timezone: 'America/New_York',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0',
        scroll_depth: 40,
        time_on_page: 12,
        attribution: { utm_source: 'google', utm_medium: 'organic', utm_campaign: 'brand', referrer_domain: 'google.com' },
      },
    },
    {
      event_name: 'page_views',
      apiKey: 'K',
      user_id: 'u1',
      session_id: 's1',
      timestamp: new Date(base + 30 * 60 * 1000),
      data: { page: '/news', session_id: 's1', visit_count: '1', time_on_page: 0, scroll_depth: 0 },
    },
    {
      event_name: 'click',
      apiKey: 'K',
      session_id: 's1',
      timestamp: new Date(base + 40 * 60 * 1000).toISOString(),
      data: { page: '/news', element: 'a.signup', event_label: 'Join', session_id: 's1' },
    },
    {
      event_name: 'auto_click',
      apiKey: 'K',
      user_id: 'u2',
      session_id: 's2',
      timestamp: Math.floor((base + 60 * 60 * 1000) / 1000),
      data: { page: '/auto', session_id: 's2', user_id: 'u2' },
    },
    {
      event_name: 'page_view',
      apiKey: 'K',
      session_id: 's2',
      timestamp: base + 70 * 60 * 1000,
      data: {
        page: '/',
        session_id: 's2',
        user_id: 'u2',
        visit_count: 4,
        timezone: 'Europe/Berlin',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile Safari',
        time_on_page: '8',
      },
    },
    {
      event_name: 'signup_completed',
      apiKey: 'K',
      user_id: 'u2',
      session_id: 's2',
      timestamp: base + 80 * 60 * 1000,
      data: { page: '/thanks', session_id: 's2' },
    },
    {
      event_name: 'form_submit',
      apiKey: 'K',
      user_id: 'u2',
      session_id: 's2',
      timestamp: base + 81 * 60 * 1000,
      data: { page: '/thanks' },
    },
    {
      event_name: 'click',
      apiKey: 'K',
      session_id: 's3',
      createdAt: new Date(base + 90 * 60 * 1000),
      data: { page: '/only-click', session_id: 's3', visit_count: 1 },
    },
    {
      event_name: 'page_view',
      apiKey: 'OTHER',
      user_id: 'nope',
      session_id: 'sx',
      timestamp: base + 10 * 60 * 1000,
      data: { page: '/secret', session_id: 'sx' },
    },
    {
      event_name: 'page_view',
      apiKey: 'K',
      user_id: 'old',
      session_id: 'old',
      timestamp: base - 10 * 24 * 60 * 60 * 1000,
      data: { page: '/old', session_id: 'old' },
    },
  ];
}

test('aggregated core metrics match the in-process reducer', async () => {
  const docs = mixedDocs().filter((doc) => doc.apiKey === 'K');
  const col = new MemoryCollection(docs);
  const rows = await aggregate(col, coreMetricsPipeline({ apiKey: 'K' }));
  const shaped = shapeCoreMetrics(rows[0], 0);
  const expected = computeCoreMetrics(docs, { liveCount: 0 });
  assert.deepEqual(shaped, expected);
});

test('session stats and funnel aggregations match session grouping', async () => {
  const docs = mixedDocs().filter((doc) => doc.apiKey === 'K');
  const col = new MemoryCollection(docs);
  const stats = shapeSessionStats((await aggregate(col, sessionStatsPipeline({ apiKey: 'K' })))[0]);
  const sessions = [...groupSessions(docs).values()];
  assert.equal(stats.totalSessions, sessions.length);
  const durations = sessions
    .map((session) => (session.start && session.end ? Math.max(0, (session.end - session.start) / 1000) : 0))
    .filter((n) => n > 0);
  const avgDur = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  assert.equal(stats.avgSessionDuration, Math.round(avgDur || 0));
  assert.equal(stats.topEntryPages[0].page, '/');
  assert.ok(stats.topExitPages.some((row) => row.page === '/news'));

  const funnel = shapeFunnel(await aggregate(col, funnelPipeline({ apiKey: 'K' })));
  assert.deepEqual(funnel.steps.map((step) => step.label), ['Page views', 'Clicks', 'Form submit']);
  assert.equal(funnel.steps[0].count, docs.filter((doc) => doc.event_name === 'page_view' || doc.event_name === 'page_views').length);
  assert.equal(funnel.steps[1].count, docs.filter((doc) => doc.event_name === 'click').length);
  assert.equal(funnel.steps[2].count, docs.filter((doc) => doc.event_name === 'form_submit').length);
  assert.equal(funnel.steps[0].percentage, percent(funnel.steps[0].count, funnel.steps[0].count || 1, 1));
});

test('page-view buckets match the JS trend helper for daily, hourly, and weekly', async () => {
  const docs = [{
    event_name: 'page_view',
    apiKey: 'K',
    timestamp: new Date('2024-01-07T15:30:00Z'),
    data: { page: '/' },
  }];
  const col = new MemoryCollection(docs);
  for (const period of ['daily', 'hourly', 'weekly']) {
    const rows = await aggregate(col, pageViewsPipeline({ apiKey: 'K', event_name: 'page_view' }, period));
    assert.deepEqual(shapePageViews(rows, period).trend, pageViewsTrend(docs, period));
  }
});

test('overview routes aggregate instead of loading every event', async () => {
  const now = Date.now();
  const docs = [];
  for (let i = 0; i < 40; i += 1) {
    docs.push({
      event_name: i % 5 === 0 ? 'click' : 'page_view',
      apiKey: 'K',
      user_id: `u${i % 7}`,
      session_id: `s${i % 9}`,
      timestamp: now - i * 60 * 1000,
      data: {
        page: i % 2 === 0 ? '/' : '/news',
        session_id: `s${i % 9}`,
        visit_count: i % 4 === 0 ? 2 : 1,
        timezone: 'America/Chicago',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0',
        scroll_depth: 20,
        time_on_page: 5,
      },
    });
  }
  const db = createMemoryDb({ events: docs });
  const col = db.collection('events');
  const originalFind = col.find.bind(col);
  col.find = (filter) => {
    const cursor = originalFind(filter);
    let limited = false;
    const originalLimit = cursor.limit.bind(cursor);
    cursor.limit = (n) => {
      limited = true;
      return originalLimit(n);
    };
    const originalToArray = cursor.toArray.bind(cursor);
    cursor.toArray = async () => {
      const rows = await originalToArray();
      if (!limited && rows.length > 5) {
        throw new Error(`unbounded find returned ${rows.length}`);
      }
      return rows;
    };
    return cursor;
  };

  await withServer(createApp({ db }), async (url) => {
    const start = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const end = new Date(now).toISOString();
    const q = `apiKey=K&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`;
    const paths = [
      `/analytics/metrics?${q}`,
      `/analytics/metrics-comparison?${q}`,
      `/analytics/session-stats?${q}`,
      `/analytics/conversion-funnel?${q}`,
      `/analytics/page-views?${q}`,
      `/analytics/top-pages?${q}`,
      `/analytics/geographic?${q}`,
      `/analytics/device-breakdown?${q}`,
      `/analytics/event-history?${q}&limit=10`,
    ];
    for (const path of paths) {
      const res = await fetch(`${url}${path}`);
      assert.equal(res.status, 200, path);
      const body = await res.json();
      assert.ok(body && typeof body === 'object', path);
    }
    const metrics = await (await fetch(`${url}/analytics/metrics?${q}`)).json();
    const expected = computeCoreMetrics(
      docs.filter((doc) => doc.timestamp >= now - 7 * 24 * 60 * 60 * 1000 && doc.timestamp <= now),
      { liveCount: metrics.liveVisitors },
    );
    assert.equal(metrics.totalPageViews, expected.totalPageViews);
    assert.equal(metrics.uniqueVisitors, expected.uniqueVisitors);
    assert.equal(metrics.totalSessions, expected.totalSessions);
    assert.equal(metrics.bounceRate, expected.bounceRate);
    assert.equal(metrics.avgSessionDuration, expected.avgSessionDuration);

    const compare = await (await fetch(`${url}/analytics/metrics-comparison?${q}`)).json();
    assert.equal(
      compare.trends.totalPageViews,
      trendPct(compare.current.totalPageViews, compare.previous.totalPageViews),
    );
    const funnel = await (await fetch(`${url}/analytics/conversion-funnel?${q}`)).json();
    assert.ok(funnel.steps[0].count >= metrics.totalPageViews);
  });
});

test('ensureEventIndexes requests apiKey + timestamp and does not touch documents', async () => {
  const docs = [{ apiKey: 'K', event_name: 'page_view', timestamp: new Date(), data: { page: '/' } }];
  const db = createMemoryDb({ events: docs });
  const names = await ensureEventIndexes(db);
  assert.deepEqual(names, EVENT_INDEXES.map((spec) => spec.name));
  const indexes = db.collection('events').indexes;
  assert.ok(indexes.some((spec) => spec.key.apiKey === 1 && spec.key.timestamp === 1 && spec.name === 'events_apiKey_timestamp'));
  assert.deepEqual(db.collection('events').docs, docs);
});
