import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router, UrlTree, convertToParamMap, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthGuard, guestGuard } from './auth.guard';

function jwt(p: object) {
  const b = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b({ alg: 'HS256' })}.${b(p)}.sig`;
}
function login() {
  const now = Math.floor(Date.now() / 1000);
  localStorage.setItem('authToken', jwt({ iat: now, exp: now + 365 * 86400 }));
  localStorage.setItem('userData', JSON.stringify({ user: { _id: '1' } }));
}
const route = (q: Record<string, string> = {}, data: any = {}) =>
  ({ queryParamMap: convertToParamMap(q), data } as unknown as ActivatedRouteSnapshot);
const run = (r: ActivatedRouteSnapshot) =>
  TestBed.runInInjectionContext(() => guestGuard(r, {} as RouterStateSnapshot));

describe('guestGuard (/login, /signup)', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  });
  afterEach(() => localStorage.clear());

  it('redirects a signed-in user to /dashboard', () => {
    login();
    const r = run(route()) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(r)).toBe('/dashboard');
  });

  it('honours a safe returnUrl', () => {
    login();
    const r = run(route({ returnUrl: '/dashboard/billing' })) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(r)).toBe('/dashboard/billing');
    const evil = run(route({ returnUrl: '//evil.com' })) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(evil)).toBe('/dashboard');
  });

  it('lets a signed-out user through to the sign-in modal', () => {
    expect(run(route({}, { authModal: 'signin' }))).toBe(true);
  });
});

describe('AuthGuard (/dashboard)', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  });

  it('sends signed-out users to /login with returnUrl', () => {
    const g = TestBed.inject(AuthGuard);
    const r = g.canActivate({} as ActivatedRouteSnapshot, { url: '/dashboard/events' } as RouterStateSnapshot) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(r)).toBe('/login?returnUrl=%2Fdashboard%2Fevents');
  });

  it('allows signed-in users', () => {
    login();
    expect(TestBed.inject(AuthGuard).canActivate()).toBe(true);
  });
});
