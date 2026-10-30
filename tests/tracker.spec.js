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

function link(href, attrs = {}) {
  const a = {
    href, tagName: 'A', textContent: attrs.text || 'Link', innerText: attrs.text || 'Link',
    getAttribute: (k) => (k === 'href' ? href : attrs[k] ?? null),
    hasAttribute: (k) => k in attrs,
    closest: (sel) => (sel.startsWith('a') ? a : null),
    classList: [], id: '', parentElement: null,
  };
  return a;
}

test('outbound links and file downloads are tracked without query strings', async () => {
  const b = createBrowser();
  await b.load();
  b.document.dispatch('click', { target: link('https://other.example/page?ref=me') });
  b.document.dispatch('click', { target: link('https://site.test/files/report.PDF?token=x') });
  b.document.dispatch('auxclick', { target: link('/files/blob', { download: '' }) });
  b.document.dispatch('click', { target: link('/internal') });
  b.document.dispatch('click', { target: link('mailto:a@b.co') });
  await b.flush();
  const out = b.sent.filter((e) => e.event_name === 'outbound_click');
  assert.equal(out.length, 1);
  assert.equal(out[0].data.domain, 'other.example');
  assert.equal(out[0].data.url, 'https://other.example/page');
  const dl = b.sent.filter((e) => e.event_name === 'file_download');
  assert.deepEqual(dl.map((e) => e.data.file_type), ['pdf', 'file']);
  assert.equal(dl[0].data.url, 'https://site.test/files/report.PDF');
});

test('404 meta tag, trackNotFound API and site search', async () => {
  const b = createBrowser({ url: 'https://site.test/missing?q=red+shoes', meta: { 'meta[name="pulzivo:404"]': 'true' } });
  await b.load();
  b.api().trackNotFound('/other-missing');
  b.history.pushState({}, '', '/missing?q=blue');
  await b.settle();
  b.history.pushState({}, '', '/missing?q=blue&page=2'); // same term: no new view
  await b.settle();
  await b.flush();
  const nf = b.sent.filter((e) => e.event_name === 'not_found').map((e) => e.data.page);
  assert.ok(nf.includes('/missing') && nf.includes('/other-missing'));
  const terms = b.sent.filter((e) => e.event_name === 'site_search').map((e) => e.data.term);
  assert.deepEqual(terms, ['red shoes', 'blue']);
  assert.equal(b.sent.filter((e) => e.event_name === 'page_view').length, 2);
});

test('Do Not Track / GPC and optOut stop tracking; optIn resumes', async () => {
  for (const opts of [{ dnt: true }, { gpc: true }]) {
    const b = createBrowser(opts);
    await b.load();
    await b.flush();
    assert.equal(b.sent.length, 0);
  }
  const b = createBrowser();
  await b.load();
  b.api().optOut();
  assert.equal(b.api().isOptedOut(), true);
  b.api().trackGoal('signup');
  await b.flush();
  assert.equal(b.sent.filter((e) => e.event_name === 'goal').length, 0);
  b.api().optIn();
  b.api().trackGoal('signup');
  await b.flush();
  assert.equal(b.sent.filter((e) => e.event_name === 'goal').length, 1);
});

test('goal and revenue API (object and command forms)', async () => {
  const b = createBrowser();
  await b.load();
  b.api().trackRevenue('49.99', 'eur', { goal: 'purchase', order_id: 'A-1' });
  b.window.pulzivo('revenue', 10, 'USD');
  b.window.PulzivoAnalytics('goal', 'signup');
  b.api().trackRevenue('abc', 'USD');
  await b.flush();
  const rev = b.sent.filter((e) => e.event_name === 'revenue');
  assert.equal(rev.length, 2);
  assert.equal(rev[0].data.value, 49.99);
  assert.equal(rev[0].data.currency, 'EUR');
  assert.equal(rev[0].data.goal, 'purchase');
  assert.equal(rev[0].data.order_id, 'A-1');
  assert.equal(rev[1].data.currency, 'USD');
  assert.equal(b.sent.find((e) => e.event_name === 'goal').data.goal, 'signup');
});

