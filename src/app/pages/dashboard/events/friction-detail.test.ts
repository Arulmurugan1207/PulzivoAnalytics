import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFrictionView, splitLabel, frictionHint } from './friction-detail.ts';

test('rage click row: element text, selector, link, split', () => {
  const v = buildFrictionView('rage', {
    page: '/bracket-playground', element: 'BUTTON', text: 'Generate', elementId: 'gen', elementClass: 'btn primary big',
    count: 12, visitors: 4, devices: { Desktop: 9, Mobile: 3 }, browsers: { Chrome: 12 },
    firstSeen: '2026-10-01T10:00:00Z', lastSeen: '2026-10-02T10:00:00Z', recent: [{ time: '2026-10-02T10:00:00Z', device: 'Desktop', browser: 'Chrome', visitor: 'abcdefghijk' }],
  }, 'site.test');
  assert.equal(v.what, '“Generate”');
  assert.equal(v.detail, '<button #gen .btn.primary>');
  assert.equal(v.href, 'https://site.test/bracket-playground');
  assert.equal(v.split, 'Desktop 75% · Mobile 25% · Chrome 100%');
  assert.match(v.hint, /loading/);
  assert.equal(v.recent[0].meta, 'Desktop · Chrome · visitor abcdefgh');
});

test('error row: source file:line and hint', () => {
  const v = buildFrictionView('errors', { page: '/p', count: 3, message: "Cannot read properties of undefined (reading 'x')", source: 'https://s.test/main.js', line: 10, column: 2 });
  assert.equal(v.detail, '/main.js:10:2');
  assert.match(v.hint, /null check/);
});

test('abandon row and empty split', () => {
  const v = buildFrictionView('abandon', { page: '/c', count: 2, form: 'signup', lastField: null });
  assert.equal(v.what, 'Form “signup”');
  assert.equal(splitLabel({}, undefined), '—');
  assert.match(frictionHint('dead', { page: '/', count: 1, element: 'A' }), /href/);
});
