import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FOUNDER_OFFER, formatPeriodEnd, isBelowPro, parseUsage, proBenefitLines, usageLevel, usagePercent,
} from './usage.logic.ts';

test('parseUsage reads the contract and ignores a missing payload', () => {
  const snapshot = parseUsage({
    plan: 'free',
    periodStart: '2026-11-01T00:00:00.000Z',
    periodEnd: '2026-12-01T00:00:00.000Z',
    eventsUsed: 8000,
    eventsLimit: 10000,
    percent: 12,
    proFeatures: ['sessions', 'error_tracking'],
  });
  assert.equal(snapshot?.plan, 'free');
  assert.equal(snapshot?.percent, 80);
  assert.deepEqual(snapshot?.proFeatures, ['sessions', 'error_tracking']);
  assert.equal(parseUsage(null), null);
  assert.equal(parseUsage({ plan: 'free' }), null);
  assert.equal(parseUsage([]), null);
});

test('usage percent prefers used/limit and clamps', () => {
  assert.equal(usagePercent(10000, 10000, 0), 100);
  assert.equal(usagePercent(0, 0, 0.8), 80);
  assert.equal(usagePercent(0, 0, 92), 92);
  assert.equal(usagePercent(50, 0, 'nope'), 0);
});

test('80% is a soft nudge and 100% is the upgrade card', () => {
  assert.equal(usageLevel({ percent: 79, eventsLimit: 10000 }), 'ok');
  assert.equal(usageLevel({ percent: 80, eventsLimit: 10000 }), 'soft');
  assert.equal(usageLevel({ percent: 100, eventsLimit: 10000 }), 'full');
  assert.equal(usageLevel({ percent: 100, eventsLimit: 0 }), 'ok');
  assert.equal(usageLevel({ percent: null, eventsLimit: null }), 'ok');
});

test('Enterprise sends a null cap and the meter stays quiet', () => {
  const snapshot = parseUsage({
    plan: 'enterprise',
    periodStart: '2026-11-01T00:00:00.000Z',
    periodEnd: '2026-12-01T00:00:00.000Z',
    eventsUsed: 42000,
    eventsLimit: null,
    percent: null,
    proFeatures: [],
  });
  assert.equal(snapshot?.eventsLimit, null);
  assert.equal(snapshot?.percent, null);
  assert.equal(snapshot?.eventsUsed, 42000);
  assert.equal(usageLevel(snapshot!), 'ok');
});

test('upgrade copy lists benefits and the founder offer without a countdown', () => {
  assert.match(FOUNDER_OFFER, /FOUNDER50/);
  assert.match(FOUNDER_OFFER, /first 10 paying customers/);
  assert.doesNotMatch(FOUNDER_OFFER, /today only|expires|hurry|last chance/i);
  const lines = proBenefitLines(['sessions', 'not_a_key']);
  assert.equal(lines[0], 'Sessions and time on site');
  assert.equal(lines[1], 'Not A Key');
  assert.ok(lines.includes('A full year of history'));
  assert.equal(lines.length <= 8, true);
  assert.equal(isBelowPro('free'), true);
  assert.equal(isBelowPro('starter'), true);
  assert.equal(isBelowPro('pro'), false);
  assert.equal(formatPeriodEnd('2026-12-01T00:00:00.000Z'), 'December 1, 2026');
  assert.equal(formatPeriodEnd(''), '');
});
