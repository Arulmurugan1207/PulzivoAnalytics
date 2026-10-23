import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasValidToken, shouldRefreshToken, isInvalidTokenError, safeReturnUrl,
  clearStoredSession, isJwtExpired, decodeJwtExpiryMs,
} from './session.logic.ts';

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (p: object) => `${b64({ alg: 'HS256' })}.${b64(p)}.sig`;
const NOW = 1_800_000_000_000;
const s = (ms: number) => Math.floor(ms / 1000);
const DAY = 86_400_000;

test('decodes exp / detects expiry', () => {
  assert.equal(decodeJwtExpiryMs(jwt({ exp: 10 })), 10_000);
  assert.equal(isJwtExpired(jwt({ exp: 1 }), 2_000), true);
  assert.equal(isJwtExpired(jwt({ sub: 'x' })), false);
});

test('valid token check', () => {
  assert.equal(hasValidToken(null, NOW), false);
  assert.equal(hasValidToken('garbage', NOW), false);
  assert.equal(hasValidToken(jwt({ iat: s(NOW), exp: s(NOW + 365 * DAY) }), NOW), true);
  assert.equal(hasValidToken(jwt({ iat: s(NOW - 2 * DAY), exp: s(NOW - DAY) }), NOW), false);
});

test('sliding refresh: fresh 1y token not refreshed, day-old or legacy 24h token refreshed', () => {
  assert.equal(shouldRefreshToken(jwt({ iat: s(NOW - 60_000), exp: s(NOW + 365 * DAY) }), NOW), false);
  assert.equal(shouldRefreshToken(jwt({ iat: s(NOW - 2 * DAY), exp: s(NOW + 363 * DAY) }), NOW), true);
  assert.equal(shouldRefreshToken(jwt({ iat: s(NOW - 60_000), exp: s(NOW + DAY) }), NOW), true);
  assert.equal(shouldRefreshToken(jwt({ iat: s(NOW - 2 * DAY), exp: s(NOW - DAY) }), NOW), false);
});

test('only a real TOKEN_INVALID 401 logs out', () => {
  const api = 'https://api/users/123/usage';
  assert.equal(isInvalidTokenError(401, { code: 'TOKEN_INVALID' }, api, true), true);
  assert.equal(isInvalidTokenError(401, { code: 'TOKEN_INVALID' }, api, false), false);
  assert.equal(isInvalidTokenError(401, { message: 'API key required' }, 'https://api/analytics/x', true), false);
  assert.equal(isInvalidTokenError(401, { code: 'TOKEN_INVALID' }, 'https://api/users/signin', true), false);
  for (const st of [0, 403, 429, 500, 502, 503]) assert.equal(isInvalidTokenError(st, { code: 'TOKEN_INVALID' }, api, true), false);
  assert.equal(isInvalidTokenError(401, null, api, true), false);
});

test('safeReturnUrl', () => {
  assert.equal(safeReturnUrl(undefined), '/dashboard');
  assert.equal(safeReturnUrl('/dashboard/billing?x=1'), '/dashboard/billing?x=1');
  assert.equal(safeReturnUrl('//evil.com'), '/dashboard');
  assert.equal(safeReturnUrl('https://evil.com'), '/dashboard');
  assert.equal(safeReturnUrl('/login'), '/dashboard');
});

test('clearStoredSession removes the token', () => {
  const removed: string[] = [];
  clearStoredSession({ removeItem: (k: string) => { removed.push(k); } });
  assert.ok(removed.includes('authToken') && removed.includes('userData'));
});