test('email set by the site is sent; incidental emails stay redacted', async () => {
  const b = createBrowser({ url: 'https://site.test/account?email=x@y.co' });
  await b.load();
  b.api().setUserEmail('member@site.test');
  b.api().trackEvent('clicked', { label: 'mail other@person.test', url: 'https://site.test/p?to=a@b.co' });
  b.window.PulzivoAnalytics('identify', 'member2@site.test');
  b.api().trackEvent('after_identify', {});
  await b.flush();
  const ev = b.sent.find((e) => e.event_name === 'clicked');
  assert.equal(ev.user_email, 'member@site.test');
  assert.equal(ev.data.user_email, 'member@site.test');
  assert.equal(ev.data.user_type, 'authenticated');
  assert.ok(!JSON.stringify(ev.data).includes('other@person.test'));
  assert.ok(!JSON.stringify(ev.data).includes('a@b.co'));
  assert.ok(!JSON.stringify(ev.data).includes('x@y.co'));
  const ev2 = b.sent.find((e) => e.event_name === 'after_identify');
  assert.equal(ev2.data.user_email, 'member2@site.test');
});

// ── Privacy-friendly visitor ID, opt-in identity ───────────────────────────
test('default visitor ID is anonymous, rotates daily and is not a permanent ID', async () => {
  const local = storage();
  local.setItem('analytics_user_id', 'legacy-permanent-id');
  local.setItem('userEmail', 'old@site.test');
  const a = createBrowser({ local });
  await a.load();
  await a.flush();
  const id1 = a.sent[0].user_id;
  assert.match(id1, /^a-/);
  assert.equal(local.getItem('analytics_user_id'), null);
  assert.equal(local.getItem('userEmail'), null);
  assert.ok(!JSON.stringify(a.sent).includes('old@site.test'));
  // Same day, new page load: same anonymous ID (unique visitors per day still work).
  const b = createBrowser({ local });
  await b.load();
  await b.flush();
  assert.equal(b.sent[0].user_id, id1);
  // Next day: a fresh ID, nothing links the two days.
  local.setItem('pz_vid', 'Mon Jan 01 2001|' + id1);
  const c = createBrowser({ local });
  await c.load();
  await c.flush();
  assert.notEqual(c.sent[0].user_id, id1);
  assert.equal(c.sent[0].data.user_type, 'anonymous');
});

test('identify(id) persists a stable ID; email stays out of localStorage; reset forgets', async () => {
  const local = storage();
  const session = storage();
  const a = createBrowser({ local, session });
  await a.load();
  a.api().identify('user-42', { email: 'member@site.test' });
  a.api().trackEvent('after', {});
  await a.flush();
  const ev = a.sent.find((e) => e.event_name === 'after');
  assert.equal(ev.user_id, 'user-42');
  assert.equal(ev.user_email, 'member@site.test');
  assert.equal(ev.data.user_type, 'authenticated');
  assert.equal(local.getItem('pz_uid'), 'user-42');
  assert.ok(![...local._m.values()].some((v) => String(v).includes('member@site.test')));
  // Another day, same browser: still user-42.
  local.setItem('pz_vid', 'Mon Jan 01 2001|a-x');
  const b = createBrowser({ local });
  await b.load();
  await b.flush();
  assert.equal(b.sent[0].user_id, 'user-42');
  b.window.PulzivoAnalytics('reset');
  b.api().trackEvent('signed_out', {});
  await b.flush();
  const out = b.sent.find((e) => e.event_name === 'signed_out');
  assert.match(out.user_id, /^a-/);
  assert.equal(local.getItem('pz_uid'), null);
});

// ── Plans: vitals + scroll on Free, extras only when needed ────────────────
test('free plan: web vitals and scroll depth are sent; extras module not fetched', async () => {
  const b = createBrowser({ plan: 'free' });
  await b.load();
  b.window.pageYOffset = 1200;
  b.window.dispatch('scroll');
  await b.settle();
  b.perf('largest-contentful-paint', [{ startTime: 700, renderTime: 700 }]);
  b.hide();
  assert.equal(b.sent.filter((e) => e.event_name === 'web_vital_lcp').length, 1);
  const exit = b.sent.find((e) => e.event_name === 'page_exit');
  assert.equal(exit.data.scroll_depth, 100);
  assert.equal(b.scripts.length, 0);
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'pulzivo-analytics.js'), 'utf8');
  assert.match(src, /batchIntervalMs: 5000,/);
});

test('pro plan: JS errors (incl. ones thrown before the module loads) are tracked; free is not', async () => {
  const pro = createBrowser({ plan: 'pro' });
  await pro.load();
  assert.ok(pro.scripts.some((s) => /pulzivo-analytics-extras/.test(s)));
  pro.window.dispatch('error', { message: 'late boom' });
  pro.window.dispatch('unhandledrejection', { reason: { message: 'nope' } });
  await pro.flush();
  assert.ok(pro.names().includes('javascript_error'));
  assert.ok(pro.names().includes('promise_rejection'));
  const free = createBrowser({ plan: 'free' });
  await free.load();
  free.window.dispatch('error', { message: 'boom' });
  await free.flush();
  assert.equal(free.names().includes('javascript_error'), false);
});

