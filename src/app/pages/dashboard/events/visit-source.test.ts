import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeVisitSource, isCrawlerUserAgent } from './visit-source.ts';

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

test('crawler user agent wins over everything else', () => {
  const evt = {
    timestamp: '2026-10-06T16:27:53.562Z',
    data: { userAgent: 'Mediapartners-Google', attribution: {} },
  };
  assert.equal(describeVisitSource(evt, [evt]), 'Bot / crawler (Mediapartners-Google)');
  assert.equal(isCrawlerUserAgent('Mozilla/5.0 (iPhone) Mobile/15E148 [FBAN/FBIOS;FBAV/530.0]'), false);
  assert.equal(isCrawlerUserAgent('Mozilla/5.0 (iPhone) Mobile/15E148 Instagram 400.0.0.21.88'), false);
});

test('referrer host plus UTMs, from the earliest event in the session', () => {
  const first = {
    timestamp: '2026-10-06T16:00:00.000Z',
    data: {
      userAgent: CHROME,
      attribution: {
        landing_page: '/news/a?utm_source=facebook&utm_medium=social&utm_campaign=share_link',
        landing_domain: 'tabletennistube.com',
        referrer: 'https://l.facebook.com/',
        referrer_domain: 'l.facebook.com',
        utm_source: 'facebook',
        utm_medium: 'social',
        utm_campaign: 'share_link',
      },
    },
  };
  const later = {
    timestamp: '2026-10-06T16:05:00.000Z',
    data: { userAgent: CHROME, attribution: { landing_page: '/news/b', landing_domain: 'tabletennistube.com', referrer: null } },
  };
  assert.equal(describeVisitSource(later, [later, first]), 'l.facebook.com · facebook / social / share_link');
});

test('referrer only, www stripped; UTMs only when the app stripped the referrer', () => {
  const google = { data: { userAgent: CHROME, attribution: { landing_page: '/', referrer: 'https://www.google.com/', referrer_domain: 'www.google.com' } } };
  assert.equal(describeVisitSource(google), 'google.com');
  const ig = { data: { userAgent: CHROME, attribution: { landing_page: '/', referrer: null, utm_source: 'ig', utm_medium: 'social' } } };
  assert.equal(describeVisitSource(ig), 'ig / social');
});

test('self-referral is not a source: Direct when the tracker recorded attribution', () => {
  const evt = {
    data: {
      userAgent: CHROME,
      attribution: { landing_page: '/news/a', landing_domain: 'tabletennistube.com', referrer: 'https://www.tabletennistube.com/', referrer_domain: 'www.tabletennistube.com' },
    },
  };
  assert.equal(describeVisitSource(evt, [evt]), 'Direct (no referrer)');
  const plain = { data: { userAgent: CHROME, attribution: { landing_page: '/', landing_domain: 'tabletennistube.com', referrer: null, referrer_domain: null } } };
  assert.equal(describeVisitSource(plain), 'Direct (no referrer)');
});

test('older events without landing_page are Not recorded', () => {
  const old = { data: { userAgent: CHROME, attribution: {} } };
  assert.equal(describeVisitSource(old, [old]), 'Not recorded');
  assert.equal(describeVisitSource({ data: {} }), 'Not recorded');
  assert.equal(describeVisitSource(null), '—');
});
