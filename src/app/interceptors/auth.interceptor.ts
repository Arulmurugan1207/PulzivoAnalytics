import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  // Get token from localStorage
  const token = localStorage.getItem('authToken');

  // Clone the request and add the authorization header if token exists
  let authReq = req;
  if (token) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  // Handle the request
  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        const url = error.url || authReq.url;
        if (url.includes('/analytics/')) {
          console.warn(
            `Analytics request returned 401 for ${url}. Metric reads use the selected API key, not the login token.`
          );
        } else {
          console.warn('Authentication failed - token invalid or expired');
        }
      } else if (error.status === 403) {
        console.warn('Access forbidden - insufficient permissions');
      } else if (error.status >= 500) {
        console.error('Server error:', error.message);
      }

      return throwError(() => error);
    })
  );
};
