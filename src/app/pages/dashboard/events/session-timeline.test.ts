import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionTimeline, describeEvent, formatDuration, humanizeEventName, isTechnicalEvent } from './session-timeline.ts';

const T0 = Date.parse('2026-10-27T15:00:00Z');
let n = 0;
const ev = (name: string, sec: number, data: any = {}, extra: any = {}) => ({
  id: `e${++n}`, event_name: name, timestamp: new Date(T0 + sec * 1000).toISOString(), page: data.page ?? extra.page ?? '/', data, ...extra,
});

test('labels in plain language', () => {
  assert.equal(describeEvent(ev('click', 0, { label: 'Register' })).label, "Clicked 'Register'");
  assert.equal(describeEvent(ev('outbound_click', 0, { domain: 'www.youtube.com', url: 'https://www.youtube.com/x' })).label, 'Opened outbound link to youtube.com');
  assert.equal(describeEvent(ev('file_download', 0, { url: 'https://a.test/files/results.pdf' })).label, 'Downloaded results.pdf');
  assert.equal(describeEvent(ev('site_search', 0, { term: 'shoes' })).label, "Searched for 'shoes'");
  assert.equal(describeEvent(ev('form_submit', 0, { formId: 'signup' })).label, 'Submitted form signup');
  assert.equal(describeEvent(ev('not_found', 0)).label, 'Hit a 404 page');
  assert.equal(describeEvent(ev('goal', 0, { goal: 'Trial' })).label, "Reached goal 'Trial'");
  const rev = describeEvent(ev('revenue', 0, { value: 49.99, currency: 'usd' }));
  assert.equal(rev.label, 'Purchase $49.99 USD'); assert.equal(rev.kind, 'conversion');
  const err = describeEvent(ev('javascript_error', 0, { message: 'x is undefined', category: 'error' }));
  assert.equal(err.label, 'JavaScript error: x is undefined'); assert.equal(err.kind, 'error');
  assert.equal(describeEvent(ev('newsletter_opened', 0)).label, 'Newsletter opened');
  assert.equal(humanizeEventName('videoPlay_started'), 'Video play started');
});

test('technical detection and durations', () => {
  for (const x of ['session_start', 'unique_visitor_daily', 'page_exit', 'web_vital_lcp', 'resource_timing', 'impression', 'page_hidden']) assert.ok(isTechnicalEvent(x), x);
  assert.ok(!isTechnicalEvent('click'));
  assert.equal(formatDuration(12_000), '12 s');
  assert.equal(formatDuration(63_000), '1 min 3 s');
  assert.equal(formatDuration(252_000), '4 min 12 s');
  assert.equal(formatDuration(3_900_000), '1 h 5 min');
});

test('groups by page with time spent, scroll, gaps, idle, badges, technical toggle', () => {
  n = 0;
  const events = [
    ev('session_start', 0, { visit_count: 9, view_id: 'v1' }, { device: 'Desktop', country: 'United States' }),
    ev('page_view', 0, { view_id: 'v1', page_title: 'Home', visit_count: 9, scroll_depth: 0 }, { page: '/' }),
    ev('click', 12, { view_id: 'v1', label: 'Register', scroll_depth: 40 }),
    ev('page_exit', 20, { view_id: 'v1', time_on_page: 18000, scroll_depth: 75 }),
    ev('page_view', 21, { view_id: 'v2', page_title: '' }, { page: '/register' }),
    ev('form_submit', 150, { view_id: 'v2', formId: 'signup' }, { page: '/register' }),
    ev('web_vital_lcp', 151, { view_id: 'v2' }, { page: '/register' }),
  ];
  const v = buildSessionTimeline(events.slice().reverse(), { source: 'came from Google' });
  assert.deepEqual(v.summary, ['Visit 9', '2 min 31 s', '2 pages', '1 click', 'came from Google', 'Desktop, United States']);
  assert.equal(v.pages.length, 2);
  const [p1, p2] = v.pages;
  assert.equal(p1.title, 'Home'); assert.equal(p1.timeSpent, '18 s'); assert.equal(p1.maxScroll, 75);
  assert.ok(p1.landed && !p1.left); assert.ok(p2.left && !p2.landed);
  assert.equal(p2.title, '/register'); assert.equal(p2.timeSpent, '2 min 10 s');
  assert.equal(v.technicalCount, 3);
  assert.deepEqual(p1.steps.map((s) => s.label), ["Clicked 'Register'"]);
  assert.equal(p1.steps[0].gapLabel, '+12 s');
  assert.equal(p2.steps[0].label, 'Submitted form signup');
  assert.equal(p2.steps[0].idleBefore, 'Idle 2 min 9 s');
  const all = buildSessionTimeline(events, { showTechnical: true });
  assert.equal(all.pages[0].steps.length, 3);
  assert.equal(all.pages[0].steps[0].kind, 'technical');
});

test('empty and events without page_view', () => {
  assert.deepEqual(buildSessionTimeline([]).pages, []);
  n = 0;
  const v = buildSessionTimeline([ev('click', 0, { label: 'A' }, { page: '/a' }), ev('click', 5, { label: 'B' }, { page: '/a' })]);
  assert.equal(v.pages.length, 1); assert.equal(v.pages[0].title, '/a'); assert.equal(v.pages[0].steps.length, 2);
  assert.ok(!v.summary.some((s) => s.startsWith('Visit')));
});

test('source phrase', async () => {
  const { sourcePhrase } = await import('./session-timeline.ts');
  assert.equal(sourcePhrase('www.google.com · utm_source=x'), 'came from Google');
  assert.equal(sourcePhrase('news.example.org'), 'came from news.example.org');
  assert.equal(sourcePhrase('Direct (no referrer)'), 'direct visit');
  assert.equal(sourcePhrase('Not recorded'), '');
  assert.equal(sourcePhrase('—'), '');
});
