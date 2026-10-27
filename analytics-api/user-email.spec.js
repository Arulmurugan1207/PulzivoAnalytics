'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./server');
const { createMemoryDb } = require('./memory-db');

const KEY = 'PULZ-PRD-EML';

async function withServer(app, fn) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function ev(user_id, user_email, minutesAgo, apiKey = KEY) {
  return {
    event_name: 'page_view', apiKey, user_id, user_email, session_id: 's-' + user_id,
    page: '/', timestamp: new Date(Date.now() - minutesAgo * 60000),
    data: { session_id: 's-' + user_id, page: '/', user_id },
  };
}

test('event history shows stored email, and infers the last known email for a user_id', async () => {
  const docs = [
    ev('u1', 'old@example.test', 300),
    ev('u1', 'new@example.test', 200),
    ev('u1', null, 5),                       // after PR #29: no email
    ev('u2', 'direct@example.test', 4),
    ev('u3', null, 3),                       // never identified
    ev('u3', 'other-site@example.test', 100, 'OTHER-KEY'),
  ];
  await withServer(createApp({ db: createMemoryDb({ events: docs }) }), async (url) => {
    const body = await (await fetch(`${url}/analytics/event-history?apiKey=${KEY}`)).json();
    const latest = (id) => body.events.find((e) => e.user_id === id);
    assert.equal(latest('u1').user_email, 'new@example.test');
    assert.equal(latest('u1').email_inferred, true);
    assert.equal(latest('u2').user_email, 'direct@example.test');
    assert.equal(latest('u2').email_inferred, undefined);
    assert.equal(latest('u3').user_email, null);

    const sess = await (await fetch(`${url}/analytics/session-events?apiKey=${KEY}&sessionId=s-u1`)).json();
    assert.ok(sess.events.every((e) => e.user_email === 'new@example.test' || e.user_email === 'old@example.test'));
  });
});
