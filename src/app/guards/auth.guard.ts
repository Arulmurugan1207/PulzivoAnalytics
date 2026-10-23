import { Injectable, inject } from '@angular/core';
import {
  ActivatedRouteSnapshot, CanActivate, CanActivateFn, Router, RouterStateSnapshot, UrlTree,
} from '@angular/router';
import { AuthService } from '../services/auth.service';
import { safeReturnUrl } from '../auth/session.logic';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(_route?: ActivatedRouteSnapshot, state?: RouterStateSnapshot): boolean | UrlTree {
    if (this.authService.isAuthenticated()) {
      return true;
    }
    // Not signed in: go to /login (opens the sign-in modal) and come back afterwards.
    const returnUrl = state?.url && state.url !== '/' ? state.url : undefined;
    return this.router.createUrlTree(['/login'], returnUrl ? { queryParams: { returnUrl } } : {});
  }
}

/**
 * Guest-only routes (/login, /signin, /signup, /register): a signed-in user is sent
 * straight to /dashboard (or a safe returnUrl). Otherwise the page renders and the
 * matching auth modal opens.
 */
export const guestGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) {
    return router.parseUrl(safeReturnUrl(route.queryParamMap.get('returnUrl')));
  }
  const mode = route.data?.['authModal'] === 'signup' ? 'signup' : 'signin';
  auth.pendingAuthModal = mode;
  if (mode === 'signup') auth.requestOpenSignUp(); else auth.requestOpenSignIn();
  return true;
};
