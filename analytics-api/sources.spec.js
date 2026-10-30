'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { canonicalSourceName } = require('./sources');
const { referrerIdentity, classifySource } = require('./query');

const cases = require('./test-fixtures/source-name-cases.json');

test('canonicalSourceName maps aliases and hosts case-insensitively (shared table)', () => {
  for (const [name, inputs] of Object.entries(cases)) {
    for (const input of inputs) assert.strictEqual(canonicalSourceName(input), name, input);
  }
});

test('referrerIdentity merges utm tokens with their referrer host', () => {
  const viaUtm = referrerIdentity({ attribution: { utm_source: 'ig' } });
  const viaHost = referrerIdentity({ attribution: { referrer: 'https://l.instagram.com/' } });
  assert.strictEqual(viaUtm.name, 'Instagram');
  assert.strictEqual(viaHost.name, 'Instagram');
  assert.strictEqual(viaHost.host, 'l.instagram.com');
  assert.strictEqual(referrerIdentity({ attribution: { utm_source: 'copy' } }).name, 'Copied link');
  assert.strictEqual(referrerIdentity({}).name, 'Direct');
  assert.strictEqual(classifySource({ attribution: { utm_source: 'yt' } }), 'Social Media');
  assert.strictEqual(classifySource({ attribution: { utm_source: 'brave' } }), 'Organic Search');
});
