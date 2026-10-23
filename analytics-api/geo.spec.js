'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { TZ_ISO, isoForTimezone, countryForTimezone, isoForCountry, flagForIso } = require('./geo');
const { countryOf, countryFlag, withDerivedCountry } = require('./query');

test('tzdb mapping covers canonical zones and aliases', () => {
  assert.ok(Object.keys(TZ_ISO).length > 400);
  assert.strictEqual(isoForTimezone('Asia/Kuala_Lumpur'), 'MY');
  assert.strictEqual(countryForTimezone('Asia/Kuala_Lumpur'), 'Malaysia');
  for (const tz of ['Asia/Calcutta', 'Asia/Kolkata']) assert.strictEqual(isoForTimezone(tz), 'IN');
  for (const tz of ['Europe/Kiev', 'Europe/Kyiv']) assert.strictEqual(isoForTimezone(tz), 'UA');
  for (const tz of ['Asia/Saigon', 'Asia/Ho_Chi_Minh']) assert.strictEqual(isoForTimezone(tz), 'VN');
  assert.strictEqual(isoForTimezone('US/Eastern'), 'US');
  assert.strictEqual(countryForTimezone('Asia/Hong_Kong'), 'Hong Kong');
  assert.strictEqual(countryForTimezone('Europe/London'), 'United Kingdom');
});

test('ambiguous zones stay unknown', () => {
  for (const tz of ['UTC', 'GMT', 'Etc/UTC', 'Etc/GMT+5', 'EST', '', null, 'Nope/Zone']) {
    assert.strictEqual(isoForTimezone(tz), null, String(tz));
  }
  assert.strictEqual(countryOf({ data: { timezone: 'Etc/UTC' } }), 'Unknown');
});

test('countryOf prefers explicit country, falls back to timezone', () => {
  assert.strictEqual(countryOf({ data: { country: 'France', timezone: 'Asia/Kuala_Lumpur' } }), 'France');
  assert.strictEqual(countryOf({ data: { country: 'Unknown', timezone: 'Asia/Kuala_Lumpur' } }), 'Malaysia');
  assert.strictEqual(countryOf({ data: { timeZone: 'Asia/Kuala_Lumpur' } }), 'Malaysia');
  assert.strictEqual(countryOf({ timezone: 'Africa/Nairobi', data: {} }), 'Kenya');
  assert.strictEqual(countryOf({ data: { country: 'my' } }), 'Malaysia');
});

test('flags resolve for previously blank countries', () => {
  for (const [name, iso] of [['Russia', 'RU'], ['Kenya', 'KE'], ['Hong Kong', 'HK'], ['United Kingdom', 'GB'],
    ['Germany', 'DE'], ['France', 'FR'], ['Turkey', 'TR'], ['Türkiye', 'TR'], ['Norway', 'NO'],
    ['United Arab Emirates', 'AE'], ['United States', 'US'], ['Malaysia', 'MY'], ['UK', 'GB']]) {
    assert.strictEqual(isoForCountry(name), iso, name);
    assert.strictEqual(countryFlag(name), flagForIso(iso), name);
  }
  assert.strictEqual(countryFlag('Unknown'), '🌐');
});

test('withDerivedCountry enriches only when country missing', () => {
  const e = withDerivedCountry({ event_name: 'page_view', data: { timezone: 'Asia/Kuala_Lumpur' } });
  assert.deepStrictEqual([e.data.country, e.data.countryCode, e.data.countrySource], ['Malaysia', 'MY', 'timezone']);
  const keep = { data: { country: 'Germany', timezone: 'Asia/Kuala_Lumpur' } };
  assert.strictEqual(withDerivedCountry(keep), keep);
  const utc = { data: { timezone: 'UTC' } };
  assert.strictEqual(withDerivedCountry(utc), utc);
});

test('every distinct ICU country name maps back to a single current ISO code', () => {
  const { countryNameForIso } = require('./geo');
  for (const iso of new Set(Object.values(TZ_ISO))) {
    assert.strictEqual(isoForCountry(countryNameForIso(iso)), iso, iso);
  }
});
