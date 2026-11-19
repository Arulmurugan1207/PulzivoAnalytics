import test from 'node:test';
import assert from 'node:assert/strict';
import { trackConversion } from './conversion.ts';
import { normalizePlan, rememberIntentPlan, readIntentPlan, INTENT_PLAN_KEY } from './intent-plan.ts';

test('cta_click is sent with a location and a missing tracker is a no-op', () => {
  const calls: unknown[][] = [];
  (globalThis as { PulzivoAnalytics?: (...args: unknown[]) => void }).PulzivoAnalytics = (...args) => {
    calls.push(args);
  };
  trackConversion('cta_click', { location: 'hero' });
  assert.deepEqual(calls, [['event', 'cta_click', { location: 'hero' }]]);

  delete (globalThis as { PulzivoAnalytics?: unknown }).PulzivoAnalytics;
  assert.doesNotThrow(() => trackConversion('signup_start'));
});

test('a throwing tracker does not escape into the page', () => {
  (globalThis as { PulzivoAnalytics?: () => void }).PulzivoAnalytics = () => {
    throw new Error('tracker down');
  };
  assert.doesNotThrow(() => trackConversion('signup_complete', { method: 'email' }));
  delete (globalThis as { PulzivoAnalytics?: unknown }).PulzivoAnalytics;
});

test('only real plan ids are remembered', () => {
  const store = new Map<string, string>();
  const memory = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
  };
  Object.defineProperty(globalThis, 'sessionStorage', { value: memory, configurable: true });

  assert.equal(normalizePlan(' Pro '), 'pro');
  assert.equal(normalizePlan('founder'), null);
  assert.equal(rememberIntentPlan('starter'), 'starter');
  assert.equal(readIntentPlan(), 'starter');
  assert.equal(store.get(INTENT_PLAN_KEY), 'starter');
  assert.equal(rememberIntentPlan(''), null);
  assert.equal(readIntentPlan(), 'starter');
});
