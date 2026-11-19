import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addEmail, removeEmail, ownerModeLink, isValidEmail, isOwnerModeOn, MAX_EXCLUDED,
  OWNER_URL_PARAMS, OWNER_EXCLUSION_FAQ, readBrowserExclusion, writeBrowserExclusion,
  browserExclusionLabel, canOpenOwnerLink,
} from './owner-exclusion.logic.ts';

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

test('browser exclusion remembers on/off per site and describes it', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  assert.equal(readBrowserExclusion(storage, 'KEY'), 'unknown');
  writeBrowserExclusion(storage, 'KEY', 'on');
  assert.equal(readBrowserExclusion(storage, 'KEY'), 'on');
  assert.equal(readBrowserExclusion(storage, 'OTHER'), 'unknown');
  writeBrowserExclusion(storage, 'KEY', 'off');
  assert.equal(browserExclusionLabel('on'), 'Your visits on this browser are excluded.');
  assert.equal(browserExclusionLabel('off'), 'Your visits on this browser are counted.');
  assert.equal(browserExclusionLabel('unknown'), 'Not set on this browser yet.');
  assert.equal(canOpenOwnerLink(ownerModeLink('https://example.com', false)), true);
  assert.equal(canOpenOwnerLink(ownerModeLink('')), false);
});

test('docs describe pulz_owner, exclude_owner and pulz_exclude_owner as method 6', () => {
  assert.deepEqual([...OWNER_URL_PARAMS], ['pulz_owner', 'exclude_owner', 'pulz_exclude_owner']);
  assert.match(OWNER_EXCLUSION_FAQ, /all 6 methods/);
  assert.doesNotMatch(OWNER_EXCLUSION_FAQ, /all 5 methods/);
  for (const param of OWNER_URL_PARAMS) assert.match(OWNER_EXCLUSION_FAQ, new RegExp(param));

  const root = join(dirname(fileURLToPath(import.meta.url)), '../../pages/docs');
  const html = readFileSync(join(root, 'docs.html'), 'utf8');
  const ts = readFileSync(join(root, 'docs.ts'), 'utf8');
  assert.match(html, /Method 6/);
  for (const param of OWNER_URL_PARAMS) {
    assert.match(html, new RegExp(param));
    assert.match(ts, new RegExp(param));
  }
  assert.match(ts, /all 6 methods/);
  assert.doesNotMatch(ts, /all 5 methods/);
});
