import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSIGHTS_SUMMARY_PATH, insightDestination, insightIcon, insightsRange, parseInsights } from './insights.logic.ts';

const line = {
  id: 'visits-up', severity: 'up', title: 'More people came back',
  detail: 'Returning visitors are up.', metric: 'visitors', change: '+18%', link: 'acquisition',
};

test('summary lives on its own path, not the metrics /analytics/insights route', () => {
  assert.equal(INSIGHTS_SUMMARY_PATH, '/analytics/insights/summary');
  assert.notEqual(INSIGHTS_SUMMARY_PATH, '/analytics/insights');
});

test('parseInsights keeps up to five valid lines and rejects the old object payload', () => {
  assert.equal(parseInsights({ outbound: 1 }), null);
  assert.equal(parseInsights(null), null);
  const parsed = parseInsights([
    line,
    { severity: 'nope', title: 'skip' },
    { severity: 'warn', title: 'Checkout is slow', detail: 'The form takes a while.', change: 12, link: '/dashboard/events' },
    ...Array.from({ length: 6 }, (_, i) => ({ ...line, id: `x${i}`, title: `Extra ${i}` })),
  ]);
  assert.equal(parsed?.length, 5);
  assert.equal(parsed?.[0].change, '+18%');
  assert.equal(parsed?.[1].id, 'insight-2');
  assert.equal(parsed?.[1].change, '12');
});

test('range follows the date picker: a week is 7d, a month is 30d', () => {
  const start = new Date('2026-11-01T00:00:00.000Z');
  const week = new Date('2026-11-07T00:00:00.000Z');
  const month = new Date('2026-11-30T00:00:00.000Z');
  assert.equal(insightsRange('Last 7 Days', start, week), '7d');
  assert.equal(insightsRange('Last 30 Days', start, month), '30d');
  assert.equal(insightsRange('Today'), '7d');
  assert.equal(insightsRange('This Year'), '30d');
  assert.equal(insightsRange(''), '30d');
});

test('links open the matching dashboard tab, and outside links stay outside', () => {
  assert.deepEqual(insightDestination('acquisition'), { external: false, path: '/dashboard/overview', query: { tab: 'acquisition' } });
  assert.deepEqual(insightDestination('technical'), { external: false, path: '/dashboard/overview', query: { tab: 'behaviour' } });
  assert.deepEqual(insightDestination('/dashboard/events?q=rage'), { external: false, path: '/dashboard/events', query: { q: 'rage' } });
  assert.equal(insightDestination('https://example.com/help').external, true);
  assert.equal(insightIcon('down'), 'pi-arrow-down');
  assert.equal(insightIcon('warn'), 'pi-exclamation-triangle');
  assert.equal(insightIcon('info'), 'pi-info-circle');
});
