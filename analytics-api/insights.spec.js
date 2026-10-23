'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./server');
const { createMemoryDb } = require('./memory-db');

const KEY = 'PULZ-PRD-INS';

async function withServer(app, fn) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

let n = 0;
function ev(event_name, data, session = 's1') {
  n += 1;
  return {
    event_name, apiKey: KEY, user_id: 'u-' + session, session_id: session,
    page: data.page || '/', timestamp: Date.now() - n * 1000,
    data: { session_id: session, page: '/', ...data },
  };
}

test('/analytics/insights aggregates outbound, downloads, 404s, search, goals, revenue, language, screens', async () => {
  const docs = [
    ev('page_view', { language: 'en-CA', screenResolution: '1440x900' }, 's1'),
    ev('page_view', { language: 'en-US', screenResolution: '1440x900' }, 's1'),
    ev('page_view', { language: 'fr-FR', screenResolution: '390x844' }, 's2'),
    ev('page_view', { language: 'en', screenResolution: '2560x1440' }, 's3'),
    ev('outbound_click', { domain: 'github.com', url: 'https://github.com/x' }),
    ev('outbound_click', { domain: 'github.com', url: 'https://github.com/y' }),
    ev('outbound_click', { domain: 'x.com', url: 'https://x.com/' }),
    ev('file_download', { url: 'https://site.test/a.pdf', file_type: 'pdf' }),
    ev('not_found', { page: '/old' }),
    ev('not_found', { page: '/old' }),
    ev('site_search', { term: 'Shoes' }),
    ev('site_search', { term: 'shoes' }),
    ev('goal', { goal: 'signup' }),
    ev('revenue', { value: 10.5, currency: 'usd', goal: 'purchase' }),
    ev('revenue', { value: '4.5', currency: 'USD' }),
    ev('revenue', { value: 20, currency: 'EUR' }),
    { ...ev('outbound_click', { domain: 'other-site.com' }), apiKey: 'OTHER' },
  ];
  await withServer(createApp({ db: createMemoryDb({ events: docs }) }), async (url) => {
    const res = await fetch(`${url}/analytics/insights?apiKey=${KEY}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.outbound, [{ domain: 'github.com', count: 2 }, { domain: 'x.com', count: 1 }]);
    assert.deepEqual(body.downloads, [{ url: 'https://site.test/a.pdf', count: 1 }]);
    assert.deepEqual(body.notFound, [{ page: '/old', count: 2 }]);
    assert.deepEqual(body.searches, [{ term: 'shoes', count: 2 }]);
    assert.deepEqual(body.goals, [{ goal: 'signup', count: 1 }]);
    assert.deepEqual(body.revenue, [
      { currency: 'EUR', total: 20, count: 1 },
      { currency: 'USD', total: 15, count: 2 },
    ]);
    assert.deepEqual(body.languages, [{ language: 'en', count: 2 }, { language: 'fr', count: 1 }]);
    assert.equal(body.screens.length, 3);
    assert.equal(body.screens.find((s) => s.screen.startsWith('Mobile')).count, 1);
  });
});

test('/analytics/insights requires an apiKey', async () => {
  await withServer(createApp({ db: createMemoryDb({ events: [] }) }), async (url) => {
    const res = await fetch(`${url}/analytics/insights`);
    assert.ok(res.status >= 400);
  });
});
