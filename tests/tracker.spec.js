'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBrowser, storage } = require('./tracker-harness');

test('initial page view, one session_start, no email in event data', async () => {
  const b = createBrowser({ url: 'https://site.test/pricing?utm_source=x' });
  await b.load();
  await b.flush();
  const names = b.names();
  assert.equal(names.filter((n) => n === 'page_view').length, 1);
  assert.equal(names.filter((n) => n === 'session_start').length, 1);
  const pv = b.sent.find((e) => e.event_name === 'page_view');
  assert.equal(pv.data.page, '/pricing');
  assert.equal(pv.data.attribution.utm_source, 'x');
  assert.ok(pv.data.view_id);
  assert.equal('user_email' in pv.data, false);
  assert.equal(pv.data.visit_count, 1);
});

test('loading the script twice does not duplicate listeners', async () => {
  const b = createBrowser();
  await b.load();
  const before = b.document.count('visibilitychange');
  await b.load();
  assert.equal(b.document.count('visibilitychange'), before);
});

test('hidden tab sends page_exit by beacon; closing afterwards does not double count', async () => {
  const b = createBrowser();
  await b.load();
  b.hide();
  assert.ok(b.beacons.length >= 1);
  const exits = () => b.sent.filter((e) => e.event_name === 'page_exit');
  assert.equal(exits().length, 1);
  assert.ok(exits()[0].data.time_on_page >= 0);
  b.window.dispatch('pagehide');
  assert.equal(exits().length, 1);
});

test('SPA navigation emits page_exit for the previous route, then a page_view', async () => {
  const b = createBrowser({ url: 'https://site.test/' });
  await b.load();
  b.history.pushState({}, '', '/docs');
  await b.settle();
  b.history.replaceState({}, '', '/docs'); // same path: no new view
  await b.settle();
  await b.flush();
  const views = b.sent.filter((e) => e.event_name === 'page_view').map((e) => e.data.page);
  assert.deepEqual(views, ['/', '/docs']);
  const exit = b.sent.find((e) => e.event_name === 'page_exit');
  assert.equal(exit.data.page, '/');
  const firstView = b.sent.find((e) => e.event_name === 'page_view');
  assert.equal(exit.data.view_id, firstView.data.view_id);
});

test('hash routes and bfcache restores count as page views', async () => {
  const b = createBrowser({ url: 'https://site.test/#/home' });
  await b.load();
  b.goto('https://site.test/#/settings');
  b.window.dispatch('hashchange');
  await b.settle();
  b.window.dispatch('pagehide');
  b.window.dispatch('pageshow', { persisted: true });
  await b.settle();
  await b.flush();
  const views = b.sent.filter((e) => e.event_name === 'page_view').map((e) => e.data.page);
  assert.deepEqual(views, ['/#/home', '/#/settings', '/#/settings']);
});

test('session expires after 30 minutes of inactivity and visit_count increments per session', async () => {
  const local = storage();
  const a = createBrowser({ local });
  await a.load();
  await a.flush();
  const s1 = a.sent[0].data.session_id;
  local.setItem('analytics_session_ts', String(Date.now() - 31 * 60 * 1000));
  const b = createBrowser({ local });
  await b.load();
  await b.flush();
  const pv = b.sent.find((e) => e.event_name === 'page_view');
  assert.notEqual(pv.data.session_id, s1);
  assert.equal(pv.data.visit_count, 2);
  // A reload inside the session keeps the id and the count.
  const c = createBrowser({ local });
  await c.load();
  await c.flush();
  const pv2 = c.sent.find((e) => e.event_name === 'page_view');
  assert.equal(pv2.data.session_id, pv.data.session_id);
  assert.equal(pv2.data.visit_count, 2);
});

test('URLs lose query strings and emails are redacted', async () => {
  const b = createBrowser({ url: 'https://site.test/u/jane@example.com?token=abc&utm_medium=email' });
  b.document.referrer = 'https://mail.test/inbox?session=secret';
  await b.load();
  b.api().trackEvent('signup', { label: 'contact bob@example.com', href: 'https://x.test/reset?token=zzz' });
  await b.flush();
  const text = JSON.stringify(b.sent);
  assert.equal(text.includes('jane@example.com'), false);
  assert.equal(text.includes('bob@example.com'), false);
  assert.equal(text.includes('token=abc'), false);
  assert.equal(text.includes('secret'), false);
  assert.equal(text.includes('zzz'), false);
  const pv = b.sent.find((e) => e.event_name === 'page_view');
  assert.equal(pv.data.attribution.landing_page, '/u/[email]?utm_medium=email');
  assert.equal(pv.data.attribution.referrer, 'https://mail.test/inbox');
});

test('unload flush splits large queues into beacons under 64KB', async () => {
  const b = createBrowser();
  await b.load();
  for (let i = 0; i < 300; i++) b.api().trackEvent('bulk', { custom: { blob: 'x'.repeat(500) } });
  b.window.dispatch('pagehide');
  assert.ok(b.beacons.length > 1);
  for (const beacon of b.beacons) assert.ok(beacon.size < 64000);
  assert.equal(b.sent.filter((e) => e.event_name === 'bulk').length, 300);
});

test('regular batches use fetch keepalive', async () => {
  const b = createBrowser();
  await b.load();
  await b.flush();
  const post = b.fetches.find((f) => f.opts.method === 'POST');
  assert.equal(post.opts.keepalive, true);
});

test('web vitals: final LCP, INP, windowed CLS reported once on hide', async () => {
  const b = createBrowser();
  await b.load();
  b.perf('largest-contentful-paint', [{ startTime: 900, renderTime: 900 }, { startTime: 1800, renderTime: 1800 }]);
  b.perf('event', [{ interactionId: 1, duration: 80 }, { interactionId: 2, duration: 240 }]);
  // Two windows: 0.05 + 0.05 (close together) and a lone 0.08 six seconds later.
  b.perf('layout-shift', [
    { startTime: 1000, value: 0.05 },
    { startTime: 1500, value: 0.05 },
    { startTime: 8000, value: 0.08 },
  ]);
  b.hide();
  b.show();
  b.hide();
  const vital = (n) => b.sent.filter((e) => e.event_name === n);
  assert.equal(vital('web_vital_lcp').length, 1);
  assert.equal(vital('web_vital_lcp')[0].data.value, 1800);
  assert.equal(vital('web_vital_inp')[0].data.value, 240);
  assert.equal(vital('web_vital_cls').length, 1);
  assert.equal(vital('web_vital_cls')[0].data.value, 0.1);
  assert.equal(vital('web_vital_fid').length, 0);
});

test('errors carry a message, drop URL queries and are capped', async () => {
  const b = createBrowser();
  await b.load();
  for (let i = 0; i < 30; i++) {
    b.window.dispatch('error', { message: 'boom', filename: 'https://site.test/app.js?sig=1', error: { stack: 'at https://site.test/app.js?sig=1:1:1' } });
  }
  b.window.dispatch('error', {}); // resource error: ignored
  await b.flush();
  const errors = b.sent.filter((e) => e.event_name === 'javascript_error');
  assert.equal(errors.length, 20);
  assert.equal(errors[0].data.message, 'boom');
  assert.equal(JSON.stringify(errors).includes('sig=1'), false);
});
