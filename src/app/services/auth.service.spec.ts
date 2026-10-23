import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService, decodeJwtExpiryMs, isJwtExpired } from './auth.service';

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

describe('AuthService persistent session', () => {
  let service: AuthService;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: Router, useValue: { navigate: () => {} } }],
    });
    service = TestBed.inject(AuthService);
  });
  afterEach(() => localStorage.clear());

  it('stays authenticated with a long-lived token regardless of idle time', () => {
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem('authToken', makeJwt({ iat: now, exp: now + 365 * 86400 }));
    localStorage.setItem('userData', JSON.stringify({ user: { _id: '1' }, expiresAt: 1 }));
    expect(service.isAuthenticated()).toBe(true);
  });

  it('signs out when the JWT has expired', () => {
    localStorage.setItem('authToken', makeJwt({ exp: 1 }));
    localStorage.setItem('userData', JSON.stringify({ user: { _id: '1' } }));
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('authToken')).toBeNull();
  });

  it('signout clears the token', () => {
    localStorage.setItem('authToken', 'x');
    service.signout(false);
    expect(localStorage.getItem('authToken')).toBeNull();
  });
});
