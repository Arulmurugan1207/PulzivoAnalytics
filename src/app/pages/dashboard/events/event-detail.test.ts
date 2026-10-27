import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEventDetail, relativeTime, browserAndOs, isEmpty } from './event-detail.ts';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

test('who card: identified user, inferred flag, returning visitor', () => {
  const v = buildEventDetail({
    id: 'e1', event_name: 'page_view', user_id: 'u1', session_id: 's1',
    user_email: 'member@site.test', email_inferred: true, timestamp: '2026-10-27T19:24:19.091Z',
    data: { user_type: 'authenticated', visit_count: 9, first_visit: '2026-10-20T12:49:25.536Z' },
  })!;
  assert.equal(v.who.email, 'member@site.test');
  assert.equal(v.who.emailInferred, true);
  assert.equal(v.who.returning, true);
  assert.equal(v.who.visitCount, 9);
  assert.ok(v.who.firstVisit);
});

test('anonymous visitor, empty and null fields hidden, custom params listed', () => {
  const v = buildEventDetail({
    id: 'e2', event_name: 'click', user_id: 'u2', timestamp: '2026-10-27T19:24:19.091Z',
    country: 'Canada', flag: '🇨🇦', device: 'Desktop',
    data: {
      event_label: null, value: null, event_category: 'engagement', page_title: '',
      custom_parameters: { plan: 'pro', empty: '' }, button_id: 'cta', view_id: 'v1',
      userAgent: UA, screenResolution: '1440x900', language: 'en-CA',
      attribution: { landing_page: '/', utm_source: 'x' }, visit_count: 1,
    },
  }, 'Direct (no referrer)')!;
  assert.equal(v.who.email, '');
  assert.equal(v.who.userType, 'anonymous');
  assert.equal(v.who.returning, false);
  const labels = (rows: { label: string }[]) => rows.map((r) => r.label);
  assert.ok(!labels(v.event).includes('Label'));
  assert.ok(!labels(v.event).includes('Value'));
  assert.ok(!labels(v.page).includes('Page title'));
  assert.ok(v.event.every((r) => r.value !== 'null'));
  assert.deepEqual(v.custom.map((r) => r.label), ['plan', 'button_id']);
  assert.equal(v.device.find((r) => r.label === 'Country')!.value, '🇨🇦 Canada');
  assert.equal(v.device.find((r) => r.label === 'Browser')!.value, 'Chrome 141');
  assert.equal(v.device.find((r) => r.label === 'OS')!.value, 'macOS');
  assert.equal(v.source.find((r) => r.label === 'UTM Source')!.value, 'x');
});

test('helpers', () => {
  const now = Date.parse('2026-10-27T20:00:00Z');
  assert.equal(relativeTime('2026-10-27T19:57:00Z', now), '3 minutes ago');
  assert.equal(relativeTime('2026-10-27T19:59:50Z', now), 'just now');
  assert.equal(relativeTime('bad', now), '');
  assert.equal(browserAndOs('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1').os, 'iOS 18');
  assert.equal(isEmpty('null'), true);
  assert.equal(isEmpty(0), false);
});
