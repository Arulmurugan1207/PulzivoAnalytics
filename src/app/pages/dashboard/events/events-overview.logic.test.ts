import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  humanEventLabel, humanizeEvents, clickLabel, routeBreadcrumb, percentChange,
  sparklinePoints, frustrationInsight, isInternalEvent, formatCompact,
} from './events-overview.logic.ts';

test('human labels for common events', () => {
  assert.equal(humanEventLabel('page_view'), 'Page views');
  assert.equal(humanEventLabel('web_vital_lcp'), 'Page speed');
  assert.equal(humanEventLabel('unique_visitor_session'), 'Sessions');
  assert.equal(humanEventLabel('newsletter_signup'), 'Newsletter signup');
});

test('internal events hidden unless advanced; duplicates merged', () => {
  const evts = [
    { name: 'click', count: 10 }, { name: 'auto_click', count: 5 },
    { name: 'visibility', count: 99 }, { name: 'page_view', count: 15 },
  ];
  const simple = humanizeEvents(evts, false);
  assert.deepEqual(simple.map((r) => [r.label, r.count]), [['Clicks', 15], ['Page views', 15]]);
  assert.equal(simple[0].share, 50);
  const adv = humanizeEvents(evts, true);
  assert.equal(adv.length, 4);
  assert.ok(isInternalEvent('visibility'));
  assert.ok(!isInternalEvent('form_submit'));
});

test('click label prefers captured text, falls back to friendly tag', () => {
  assert.equal(clickLabel({ element: 'BUTTON', label: '  Sign   up ' }), 'Sign up');
  assert.equal(clickLabel({ element: 'BUTTON', label: '' }), 'Button');
  assert.equal(clickLabel({ element: 'A' }), 'Link');
  assert.equal(clickLabel({ element: 'A', label: 'https://x.com/tournaments/6AA0EAF51C0640469F' }), 'Link to Tournaments');
});

test('breadcrumbs collapse hex and uuid ids', () => {
  assert.equal(routeBreadcrumb('/tournaments/6AA0EAF51C064046A1B2/matches'), 'Tournaments › Matches');
  assert.equal(routeBreadcrumb('/players/3f2a1b4c-1111-2222-3333-444455556666?tab=1'), 'Players');
  assert.equal(routeBreadcrumb('/'), 'Home');
  assert.equal(routeBreadcrumb('/how-it-works'), 'How it works');
  assert.equal(routeBreadcrumb('/news/2026'), 'News');
  assert.equal(routeBreadcrumb('/matches'), 'Matches');
});

test('percent change and sparkline', () => {
  assert.equal(percentChange(150, 100), 50);
  assert.equal(percentChange(5, 0), null);
  assert.equal(percentChange(0, 0), 0);
  assert.equal(sparklinePoints([1]), '');
  assert.equal(sparklinePoints([0, 10]).split(' ').length, 2);
  assert.equal(formatCompact(44736), '44.7k');
  assert.equal(formatCompact(950), '950');
});

test('frustration insight names the hot spot, or null when zero', () => {
  assert.equal(frustrationInsight([], [], { rageClicks: 0, deadClicks: 0 }), null);
  const i = frustrationInsight(
    [{ label: 'Next round', element: 'BUTTON', page: '/tournaments/6AA0EAF51C064046A1B2/matches', count: 69 }],
    [], { rageClicks: 138, deadClicks: 0 },
  )!;
  assert.equal(i.headline, '138 frustrated clicks');
  assert.equal(i.detail, '50% on “Next round” on Tournaments › Matches');
});

import { buildStory, buildJourney, eventCategory, categorySeries, busiestDay, eventDescription } from './events-overview.logic.ts';

test('story: plain sentences, hidden when empty', () => {
  assert.deepEqual(buildStory({}), []);
  const s = buildStory({
    visitors: { current: 1454, change: 12.4 },
    topLanding: { path: '/tournaments/6AA0EAF51C064046A1B2/matches', count: 300 },
    topClick: { label: 'Groups', count: 90 },
    busiestDay: { date: '2026-10-20', count: 900 },
    countries: [{ country: 'Canada', share: 70 }],
    sources: [{ source: 'Google', visits: 10 }, { source: 'WhatsApp', visits: 4 }],
    frustration: { total: 138, label: 'Brackets', page: '/brackets' },
  }).map((x) => x.text);
  assert.deepEqual(s, [
    '1,454 people visited, up 12%.',
    'Most landed on Tournaments › Matches and clicked “Groups”.',
    'Busiest day was Tuesday, with 900 interactions.',
    'Visitors mostly came from Canada via Google and WhatsApp.',
    '138 frustrated clicks, mostly on “Brackets” on Brackets.',
  ]);
  for (const t of s) assert.ok(!/_/.test(t), 'no raw event names');
});

test('journey skips missing steps and falls back to form submit', () => {
  const j = buildJourney({ landing: { path: '/', count: 10 }, action: null, next: null, formSubmits: 3 });
  assert.deepEqual(j.map((x) => [x.label, x.detail, x.count]), [['Land on', 'Home', 10], ['Submit', 'a form', 3]]);
});

test('categories, stacked series, busiest day, descriptions', () => {
  assert.equal(eventCategory('web_vital_lcp'), 'performance');
  assert.equal(eventCategory('newsletter_signup'), 'custom');
  const cs = categorySeries([{ name: 'click', series: [1, 2] }, { name: 'auto_click', series: [1, 0] }, { name: 'visibility', series: [9, 9] }], 2);
  assert.deepEqual(cs.clicks, [2, 2]);
  assert.deepEqual(cs.navigation, [0, 0]);
  assert.deepEqual(busiestDay(['a', 'b'], [1, 5]), { date: 'b', count: 5 });
  assert.equal(busiestDay(['a'], [0]), null);
  assert.equal(eventDescription('my_thing'), 'Your custom event');
});