// ── Click text ─────────────────────────────────────────────────────────────
function el(tag, text, extra = {}) {
  const e = Object.assign({
    tagName: tag, innerText: text, textContent: text, id: '', className: '', type: '', value: '',
    getAttribute: (k) => extra.attrs?.[k] ?? null,
    hasAttribute: (k) => !!extra.attrs && k in extra.attrs,
    querySelector: () => null,
    matches: () => false,
  }, extra);
  e.closest = (sel) => (/button/.test(sel) && /^(BUTTON|A)$/.test(tag) ? e : (/data-click/.test(sel) && extra.attrs?.['data-click'] != null ? e : null));
  return e;
}

test('clicks carry trimmed element text; emails, bare numbers and typed values are dropped', async () => {
  const b = createBrowser({ plan: 'pro' });
  await b.load();
  b.document.dispatch('click', { target: el('BUTTON', '   Start   free\n trial  ' + 'x'.repeat(80)) });
  b.document.dispatch('click', { target: el('BUTTON', 'jane@site.test') });
  b.document.dispatch('click', { target: el('BUTTON', '+1 (416) 555-0100') });
  b.document.dispatch('click', { target: el('INPUT', '', { type: 'text', value: 'secret typed', attrs: { 'data-click': 'field' } }) });
  await b.flush();
  const clicks = b.sent.filter((e) => e.event_name === 'click');
  assert.equal(clicks[0].data.text, ('Start free trial ' + 'x'.repeat(80)).substring(0, 60));
  assert.equal(clicks[1].data.text, '');
  assert.equal(clicks[2].data.text, '');
  assert.equal(clicks[3].data.text, '');
  assert.ok(!JSON.stringify(b.sent).includes('secret typed'));
});

test('rage clicks record page path, element and text', async () => {
  const b = createBrowser({ url: 'https://site.test/checkout' });
  await b.load();
  const btn = el('BUTTON', 'Pay now');
  for (let i = 0; i < 3; i++) b.document.dispatch('click', { target: btn });
  await b.flush();
  const rage = b.sent.find((e) => e.event_name === 'rage_click');
  assert.equal(rage.data.page, '/checkout');
  assert.equal(rage.data.element, 'BUTTON');
  assert.equal(rage.data.text, 'Pay now');
  assert.equal(rage.data.click_count, 3);
});

// ── 404 by title, bots ─────────────────────────────────────────────────────
test('404 auto-detected from the page title (once per view); normal titles are not', async () => {
  const b = createBrowser({ url: 'https://site.test/nope' });
  b.document.title = 'Page not found | Shop';
  await b.load();
  b.api().trackNotFound();
  await b.flush();
  assert.equal(b.sent.filter((e) => e.event_name === 'not_found').length, 1);
  for (const title of ['404 - Shop', 'Error 404', 'Not Found']) {
    const c = createBrowser();
    c.document.title = title;
    await c.load();
    await c.flush();
    assert.equal(c.names().includes('not_found'), true, title);
  }
  for (const title of ['Pricing', 'Model 4040 review', 'Shop v1.404']) {
    const c = createBrowser();
    c.document.title = title;
    await c.load();
    await c.flush();
    assert.equal(c.names().includes('not_found'), false, title);
  }
});

test('automated browsers (webdriver, no languages, jsdom) send nothing', async () => {
  for (const opts of [{ webdriver: true }, { languages: [] }, { ua: 'Mozilla/5.0 (linux) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/22.1.0' }]) {
    const b = createBrowser(opts);
    await b.load();
    await b.flush();
    assert.equal(b.sent.length, 0, JSON.stringify(opts));
  }
});

test('core tracker stays <= 9 KB gzip (level 9 and CDN-like level 1); extras is separate', () => {
  const fs = require('node:fs');
  const zlib = require('node:zlib');
  const path = require('node:path');
  const min = fs.readFileSync(path.join(__dirname, '..', 'public', 'pulzivo-analytics.min.js'));
  assert.ok(zlib.gzipSync(min, { level: 9 }).length <= 9216);
  assert.ok(zlib.gzipSync(min, { level: 1 }).length <= 9216);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'pulzivo-analytics-extras.min.js')));
});
