import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_EMAIL_PREFS, WEEKLY_EMAIL_INCLUDES, parseEmailPrefs } from './email-prefs.logic.ts';

test('parseEmailPrefs requires both booleans', () => {
  assert.deepEqual(parseEmailPrefs({ weeklyReport: false, productTips: true }), {
    weeklyReport: false, productTips: true,
  });
  assert.equal(parseEmailPrefs({ weeklyReport: true }), null);
  assert.equal(parseEmailPrefs(null), null);
  assert.equal(parseEmailPrefs([]), null);
});

test('the weekly preview describes the email in plain language', () => {
  assert.equal(DEFAULT_EMAIL_PREFS.weeklyReport, true);
  assert.equal(DEFAULT_EMAIL_PREFS.productTips, true);
  assert.equal(WEEKLY_EMAIL_INCLUDES.length, 4);
  assert.match(WEEKLY_EMAIL_INCLUDES.join(' '), /pages/);
  assert.doesNotMatch(WEEKLY_EMAIL_INCLUDES.join(' '), /act now|expires|hurry/i);
});
