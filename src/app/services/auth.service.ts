import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, Subject, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface SignupRequest {
  firstname: string;
  lastname: string;
  email: string;
  mobileno: string;
  password: string;
}

export interface SigninRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  status: number;
  message: string;
  user: {
    _id: string;
    firstname: string;
    lastname: string;
    email: string;
    mobileno: string;
    plan?: 'free' | 'starter' | 'pro' | 'enterprise';
    role?: 'owner' | 'admin' | 'developer' | 'analyst' | 'viewer';
    createdDate: string;
    token: string;
  };
}

export interface ApiError {
  message: string;
  status: number;
}

/** Log out after this much idle time. Activity slides the window forward. */
export const IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
/** Don't rewrite localStorage on every mousemove. */
export const ACTIVITY_TOUCH_THROTTLE_MS = 60 * 1000;

export function decodeJwtExpiryMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (base64.length % 4)) % 4;
    if (pad) base64 += '='.repeat(pad);
    const payload = JSON.parse(atob(base64));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string, now = Date.now()): boolean {
  const exp = decodeJwtExpiryMs(token);
  return exp !== null && now >= exp;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private activityListenerAttached = false;
  private lastTouchAt = 0;
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly onUserActivity = () => this.touchSession();

  readonly openSignUp$ = new Subject<void>();
  requestOpenSignUp() { this.openSignUp$.next(); }

  readonly openSignIn$ = new Subject<void>();
  requestOpenSignIn() { this.openSignIn$.next(); }

  readonly signUpDismissed$ = new Subject<void>();
  notifySignUpDismissed() { this.signUpDismissed$.next(); }

  /** Emits whenever user data (e.g. plan) is updated in localStorage */
  readonly userUpdated$ = new Subject<any>();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    if (typeof window !== 'undefined' && localStorage.getItem('authToken')) {
      this.watchActivity();
    }
  }

  /**
   * Sign up a new user
   */
  signup(userData: SignupRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/users/signup`, userData).pipe(
      tap(response => {
        console.log('Signup response:', response);
        if (response && response.user && response.user.token) {
          this.persistSession(response.user, response.user.token);
          localStorage.setItem('pulz_has_account', '1'); // never show sign-up exit intent again
          localStorage.removeItem('currentUser');
          localStorage.removeItem('userEmail');
          this.applyOwnerTracking(response.user.role);
        } else {
          console.warn('Signup response missing user.token:', response);
        }
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Sign in an existing user
   */
  signin(credentials: SigninRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/users/signin`, credentials).pipe(
      tap(response => {
        console.log('Signin response:', response);
        if (response && response.user && response.user.token) {
          this.persistSession(response.user, response.user.token);
          localStorage.setItem('pulz_has_account', '1'); // never show sign-up exit intent again
          localStorage.removeItem('currentUser');
          localStorage.removeItem('userEmail');
          this.applyOwnerTracking(response.user.role);
        } else {
          console.warn('Signin response missing user.token:', response);
        }
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Sign out the current user
   */
  signout(redirect: boolean = true): void {
    this.stopIdleWatch();
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('user_api_keys');
    localStorage.removeItem('apiKeyTracking');
    localStorage.removeItem('rememberedEmail');
    localStorage.removeItem('token');
    // Clear legacy keys from old auth system
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userEmail');
    // NOTE: pulz_is_owner is intentionally NOT cleared here.
    // It is a browser-level "do not track this device" flag.
    // Only PulzivoAnalytics.enableTracking() should remove it.

    // Redirect to home page after logout (unless explicitly prevented)
    if (redirect) {
      this.router.navigate(['']);
    }
  }

  /**
   * Tells the analytics SDK whether the current browser user is the site owner.
   * Only activates (sets pulz_is_owner) when role is 'owner' — never clears it.
   * Clearing is done exclusively via PulzivoAnalytics.enableTracking() in the browser.
   */
  applyOwnerTracking(role: string | undefined): void {
    if (role !== 'owner') {
      console.log('🔍 [OwnerMode] Role is not owner:', role);
      return;
    }
    
    console.log('🛡️ [OwnerMode] Activating owner mode...');
    const win = window as any;
    
    // Method 1: Via SDK (preferred)
    if (win.PulzivoAnalytics?.setOwner) {
      // persist=true writes pulz_is_owner to localStorage so it survives page refreshes
      win.PulzivoAnalytics.setOwner(true, true);
      console.log('✅ [OwnerMode] SDK setOwner() called');
    } else {
      console.warn('⚠️ [OwnerMode] PulzivoAnalytics SDK not loaded yet');
    }
    
    // Method 2: Direct localStorage (fallback/verification)
    try {
      localStorage.setItem('pulz_is_owner', 'true');
      console.log('✅ [OwnerMode] localStorage flag set');
    } catch (e) {
      console.error('❌ [OwnerMode] Failed to set localStorage:', e);
    }
    
    // Verify it worked
    setTimeout(() => {
      const isSet = localStorage.getItem('pulz_is_owner') === 'true';
      const hasSDK = !!win.PulzivoAnalytics;
      console.log('🔍 [OwnerMode] Verification:');
      console.log('  - localStorage flag:', isSet ? '✅ true' : '❌ false');
      console.log('  - SDK loaded:', hasSDK ? '✅ yes' : '❌ no');
      console.log('  - Tracking suppressed:', isSet && hasSDK ? '✅ yes' : '❌ no');
      
      if (!isSet || !hasSDK) {
        console.error('❌ [OwnerMode] FAILED TO ACTIVATE! Your activity may be tracked.');
      }
    }, 500);
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('userData');

    if (!token || !userData) {
      return false;
    }

    try {
      const parsed = JSON.parse(userData);
      if (this.sessionHasExpired(parsed.expiresAt, token)) {
        this.signout(false);
        return false;
      }
      return true;
    } catch (error) {
      console.error('isAuthenticated: Error parsing user data:', error);
      this.signout(false); // Clear corrupted data without redirect
      return false;
    }
  }

  /**
   * Get stored user data
   */
  getUserData(): any {
    const userData = localStorage.getItem('userData');

    if (!userData) {
      return null;
    }

    try {
      const parsed = JSON.parse(userData);

      const token = localStorage.getItem('authToken');
      if (this.sessionHasExpired(parsed.expiresAt, token)) {
        this.signout(false);
        return null;
      }

      return parsed.user;
    } catch (error) {
      this.signout(false); // Clear corrupted data without redirect
      return null;
    }
  }

  /**
   * Update stored user data
   */
  updateUserData(userData: any): void {
    try {
      const storedData = localStorage.getItem('userData');
      if (storedData) {
        const parsed = JSON.parse(storedData);
        parsed.user = { ...parsed.user, ...userData };
        localStorage.setItem('userData', JSON.stringify(parsed));
        this.userUpdated$.next(parsed.user);
      }
    } catch (error) {
      console.error('Error updating user data:', error);
    }
  }

  /**
   * Get stored auth token
   */
  getToken(): string | null {
    return localStorage.getItem('authToken');
  }

  /**
   * Sliding idle timeout: keep the session alive while the user is using the app.
   * Expires only after IDLE_TIMEOUT_MS with no activity. Does not revive an
   * already-expired session. Background API polls do not count as activity.
   */
  touchSession(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }

    const token = localStorage.getItem('authToken');
    const raw = localStorage.getItem('userData');
    if (!token || !raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (this.sessionHasExpired(parsed.expiresAt, token)) return;

      const now = Date.now();
      if (now - this.lastTouchAt < ACTIVITY_TOUCH_THROTTLE_MS) return;
      this.lastTouchAt = now;

      parsed.lastActivityAt = now;
      parsed.expiresAt = now + IDLE_TIMEOUT_MS;
      localStorage.setItem('userData', JSON.stringify(parsed));
    } catch {
      // Ignore malformed session payloads; isAuthenticated() will clean up.
    }
  }

  /** Attach activity listeners + idle check. Safe to call more than once. */
  watchActivity(): void {
    if (typeof window === 'undefined') return;
    this.attachActivityListeners();
    this.startIdleCheck();
    this.touchSession();
  }

  private persistSession(user: AuthResponse['user'], token: string): void {
    const now = Date.now();
    localStorage.setItem('authToken', token);
    localStorage.setItem('userData', JSON.stringify({
      user,
      expiresAt: now + IDLE_TIMEOUT_MS,
      lastActivityAt: now
    }));
    this.lastTouchAt = now;
    this.watchActivity();
  }

  private sessionHasExpired(expiresAt: unknown, token: string | null): boolean {
    if (token && isJwtExpired(token)) return true;
    return typeof expiresAt === 'number' && Date.now() > expiresAt;
  }

  private attachActivityListeners(): void {
    if (this.activityListenerAttached || typeof window === 'undefined') return;
    this.activityListenerAttached = true;
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener('click', this.onUserActivity, opts);
    window.addEventListener('keydown', this.onUserActivity, opts);
    window.addEventListener('mousemove', this.onUserActivity, opts);
    window.addEventListener('scroll', this.onUserActivity, opts);
    window.addEventListener('touchstart', this.onUserActivity, opts);
    document.addEventListener('visibilitychange', this.onUserActivity);
  }

  private startIdleCheck(): void {
    if (this.idleCheckTimer || typeof window === 'undefined') return;
    this.idleCheckTimer = setInterval(() => this.enforceIdleTimeout(), 60 * 1000);
  }

  private enforceIdleTimeout(): void {
    if (!localStorage.getItem('authToken')) return;
    if (!this.isAuthenticated()) {
      this.signout(true);
    }
  }

  private stopIdleWatch(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
    if (this.activityListenerAttached && typeof window !== 'undefined') {
      window.removeEventListener('click', this.onUserActivity);
      window.removeEventListener('keydown', this.onUserActivity);
      window.removeEventListener('mousemove', this.onUserActivity);
      window.removeEventListener('scroll', this.onUserActivity);
      window.removeEventListener('touchstart', this.onUserActivity);
      document.removeEventListener('visibilitychange', this.onUserActivity);
      this.activityListenerAttached = false;
    }
    this.lastTouchAt = 0;
  }

  /**
   * Request password reset email
   */
  forgotPassword(email: string): Observable<{ status: number; message: string }> {
    return this.http.post<{ status: number; message: string }>(
      `${this.apiUrl}/users/forgot-password`,
      { email }
    ).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Reset password using token
   */
  resetPasswordWithToken(token: string, password: string): Observable<{ status: number; message: string }> {
    return this.http.post<{ status: number; message: string }>(
      `${this.apiUrl}/users/reset-password/${token}`,
      { password }
    ).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Handle HTTP errors
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unknown error occurred';

    if (error.error instanceof ErrorEvent) {
      // Client-side or network error
      errorMessage = error.error.message;
    } else {
      // Backend returned an unsuccessful response code
      if (error.error && typeof error.error === 'object' && error.error.message) {
        errorMessage = error.error.message;
      } else if (error.error && typeof error.error === 'string') {
        errorMessage = error.error;
      } else {
        errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
      }
    }

    console.error('Auth API Error:', errorMessage);
    return throwError(() => ({ message: errorMessage, status: error.status }));
  }
}