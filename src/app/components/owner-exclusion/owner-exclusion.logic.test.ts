import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEmail, removeEmail, ownerModeLink, isValidEmail, isOwnerModeOn, MAX_EXCLUDED } from './owner-exclusion.logic.ts';

test('addEmail normalizes, validates and dedupes', () => {
  assert.deepEqual(addEmail([], ' QA@Site.com ').list, ['qa@site.com']);
  assert.ok(addEmail(['qa@site.com'], 'qa@SITE.com').error);
  assert.ok(addEmail([], 'nope').error);
  assert.ok(addEmail([], '  ').error);
  const full = Array.from({ length: MAX_EXCLUDED }, (_, i) => `u${i}@x.com`);
  assert.ok(addEmail(full, 'new@x.com').error);
  assert.deepEqual(removeEmail(['a@x.com', 'b@x.com'], 'a@x.com'), ['b@x.com']);
  assert.equal(isValidEmail('a@b.co'), true);
});

test('ownerModeLink builds ?pulz_owner links', () => {
  assert.equal(ownerModeLink('https://tabletennistube.com'), 'https://tabletennistube.com/?pulz_owner=1');
  assert.equal(ownerModeLink('example.com/blog?x=1'), 'https://example.com/blog?x=1&pulz_owner=1');
  assert.equal(ownerModeLink('https://a.com/?pulz_owner=1', false), 'https://a.com/?pulz_owner=0');
  assert.equal(ownerModeLink(''), '?pulz_owner=1');
});

test('isOwnerModeOn reads pulz_is_owner', () => {
  assert.equal(isOwnerModeOn({ getItem: () => 'true' }), true);
  assert.equal(isOwnerModeOn({ getItem: () => null }), false);
  assert.equal(isOwnerModeOn(null), false);
});
