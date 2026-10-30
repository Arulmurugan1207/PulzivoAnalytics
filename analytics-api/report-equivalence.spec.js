'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./server');
const { createMemoryDb } = require('./memory-db');
const legacy = require('./test-fixtures/legacy-reports');
const { PAGE_VIEW_EVENTS } = require('./query');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

// Deterministic PRNG so failures are reproducible.
function rng(seed) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; };
}

function fixture(seed, n) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const base = Date.now() - 3 * 3600 * 1000;
  const referrers = [undefined, '', 'https://www.google.com/search?q=x', 'https://t.co/abc', 'https://news.ycombinator.com/item',
    'https://github.com/foo', 'https://example.org/a', 'https://m.facebook.com/', 'not a url', 'https://duckduckgo.com/'];
  const pages = ['/', '/pricing', '/docs?utm_source=copy&utm_medium=share&utm_campaign=share_link',
    '/blog?utm_source=newsletter&utm_medium=email&utm_campaign=oct', '/a?x=1', '/clubs?utm_source=youtube&utm_medium=social&utm_campaign=t'];
  const attrs = [undefined, {}, [], 'str', { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand' },
    { referrer: 'https://www.bing.com/' }, { referrer_domain: 'reddit.com' }, { utm_source: 'rallyto' },
    { landing_page: 'https://site.test/?utm_source=x&utm_medium=y&utm_campaign=z', extra: 'ignored' },
    { utm_source: 'null', utm_medium: 'email' }];
  const events = [];
  for (let i = 0; i < n; i += 1) {
    const sid = r() < 0.05 ? undefined : `s${Math.floor(r() * (n / 4))}`;
    const name = pick([...PAGE_VIEW_EVENTS, 'page_view', 'page_view', 'navigation', 'route_change', 'click', 'scroll_depth']);
    const data = {
      page: pick(pages),
      session_id: r() < 0.5 ? sid : undefined,
      referrer: pick(referrers),
      attribution: pick(attrs),
    };
    if (r() < 0.1) data.utm_source = pick(['top', 'google', '']);
    if (r() < 0.1) data.utm_medium = pick(['cpc', 'social', 'email']);
    if (r() < 0.1) data.utm_campaign = 'c1';
    if (r() < 0.05) data.custom_parameters = { utm_source: 'cp', utm_medium: 'm', utm_campaign: 'cc', other: { deep: 1 } };
    if (r() < 0.05) data.custom = [{ utm_source: 'arr' }];
    if (r() < 0.05) data.utm_attribution = { utm_source: 'ua', landing_page: '/?utm_medium=lp&utm_campaign=lpc' };
    if (r() < 0.05) data.url = 'https://site.test/x?utm_source=u&utm_medium=v&utm_campaign=w';
    const doc = {
      event_name: name,
      apiKey: 'K',
      timestamp: base + Math.floor(r() * 3 * 3600 * 1000),
      data: r() < 0.02 ? undefined : data,
    };
    if (r() < 0.6) doc.session_id = sid;
    if (r() < 0.2) doc.page = pick(pages);
    if (r() < 0.03) doc.utm_source = 'docLevel';
    events.push(doc);
  }
  // Natural order == time order, as with real inserts.
  return events.sort((a, b) => a.timestamp - b.timestamp);
}

async function compare(events) {
  const db = createMemoryDb({ events: events.map((e) => JSON.parse(JSON.stringify(e))) });
  const { server, url } = await listen(createApp({ db }));
  try {
    const [traffic, attribution] = await Promise.all([
      fetch(`${url}/analytics/traffic-sources?apiKey=K`).then((r) => r.json()),
      fetch(`${url}/analytics/attribution?apiKey=K`).then((r) => r.json()),
    ]);
    const copy = events.map((e) => JSON.parse(JSON.stringify(e)));
    const pv = copy.filter((e) => PAGE_VIEW_EVENTS.includes(e.event_name));
    const nav = copy.filter((e) => ['navigation', 'route_change'].includes(e.event_name));
    assert.deepEqual(traffic, legacy.trafficSources(pv, nav));
    assert.deepEqual(attribution, legacy.attribution(copy));
    return { traffic, attribution };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('traffic-sources and attribution aggregations match the old per-event handlers', async () => {
  for (const seed of [1, 7, 42, 2026]) {
    const out = await compare(fixture(seed, 400));
    assert.ok(out.traffic.totalVisits > 0);
    assert.ok(out.attribution.totalSessions > 0);
  }
});

test('equivalence holds for an empty range', async () => {
  await compare([]);
});
