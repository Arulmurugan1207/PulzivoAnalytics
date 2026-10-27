import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVitalCards, rateVital, formatVital, hasAnyVitals } from './web-vitals-view.ts';

const m = (p75: number | null, count = 10) => ({ avg: p75, p75, count });

test('ratings use Google thresholds', () => {
  assert.equal(rateVital('LCP', 2500), 'good');
  assert.equal(rateVital('LCP', 3000), 'needs-improvement');
  assert.equal(rateVital('LCP', 4001), 'poor');
  assert.equal(rateVital('INP', 180), 'good');
  assert.equal(rateVital('INP', 600), 'poor');
  assert.equal(rateVital('CLS', 0.1), 'good');
  assert.equal(rateVital('CLS', 0.2), 'needs-improvement');
  assert.equal(rateVital('TTFB', 900), 'needs-improvement');
  assert.equal(rateVital('FCP', null), 'no-data');
});

test('format', () => {
  assert.equal(formatVital('LCP', 2100), '2.10s');
  assert.equal(formatVital('INP', 85.4), '85ms');
  assert.equal(formatVital('CLS', 0.081), '0.08');
  assert.equal(formatVital('CLS', null), '—');
});

test('cards: INP preferred, FID fallback only for old data, empty state', () => {
  let cards = buildVitalCards({ LCP: m(2000), INP: m(150), FID: m(50), CLS: m(0.05), FCP: m(1000), TTFB: m(300) });
  assert.deepEqual(cards.map((c) => c.key), ['LCP', 'INP', 'CLS', 'FCP', 'TTFB']);
  assert.ok(cards.every((c) => c.rating === 'good'));
  cards = buildVitalCards({ LCP: m(null, 0), INP: m(null, 0), FID: m(120), CLS: m(null, 0) });
  assert.equal(cards[1].key, 'FID');
  assert.equal(cards[1].rating, 'needs-improvement');
  assert.equal(cards[0].ratingLabel, 'No data');
  const empty = buildVitalCards({});
  assert.equal(empty[1].key, 'INP');
  assert.equal(hasAnyVitals(empty), false);
  assert.equal(hasAnyVitals(cards), true);
});
