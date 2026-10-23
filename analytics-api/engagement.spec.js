'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./server');
const { createMemoryDb } = require('./memory-db');
const { computeCoreMetrics } = require('./metrics');

const KEY = 'PULZ-PRD-ENG';

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

function ev(event_name, data, minutesAgo = 5) {
  return {
    event_name,
    apiKey: KEY,
    user_id: 'u1',
    session_id: 's1',
    page: data.page || '/',
    timestamp: Date.now() - minutesAgo * 60 * 1000,
    data: { session_id: 's1', page: '/', ...data },
  };
}

function engagementDocs() {
  return [
    // Legacy tracker: page_view carries time_on_page 0 and scroll at load.
    ev('page_view', { page: '/', time_on_page: 0, scroll_depth: 0 }, 10),
    // Two exits for one view (tab hidden, then closed) count once, at the max.
    ev('page_exit', { page: '/', view_id: 'v1', time_on_page: 20000, scroll_depth: 50 }, 9),
    ev('page_exit', { page: '/', view_id: 'v1', time_on_page: 30000, scroll_depth: 80 }, 8),
    ev('page_view', { page: '/pricing' }, 7),
    ev('page_exit', { page: '/pricing', view_id: 'v2', time_on_page: 10000, scroll_depth: 40 }, 6),
  ];
}

test('metrics take time on page and scroll depth from page_exit, in seconds, once per view', async () => {
  const docs = engagementDocs();
  await withServer(createApp({ db: createMemoryDb({ events: docs }) }), async (url) => {
    const body = await (await fetch(`${url}/analytics/metrics?apiKey=${KEY}`)).json();
    assert.equal(body.totalPageViews, 2);
    assert.equal(body.avgTimeOnPage, 20); // (30 + 10) / 2 seconds
    assert.equal(body.avgScrollDepth, 60); // (80 + 40) / 2
    const ref = computeCoreMetrics(docs);
    assert.equal(ref.avgTimeOnPage, body.avgTimeOnPage);
    assert.equal(ref.avgScrollDepth, body.avgScrollDepth);

    const pages = await (await fetch(`${url}/analytics/top-pages?apiKey=${KEY}`)).json();
    assert.equal(pages.totalPageViews, 2);
    const home = pages.pages.find((p) => p.path === '/');
    assert.equal(home.views, 1);
    assert.equal(home.avgTimeOnPage, 30);
    assert.equal(home.avgScrollDepth, 80);
    const pricing = pages.pages.find((p) => p.path === '/pricing');
    assert.equal(pricing.avgTimeOnPage, 10);
  });
});

test('form interactions accept form_field_interaction and camelCase timeToComplete', async () => {
  const docs = [
    ev('form_start', { formId: 'signup' }),
    ev('form_field_interaction', { formId: 'signup', fieldName: 'email' }),
    ev('form_field_interaction', { formId: 'signup', fieldName: 'name' }),
    ev('form_focus', { formId: 'signup' }),
    ev('form_submit', { formId: 'signup', timeToComplete: 4000 }),
  ];
  await withServer(createApp({ db: createMemoryDb({ events: docs }) }), async (url) => {
    const body = await (await fetch(`${url}/analytics/form-interactions?apiKey=${KEY}`)).json();
    const form = body.forms.find((f) => f.formId === 'signup');
    assert.equal(form.submissions, 1);
    assert.equal(form.fieldInteractions, 3);
    assert.equal(form.avgTimeToComplete, 4000);
  });
});

test('error tracking reads messages from label/custom fields and includes promise rejections', async () => {
  const docs = [
    ev('javascript_error', { event_label: 'x is undefined', custom_parameters: { error_message: 'x is undefined' } }),
    ev('promise_rejection', { custom_parameters: { reason: 'Network down' } }),
    ev('error', { error_message: 'Manual error' }),
  ];
  await withServer(createApp({ db: createMemoryDb({ events: docs }) }), async (url) => {
    const body = await (await fetch(`${url}/analytics/error-tracking?apiKey=${KEY}`)).json();
    const messages = body.errors.map((e) => e.message).sort();
    assert.deepEqual(messages, ['Manual error', 'Network down', 'x is undefined']);
  });
});

test('web vitals report INP and read legacy CLS (x1000) from custom_parameters', async () => {
  const docs = [
    ev('web_vital_cls', { value: 50, custom_parameters: { metric: 'CLS', value: 0.05 } }),
    ev('web_vital_cls', { value: 0.05, custom_parameters: { metric: 'CLS', value: 0.05 } }),
    ev('web_vital_inp', { value: 120 }),
  ];
  await withServer(createApp({ db: createMemoryDb({ events: docs }) }), async (url) => {
    const { vitals } = await (await fetch(`${url}/analytics/web-vitals?apiKey=${KEY}`)).json();
    assert.equal(vitals.CLS.avg, 0.05);
    assert.equal(vitals.CLS.rating, 'good');
    assert.equal(vitals.INP.avg, 120);
    assert.equal(vitals.INP.rating, 'good');
    assert.equal(vitals.TTFB.rating, 'no-data');
  });
});
