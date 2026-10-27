import test from 'node:test';
import assert from 'node:assert/strict';
import { groupUserHistory } from './user-history.ts';

const e = (id: string, t: string, s: string | null, extra: any = {}) => ({ id, event_name: 'page_view', timestamp: t, session_id: s, ...extra });

test('groups by session, newest first, with summary', () => {
  const v = groupUserHistory([
    e('1', '2026-10-01T10:00:00Z', 'a'),
    e('2', '2026-10-01T10:05:00Z', 'a', { user_email: 'x@example.test' }),
    e('3', '2026-10-05T09:00:00Z', 'b', { user_email: 'x@example.test', email_inferred: true }),
    e('4', '2026-10-03T09:00:00Z', null),
  ]);
  assert.equal(v.total, 4);
  assert.equal(v.sessionCount, 2);
  assert.deepEqual(v.sessions.map((g) => g.sessionId), ['b', null, 'a']);
  assert.deepEqual(v.sessions[2].events.map((x) => x.id), ['2', '1']);
  assert.equal(v.sessions[2].start, '2026-10-01T10:00:00Z');
  assert.equal(v.sessions[2].end, '2026-10-01T10:05:00Z');
  assert.equal(v.firstSeen, '2026-10-01T10:00:00Z');
  assert.equal(v.lastSeen, '2026-10-05T09:00:00Z');
  assert.equal(v.email, 'x@example.test');
  assert.equal(v.emailInferred, false);
  assert.equal(v.truncated, false);
});

test('empty and truncated', () => {
  const v = groupUserHistory(null);
  assert.equal(v.total, 0); assert.equal(v.firstSeen, null); assert.equal(v.email, null);
  const many = Array.from({ length: 3 }, (_, i) => e(String(i), `2026-10-0${i + 1}T00:00:00Z`, 's'));
  assert.equal(groupUserHistory(many, 3).truncated, true);
});
