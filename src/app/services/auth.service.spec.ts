import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import {
  ACTIVITY_TOUCH_THROTTLE_MS,
  AuthService,
  decodeJwtExpiryMs,
  IDLE_TIMEOUT_MS,
  isJwtExpired,
} from './auth.service';

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${body}.sig`;
}

describe('auth session helpers', () => {
  it('decodes JWT exp in milliseconds', () => {
    const expSec = 1_700_000_000;
    expect(decodeJwtExpiryMs(makeJwt({ exp: expSec }))).toBe(expSec * 1000);
  });

  it('treats tokens without exp as not expired', () => {
    expect(isJwtExpired(makeJwt({ sub: 'user-1' }))).toBe(false);
  });

  it('detects an expired JWT', () => {
    expect(isJwtExpired(makeJwt({ exp: 1 }), 2_000)).toBe(true);
    expect(isJwtExpired(makeJwt({ exp: 10 }), 2_000)).toBe(false);
  });
});

describe('AuthService idle timeout', () => {
  let service: AuthService;
  const user = {
    _id: 'u1',
    firstname: 'Ada',
    lastname: 'Lovelace',
    email: 'ada@example.com',
    mobileno: '0',
    createdDate: '2026-01-01',
    token: makeJwt({ sub: 'u1' }),
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      ],
    });
    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    service.signout(false);
    localStorage.clear();
  });

  function seedSession(expiresAt: number, token = user.token) {
    localStorage.setItem('authToken', token);
    localStorage.setItem('userData', JSON.stringify({ user, expiresAt, lastActivityAt: expiresAt - IDLE_TIMEOUT_MS }));
  }

  it('keeps a session valid before the idle window ends', () => {
    seedSession(Date.now() + 60_000);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.getUserData()?.email).toBe('ada@example.com');
  });

  it('expires the session after 24h of inactivity', () => {
    seedSession(Date.now() - 1);
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('authToken')).toBeNull();
  });

  it('does not revive an already-expired session on activity', () => {
    seedSession(Date.now() - 1);
    service.touchSession();
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('authToken')).toBeNull();
  });

  it('slides expiresAt forward on activity', () => {
    const originalExpiry = Date.now() + 2 * 60 * 60 * 1000;
    seedSession(originalExpiry);
    service.touchSession();
    const stored = JSON.parse(localStorage.getItem('userData') || '{}');
    expect(stored.expiresAt).toBeGreaterThan(originalExpiry);
    expect(stored.expiresAt).toBeGreaterThanOrEqual(Date.now() + IDLE_TIMEOUT_MS - 50);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('throttles activity writes', () => {
    seedSession(Date.now() + 2 * 60 * 60 * 1000);
    service.touchSession();
    const first = JSON.parse(localStorage.getItem('userData') || '{}').expiresAt;
    service.touchSession();
    const second = JSON.parse(localStorage.getItem('userData') || '{}').expiresAt;
    expect(second).toBe(first);
    expect(ACTIVITY_TOUCH_THROTTLE_MS).toBe(60 * 1000);
  });

  it('expires when the JWT exp claim is in the past even if idle window remains', () => {
    const expiredJwt = makeJwt({ exp: Math.floor(Date.now() / 1000) - 10 });
    seedSession(Date.now() + IDLE_TIMEOUT_MS, expiredJwt);
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('authToken')).toBeNull();
  });
});
