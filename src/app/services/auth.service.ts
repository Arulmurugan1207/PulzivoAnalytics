import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
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
    plan?: 'free' | 'pro' | 'enterprise';
    role?: 'owner' | 'admin' | 'developer' | 'analyst' | 'viewer';
    createdDate: string;
    token: string;
  };
}

export interface ApiError {
  message: string;
  status: number;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private router: Router
  ) { }

  /**
   * Sign up a new user
   */
  signup(userData: SignupRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/users/signup`, userData).pipe(
      tap(response => {
        console.log('Signup response:', response);
        // Store the JWT token and user data with expiration
        if (response && response.user && response.user.token) {
          const expirationTime = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now
          localStorage.setItem('authToken', response.user.token);
          localStorage.setItem('userData', JSON.stringify({
            user: response.user,
            expiresAt: expirationTime
          }));
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
        // Store the JWT token and user data with expiration
        if (response && response.user && response.user.token) {
          const expirationTime = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now
          localStorage.setItem('authToken', response.user.token);
          localStorage.setItem('userData', JSON.stringify({
            user: response.user,
            expiresAt: expirationTime
          }));
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
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('user_api_keys');
    localStorage.removeItem('apiKeyTracking');
    localStorage.removeItem('rememberedEmail');
    localStorage.removeItem('token');

    // Re-enable tracking when logging out (next visitor won't be suppressed)
    this.applyOwnerTracking(undefined);

    // Redirect to home page after logout (unless explicitly prevented)
    if (redirect) {
      this.router.navigate(['']);
    }
  }

  /**
   * Tells the analytics SDK whether the current browser user is the site owner.
   * When role === 'owner', all event tracking is silently suppressed for this session.
   */
  applyOwnerTracking(role: string | undefined): void {
    const win = window as any;
    if (win.STKAnalytics?.setOwner) {
      win.STKAnalytics.setOwner(role === 'owner');
    }
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
      // Check if data has expired
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        console.log('isAuthenticated: Token expired, clearing data...');
        this.signout(false); // Clear expired data without redirect
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

      // Check if data has expired
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        this.signout(false); // Clear expired data without redirect
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