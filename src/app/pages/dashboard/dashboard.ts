import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterOutlet, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MenuItem } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { RippleModule } from 'primeng/ripple';
import { BehaviorSubject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { DemoService } from '../../services/demo.service';
import { DateRange } from '../../services/analytics-data.service';

// App owner email
const APP_OWNER_EMAIL = 'arul007rajmathy@gmail.com';

type UserRole = 'owner' | 'admin' | 'developer' | 'analyst' | 'viewer';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MenuModule,
    ButtonModule,
    AvatarModule,
    RippleModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  user: any = null;
  userRole: UserRole = 'viewer';
  userPlan: 'free' | 'pro' | 'enterprise' = 'free';
  sidebarCollapsed = false;
  currentRoute = '';
  userDropdownOpen = false;

  readonly lockedNavItems = [
    { label: 'API Keys',  icon: 'pi-key' },
    { label: 'Reports',  icon: 'pi-chart-bar' },
    { label: 'Users',    icon: 'pi-users' },
    { label: 'Plans',    icon: 'pi-credit-card' },
    { label: 'Settings', icon: 'pi-cog' },
  ];

  private dateRangeSubject = new BehaviorSubject<DateRange | null>(null);
  dateRange$ = this.dateRangeSubject.asObservable();

  sidebarItems: MenuItem[] = [];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    public demoService: DemoService
  ) {}

  ngOnInit() {
    if (this.demoService.isDemoMode()) {
      this.user = { firstname: 'Demo', lastname: 'User' };
      this.userRole = 'admin';
      this.userPlan = 'pro';
      this.buildSidebarItems();
      return;
    }

    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/']);
      return;
    }

    this.user = this.authService.getUserData();
    
    // Determine user role
    if (this.user?.email === APP_OWNER_EMAIL) {
      this.userRole = 'owner';
    } else if (this.user?.role) {
      this.userRole = this.user.role;
    } else {
      this.userRole = 'viewer';
    }

    // Determine plan (owner always gets enterprise)
    if (this.user?.email === APP_OWNER_EMAIL || this.userRole === 'owner') {
      this.userPlan = 'enterprise';
    } else {
      this.userPlan = (this.user?.plan as any) || 'free';
    }

    // Track current route
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.currentRoute = this.router.url;
    });

    // Refresh plan when billing updates it (e.g. after Stripe upgrade)
    this.authService.userUpdated$.subscribe(updatedUser => {
      this.user = updatedUser;
      this.userPlan = (updatedUser?.plan as any) || 'free';
    });

    // Default date range: last 7 days
    this.dateRangeSubject.next({
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate: new Date()
    });

    this.buildSidebarItems();
  }

  private buildSidebarItems() {
    const analyticsItems: MenuItem[] = [
      { label: 'Overview', icon: 'pi pi-home', command: () => this.navigateToTab('overview') },
    ];

    // API Keys - All roles can access
    analyticsItems.push({ label: 'API Keys', icon: 'pi pi-key', command: () => this.navigateToTab('api-keys') });

    // Users Management - Only owner, admin
    if (this.canAccessUsers()) {
      analyticsItems.push({ label: 'Users', icon: 'pi pi-users', command: () => this.navigateToTab('users') });
    }

    // Reports - All except viewer
    if (this.canAccessReports()) {
      analyticsItems.push({ label: 'Reports', icon: 'pi pi-chart-bar', command: () => this.navigateToTab('reports') });
    }

    // Events - All except viewer
    if (this.canAccessReports()) {
      analyticsItems.push({ label: 'Events', icon: 'pi pi-bolt', command: () => this.navigateToTab('events') });
    }

    // Funnels - All except viewer
    if (this.canAccessReports()) {
      analyticsItems.push({ label: 'Funnels', icon: 'pi pi-filter', command: () => this.navigateToTab('funnels') });
    }

    const accountItems: MenuItem[] = [];

    // Plans - Owner and admin only
    if (this.canAccessPlans()) {
      accountItems.push({ label: 'Plans', icon: 'pi pi-credit-card', command: () => this.navigateToTab('plans') });
    }

    // Billing - Owner, admin, and analyst
    if (this.canAccessBilling()) {
      accountItems.push({ label: 'Billing', icon: 'pi pi-receipt', command: () => this.navigateToTab('billing') });
    }

    // Settings - All roles
    accountItems.push({ label: 'Settings', icon: 'pi pi-cog', command: () => this.navigateToTab('settings') });

    this.sidebarItems = [
      {
        label: 'Analytics',
        items: analyticsItems
      },
      {
        label: 'Account',
        items: accountItems
      },
      // {
      //   label: 'Support',
      //   items: [
      //     { label: 'Help', icon: 'pi pi-question-circle', command: () => this.navigateToTab('help') },
      //   ]
      // }
    ];
  }

  canAccessUsers(): boolean {
    return this.userRole === 'owner' || this.userRole === 'admin';
  }

  canAccessReports(): boolean {
    return this.userRole !== 'viewer' || this.isPlanAtLeast('pro');
  }

  canAccessFunnels(): boolean {
    return this.isPlanAtLeast('enterprise');
  }

  toggleUserDropdown(event: Event): void {
    event.stopPropagation();
    this.userDropdownOpen = !this.userDropdownOpen;
  }

  @HostListener('document:click')
  closeUserDropdown(): void {
    this.userDropdownOpen = false;
  }

  signOut(): void {
    this.authService.signout();
  }

  canAccessPlans(): boolean {
    return this.userRole === 'owner' || this.userRole === 'admin';
  }

  canAccessBilling(): boolean {
    return true; // All users can access billing to view plan and upgrade
  }

  isPlanAtLeast(plan: 'free' | 'starter' | 'pro' | 'enterprise'): boolean {
    const order: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };
    return (order[this.userPlan] ?? 0) >= (order[plan] ?? 0);
  }

  navigateToTab(tab: string) {
    this.router.navigate(['/dashboard', tab]);
  }

  goHome() {
    this.router.navigate(['/']);
  }

  get userInitials(): string {
    if (!this.user) return '';
    return `${this.user.firstname?.[0] || ''}${this.user.lastname?.[0] || ''}`.toUpperCase();
  }

  get userName(): string {
    if (!this.user) return '';
    return `${this.user.firstname} ${this.user.lastname}`;
  }

  getTabTitle(): string {
    const urlSegments = this.router.url.split('/');
    const currentTab = urlSegments[urlSegments.length - 1];
    
    switch (currentTab) {
      case 'overview': return 'Overview';
      case 'api-keys': return 'API Keys';
      case 'users': return 'Users Management';
      case 'reports': return 'Reports';
      case 'events': return 'Events & Interactions';
      case 'funnels': return 'Funnel Analysis';
      case 'plans': return 'Plans & Billing';
      case 'billing': return 'Billing & Usage';
      case 'settings': return 'Account Settings';
      default: return 'Dashboard';
    }
  }

  getTodayInfo(): string {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  logout() {
    this.authService.signout();
    this.router.navigate(['/']);
  }

  signUpFromDemo() {
    this.authService.requestOpenSignUp();
    this.router.navigate(['/']);
  }
}
