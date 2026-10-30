'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./server');
const { createMemoryDb } = require('./memory-db');
const { KEY, makeSite } = require('./test-fixtures/improve-site');
const { improvePipeline } = require('./improve');

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

async function getReport(docs, start, end, extra = '') {
  return withServer(createApp({ db: createMemoryDb({ events: docs }), reportCacheTtlMs: 0 }), async (url) => {
    const q = `apiKey=${KEY}&startDate=${start.toISOString()}&endDate=${end.toISOString()}${extra}`;
    const res = await fetch(`${url}/analytics/improvements?${q}`);
    return { status: res.status, body: await res.json() };
  });
}

test('/analytics/improvements requires an apiKey', async () => {
  await withServer(createApp({ db: createMemoryDb({ events: [] }) }), async (url) => {
    const res = await fetch(`${url}/analytics/improvements`);
    assert.equal(res.status, 400);
  });
});

test('ranks top findings by visitors affected x signal strength, with templates and evidence', async () => {
  const { docs, start, end } = makeSite();
  const { status, body } = await getReport(docs, start, end);
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.ok(body.findings.length > 0 && body.findings.length <= 5);
  const types = body.findings.map((f) => f.type);
  for (const t of ['rage_clicks', 'form_abandon', 'slow_page']) assert.ok(types.includes(t), `missing ${t}: ${types}`);

  const rage = body.findings.find((f) => f.type === 'rage_clicks');
  assert.equal(rage.page, '/pricing');
  assert.equal(rage.element, 'Annual / Monthly');
  assert.equal(rage.visitorsAffected, 20);
  assert.equal(rage.evidence.rageClicks, 40);
  assert.match(rage.title, /rage-click "Annual \/ Monthly" on \/pricing/);
  assert.ok(rage.fix.length > 10);

  const form = body.findings.find((f) => f.type === 'form_abandon');
  assert.equal(form.evidence.started, 30);
  assert.equal(form.evidence.submitted, 9);
  assert.equal(form.visitorsAffected, 21);
  assert.equal(form.evidence.dropOffPct, 70);

  const slow = body.findings.find((f) => f.type === 'slow_page');
  assert.equal(slow.page, '/pricing');
  assert.equal(slow.metric, 'LCP');
  assert.equal(slow.evidence.poorSharePct, 50);

  for (let i = 1; i < body.findings.length; i += 1) {
    assert.ok(body.findings[i - 1].severity >= body.findings[i].severity);
  }
});

test('all finding types fire with enough data (top 5 cap respected)', async () => {
  const { docs, start, end } = makeSite();
  // Read the full candidate set through buildReport with a big TOP_N by checking each type separately.
  const { body } = await getReport(docs, start, end);
  const { buildReport } = require('./improve');
  const { runPipeline } = require('./memory-agg');
  const match = (d) => d.timestamp >= start && d.timestamp <= end;
  const facet = runPipeline(docs.filter(match), improvePipeline({}).slice(1))[0];
  const full = buildReport(facet, null, { start, end });
  assert.equal(body.findings.length, 5);
  assert.equal(full.findings.length, 5);
  // 404 + JS error + low scroll + dead end are present as qualifying candidates even if cut by top 5.
  const { candidatesForTest } = require('./improve');
  const all = candidatesForTest(facet).filter((c) => c.qualifies).map((c) => c.type);
  for (const t of ['rage_clicks', 'form_abandon', 'slow_page', 'not_found', 'js_error', 'low_scroll', 'dead_end']) {
    assert.ok(all.includes(t), `missing qualifying ${t}: ${all}`);
  }
});

test('improved items: metric fell >=30% vs previous period', async () => {
  const { docs, start, end } = makeSite();
  const { body } = await getReport(docs, start, end);
  const imp = body.improved.find((i) => i.type === 'dead_clicks');
  assert.ok(imp, JSON.stringify(body.improved));
  assert.equal(imp.page, '/pricing');
  assert.equal(imp.changePct, -100);
  assert.match(imp.title, /^Dead clicks on \/pricing down 100% vs last period$/);
});

test('small sites get an empty list with a reason instead of noise', async () => {
  const { docs, start, end } = makeSite({ visitors: 20 });
  const { status, body } = await getReport(docs, start, end);
  assert.equal(status, 200);
  assert.equal(body.status, 'insufficient_data');
  assert.deepEqual(body.findings, []);
  assert.deepEqual(body.improved, []);
  assert.match(body.reason, /Not enough traffic/);
});

test('uses one aggregation per period and never find()', async () => {
  const { docs, start, end } = makeSite();
  const db = createMemoryDb({ events: docs });
  const col = db.collection('events');
  let aggregates = 0;
  const origAgg = col.aggregate.bind(col);
  col.aggregate = (...args) => { aggregates += 1; return origAgg(...args); };
  col.find = () => { throw new Error('find() must not be used'); };
  const orig = db.collection.bind(db);
  db.collection = (name) => (name === 'events' ? col : orig(name));
  await withServer(createApp({ db, reportCacheTtlMs: 0 }), async (url) => {
    const res = await fetch(`${url}/analytics/improvements?apiKey=${KEY}&startDate=${start.toISOString()}&endDate=${end.toISOString()}`);
    assert.equal(res.status, 200);
  });
  assert.equal(aggregates, 2);
});

test('pipeline matches only relevant event names on the apiKey (index-friendly)', () => {
  const p = improvePipeline({ apiKey: KEY });
  assert.deepEqual(Object.keys(p[0]), ['$match']);
  assert.ok(p.some((s) => s.$facet));
  assert.ok(p.some((s) => s.$project));
});
