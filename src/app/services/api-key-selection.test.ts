import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEMO_API_KEY,
  applyLoadedKeys,
  enterDemo,
  initialSelection,
  isDemoApiKey,
  leaveDemo,
  resolveSelectedKey,
  sanitizeStoredKey,
  selectKey,
  storedKeyShouldBeRemoved,
} from './api-key-selection.ts';

const siteA = { apiKey: 'key-a', name: 'alpha.com' };
const siteB = { apiKey: 'key-b', name: 'beta.com' };
const demoKey = { apiKey: DEMO_API_KEY, name: 'demo-site.com' };

test('a stored DEMO-KEY is not a real selection and is the only entry to drop', () => {
  assert.equal(sanitizeStoredKey(DEMO_API_KEY), null);
  assert.equal(sanitizeStoredKey('key-b'), 'key-b');
  assert.equal(sanitizeStoredKey(null), null);
  assert.equal(storedKeyShouldBeRemoved(DEMO_API_KEY), true);
  assert.equal(storedKeyShouldBeRemoved('key-a'), false);
  assert.equal(storedKeyShouldBeRemoved('analytics_preferences'), false);
});

test('reload and direct dashboard load ignore a contaminated DEMO-KEY and keep a real site', () => {
  const contaminated = initialSelection(DEMO_API_KEY);
  assert.equal(contaminated.selected, null);
  assert.equal(contaminated.demo, false);

  const direct = initialSelection('key-b');
  const loaded = applyLoadedKeys(direct, [siteA, siteB]);
  assert.equal(loaded.state.selected, 'key-b');
  assert.equal(loaded.persist, 'key-b');
  assert.deepEqual(loaded.state.keys.map(key => key.apiKey), ['key-a', 'key-b']);
});

test('multiple sites: demo then dashboard restores the site that was selected before demo', () => {
  let state = applyLoadedKeys(initialSelection('key-b'), [siteA, siteB]).state;
  const entered = enterDemo(state, [demoKey], DEMO_API_KEY);
  assert.equal(entered.persist, undefined);
  assert.equal(entered.state.selected, DEMO_API_KEY);
  assert.equal(entered.state.saved?.selected, 'key-b');
  assert.equal(isDemoApiKey(entered.state.selected), true);

  const left = leaveDemo(entered.state);
  assert.equal(left.persist, undefined);
  assert.equal(left.state.selected, 'key-b');
  assert.equal(left.state.demo, false);
  assert.deepEqual(left.state.keys.map(key => key.apiKey), ['key-a', 'key-b']);

  const again = applyLoadedKeys(left.state, [siteA, siteB]);
  assert.equal(again.state.selected, 'key-b');
  assert.notEqual(again.persist, DEMO_API_KEY);
});

test('signed-out demo does not replace a previously stored real site', () => {
  const state = initialSelection('key-a');
  const entered = enterDemo(state, [demoKey], DEMO_API_KEY);
  assert.equal(entered.persist, undefined);
  assert.equal(entered.state.saved?.selected, 'key-a');
  assert.equal(entered.state.saved?.loaded, false);

  const left = leaveDemo(entered.state);
  assert.equal(left.state.selected, 'key-a');
  assert.equal(left.persist, undefined);
});

test('entering demo twice does not forget the original site', () => {
  const state = initialSelection('key-a');
  const first = enterDemo(state, [demoKey], DEMO_API_KEY).state;
  const second = enterDemo(first, [demoKey], DEMO_API_KEY).state;
  assert.equal(second.saved?.selected, 'key-a');
  assert.equal(leaveDemo(second).state.selected, 'key-a');
});

test('demo -> events load parks real keys without showing DEMO-KEY as the saved site', () => {
  const demo = enterDemo(initialSelection('key-a'), [demoKey], DEMO_API_KEY).state;
  const loaded = applyLoadedKeys(demo, [siteA, siteB, demoKey]);
  assert.equal(loaded.state.demo, true);
  assert.equal(loaded.state.selected, DEMO_API_KEY);
  assert.equal(loaded.state.saved?.selected, 'key-a');
  assert.equal(loaded.persist, 'key-a');
  assert.ok(loaded.state.saved?.keys.every(key => key.apiKey !== DEMO_API_KEY));

  const back = leaveDemo(loaded.state);
  assert.equal(back.state.selected, 'key-a');
  assert.deepEqual(back.state.keys.map(key => key.apiKey), ['key-a', 'key-b']);
});

test('with no surviving real selection, the first real site is used and DEMO-KEY is never persisted', () => {
  const loaded = applyLoadedKeys(initialSelection(DEMO_API_KEY), [siteB, siteA]);
  assert.equal(loaded.state.selected, 'key-b');
  assert.equal(loaded.persist, 'key-b');
  assert.equal(resolveSelectedKey([], 'key-a'), null);
});

test('picking a site persists it; picking the demo sentinel does not', () => {
  const real = selectKey(initialSelection('key-a'), 'key-b');
  assert.equal(real.state.selected, 'key-b');
  assert.equal(real.persist, 'key-b');

  const demo = enterDemo(initialSelection('key-a'), [demoKey], DEMO_API_KEY).state;
  const picked = selectKey(demo, DEMO_API_KEY);
  assert.equal(picked.persist, undefined);
  assert.equal(picked.state.saved?.selected, 'key-a');
});
