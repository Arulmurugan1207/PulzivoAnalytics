import { Component, OnInit, OnDestroy, ViewChild, HostListener, signal } from '@angular/core';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { AvatarModule } from 'primeng/avatar';
import { Menu, MenuModule } from 'primeng/menu';
import type { MenuItem } from 'primeng/api';

import { SignIn } from '../../components/modals/sign-in/sign-in';
import { SignUp } from '../../components/modals/sign-up/sign-up';
import { Success } from '../../components/modals/success/success';
import { ForgotPassword } from '../../components/modals/forgot-password/forgot-password';
import { AuthService } from '../../services/auth.service';

interface NavItem {
  label: string;
  path: string;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterModule, CommonModule, AvatarModule, MenuModule, SignIn, SignUp, Success, ForgotPassword],
  templateUrl: './header.html',
  styleUrls: ['./header.scss'],
})
export class Header implements OnInit, OnDestroy {
  @ViewChild(SignIn) signInModal!: SignIn;
  @ViewChild(SignUp) signUpModal!: SignUp;
  @ViewChild(Success) successModal!: Success;
  @ViewChild(ForgotPassword) forgotPasswordModal!: ForgotPassword;
  @ViewChild('userMenu') userMenu!: Menu;

  mobileMenuOpen = signal(false);
  isLoggedIn = false;
  userName = '';
  userInitials = '';
  currentPath = '/';
  private routerSub!: Subscription;
  private destroy$ = new Subject<void>();
  private signUpCompleted = false;

  readonly navItems: NavItem[] = [
    { label: 'Home', path: '/' },
    { label: 'Why Pulzivo', path: '/why-pulzivo' },
    { label: 'Pricing', path: '/pricing' },
    { label: 'Docs', path: '/docs' },
    { label: 'Contact', path: '/contact' },
  ];

  userMenuItems: MenuItem[] = [
    { label: 'Dashboard', icon: 'pi pi-th-large', routerLink: '/dashboard' },
    { label: 'Account', icon: 'pi pi-user', routerLink: '/account' },
    { separator: true },
    { label: 'Logout', icon: 'pi pi-sign-out', command: () => this.logout() },
  ];

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit() {
    this.currentPath = this.normalizePath(this.router.url);
    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        this.currentPath = this.normalizePath(e.urlAfterRedirects);
        this.mobileMenuOpen.set(false); // close menu on navigation
      });
    if (this.authService.isAuthenticated()) {
      const userData = this.authService.getUserData();
      if (userData) this.setLoggedInUser(`${userData.firstname} ${userData.lastname}`);
    }
    this.authService.openSignUp$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (!this.isLoggedIn) this.openSignUp();
    });
    this.authService.openSignIn$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (!this.isLoggedIn) this.openSignIn();
    });
  }

  private normalizePath(url: string): string {
    return url.split('?')[0].split('#')[0];
  }

  isActive(path: string): boolean {
    if (path === '/') return this.currentPath === '/';
    return this.currentPath === path || this.currentPath.startsWith(path + '/');
  }

  toggleMobileMenu() {
    this.mobileMenuOpen.update(v => !v);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('app-header')) {
      this.mobileMenuOpen.set(false);
    }
  }

  openSignIn() { this.signInModal.show(); }
  openSignUp() { if (this.isLoggedIn) return; this.signUpCompleted = false; this.signUpModal.show(); }
  onSignUpClosed() { if (!this.signUpCompleted) this.authService.notifySignUpDismissed(); }

  onSwitchToSignUp() { this.signInModal.hide(); this.signUpModal.show(); }
  onSwitchToSignIn() { this.signUpModal.hide(); this.signInModal.show(); }
  onSwitchToForgotPassword() { this.signInModal.hide(); this.forgotPasswordModal.show(); }
  onBackToSignIn() { this.forgotPasswordModal.hide(); this.signInModal.show(); }

  onSignInSuccess(user: any) {
    this.signInModal.hide();
    this.setLoggedInUser(`${user.firstname} ${user.lastname}`);
    this.successModal.show('Welcome Back!', 'You have successfully signed in.');
  }

  onSignUpSuccess(user: any) {
    this.signUpCompleted = true;
    localStorage.setItem('pulz_has_account', '1'); // never show exit-intent modal again
    this.signUpModal.hide();
    const name = user?.firstname ? `${user.firstname} ${user.lastname || ''}`.trim() : 'New User';
    this.setLoggedInUser(name);
    this.successModal.show('Account Created!', 'Your account has been created successfully.');
  }

  setLoggedInUser(name: string) {
    this.isLoggedIn = true;
    this.userName = name;
    this.userInitials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase();
  }

  /**
   * Check if owner mode is active (tracking suppressed)
   */
  isOwnerModeActive(): boolean {
    try {
      return localStorage.getItem('pulz_is_owner') === 'true';
    } catch {
      return false;
    }
  }

  logout() {
    this.authService.signout();
    this.isLoggedIn = false;
    this.userName = '';
    this.userInitials = '';
  }

  toggleUserMenu(event: Event) {
    if (this.userMenu) this.userMenu.toggle(event);
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
