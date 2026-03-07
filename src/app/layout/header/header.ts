import { Component, ViewChild, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MenubarModule } from 'primeng/menubar';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { Menu, MenuModule } from 'primeng/menu';
import type { MenuItem } from 'primeng/api';

import { SignIn } from "../../components/modals/sign-in/sign-in";
import { SignUp } from "../../components/modals/sign-up/sign-up";
import { Success } from "../../components/modals/success/success";
import { ForgotPassword } from "../../components/modals/forgot-password/forgot-password";
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterModule, MenubarModule, ButtonModule, AvatarModule, MenuModule, SignIn, SignUp, Success, ForgotPassword],
  templateUrl: './header.html',
  styleUrls: ['./header.scss'],
})
export class Header implements OnInit {
  @ViewChild(SignIn) signInModal!: SignIn;
  @ViewChild(SignUp) signUpModal!: SignUp;
  @ViewChild(Success) successModal!: Success;
  @ViewChild(ForgotPassword) forgotPasswordModal!: ForgotPassword;
  @ViewChild('userMenu') userMenu!: Menu;
  
  isLoggedIn = false;
  userName = '';
  userInitials = '';
  
  constructor(private authService: AuthService) {}

  ngOnInit() {
    // Check if user is already logged in on component load
    this.checkAuthenticationStatus();
  }

  private checkAuthenticationStatus() {
    if (this.authService.isAuthenticated()) {
      const userData = this.authService.getUserData();
      if (userData) {
        this.setLoggedInUser(`${userData.firstname} ${userData.lastname}`);
      }
    }
  }
  
  items: MenuItem[] = [
    { label: 'Home', routerLink: '/', routerLinkActiveOptions: { exact: true } },
    { label: 'Pricing', routerLink: '/pricing' },
    { label: 'Docs', routerLink: '/docs' },
    { label: 'Contact', routerLink: '/contact' }
  ];

  userMenuItems: MenuItem[] = [
    { 
      label: 'Dashboard', 
      icon: 'pi pi-th-large',
      routerLink: '/dashboard'
    },
    { 
      label: 'Account', 
      icon: 'pi pi-user',
      routerLink: '/account'
    },
    { 
      separator: true 
    },
    { 
      label: 'Logout', 
      icon: 'pi pi-sign-out',
      command: () => this.logout()
    }
  ];

  openSignIn() {
    this.signInModal.show();
  }

  openSignUp() {
    this.signUpModal.show();
  }

  onSwitchToSignUp() {
    this.signInModal.hide();
    this.signUpModal.show();
  }

  onSwitchToSignIn() {
    this.signUpModal.hide();
    this.signInModal.show();
  }

  onSwitchToForgotPassword() {
    this.signInModal.hide();
    this.forgotPasswordModal.show();
  }

  onBackToSignIn() {
    this.forgotPasswordModal.hide();
    this.signInModal.show();
  }

  onSignInSuccess(user: any) {
    this.signInModal.hide();
    // Set user data from auth service
    this.setLoggedInUser(`${user.firstname} ${user.lastname}`);
    this.successModal.show('Welcome Back!', 'You have successfully signed in.');
  }

  onSignUpSuccess() {
    this.signUpModal.hide();
    // Simulate getting user data - in real app, get from auth service
    this.setLoggedInUser('John Doe');
    this.successModal.show('Account Created!', 'Your account has been created successfully.');
  }

  setLoggedInUser(name: string) {
    this.isLoggedIn = true;
    this.userName = name;
    this.userInitials = name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  logout() {
    this.authService.signout();
    this.isLoggedIn = false;
    this.userName = '';
    this.userInitials = '';
  }

  toggleUserMenu(event: Event) {
    if (this.userMenu) {
      this.userMenu.toggle(event);
    }
  }

  trackLogoClick() {
    const win = window as any;
    if (win.STKAnalytics?.trackEvent) {
      win.STKAnalytics.trackEvent('logo_click', {
        utm_source: 'header',
        utm_medium: 'navigation',
        utm_campaign: 'logo',
        utm_content: 'top_nav',
        page: window.location.pathname
      });
    }
  }
}
