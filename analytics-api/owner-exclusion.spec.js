'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./server');
const { createMemoryDb } = require('./memory-db');
const { buildRules, isExcludedEvent, exclusionMatch, clearExclusionCache } = require('./owner-exclusion');
const { matches } = require('./memory-db');

const KEY = 'PULZ-PRD-OWNER';
const OWNER = 'owner@example.com';

beforeEach(() => {
  clearExclusionCache();
  delete process.env.EXCLUDED_EMAILS;
  delete process.env.EXCLUDED_USER_IDS;
});

async function withServer(app, fn) {
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try { return await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((r) => server.close(r)); }
}

function ev(email, userId, page = '/x') {
  return { event_name: 'page_view', user_id: userId, user_email: email, page, timestamp: new Date().toISOString(),
    data: { user_email: email, user_id: userId, page, session_id: 's-' + userId, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/155.0' } };
}

test('isExcludedEvent matches email case-insensitively and user_id', () => {
  const rules = buildRules({ emails: [OWNER], userIds: ['u-1'] });
  assert.equal(isExcludedEvent({ data: { user_email: 'Owner@Example.com' } }, rules), true);
  assert.equal(isExcludedEvent({ user_id: 'u-1' }, rules), true);
  assert.equal(isExcludedEvent({ user_email: 'fan@example.com', user_id: 'u-2' }, rules), false);
  assert.equal(isExcludedEvent({ user_email: OWNER }, buildRules()), false);
});

test('exclusionMatch hides owner rows and keeps anonymous ones', () => {
  const m = exclusionMatch(buildRules({ emails: [OWNER] }));
  assert.equal(matches({ user_email: OWNER, data: { user_email: OWNER } }, m), false);
  assert.equal(matches({ data: {} }, m), true);
  assert.equal(matches({ user_email: 'fan@example.com', data: { user_email: 'fan@example.com' } }, m), true);
});

test('ingest drops events for the api key ownerEmail / excludedUserIds', async () => {
  const db = createMemoryDb({ events: [], api_keys: [{ apiKey: KEY, ownerEmail: OWNER, excludedUserIds: ['u-owner-phone'] }] });
  await withServer(createApp({ db }), async (url) => {
    const res = await fetch(`${url}/analytics/log?apiKey=${KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://tabletennistube.com' },
      body: JSON.stringify([ev(OWNER, 'u-owner'), ev(null, 'u-owner-phone'), ev('fan@example.com', 'u-fan')]),
    });
    assert.equal(res.status, 200);
  });
  const stored = await db.collection('events').find({}).toArray();
  assert.deepEqual(stored.map((d) => d.user_id), ['u-fan']);
});

test('EXCLUDED_EMAILS env drops events and hides historical rows at report time', async () => {
  process.env.EXCLUDED_EMAILS = OWNER;
  const old = { ...ev(OWNER, 'u-owner', '/old'), apiKey: KEY, service: KEY };
  const fan = { ...ev('fan@example.com', 'u-fan', '/fan'), apiKey: KEY, service: KEY };
  const db = createMemoryDb({ events: [old, fan], api_keys: [{ apiKey: KEY }] });
  await withServer(createApp({ db }), async (url) => {
    await fetch(`${url}/analytics/log?apiKey=${KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([ev(OWNER, 'u-owner')]),
    });
    const hist = await (await fetch(`${url}/analytics/event-history?apiKey=${KEY}`)).json();
    assert.deepEqual(hist.events.map((e) => e.user_id), ['u-fan']);
  });
  // Historical row is not deleted.
  assert.equal((await db.collection('events').find({}).toArray()).length, 2);
});
