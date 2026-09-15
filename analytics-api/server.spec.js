'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp, DEFAULT_ORIGINS } = require('./server');

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
