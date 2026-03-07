import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    title: 'SimpleTrack – Analytics for Everyone',
    loadComponent: () => import('./pages/home/home').then(m => m.Home)
  },
  
  {
    path: 'pricing',
    title: 'Pricing | SimpleTrack',
    loadComponent: () => import('./pages/pricing/pricing').then(m => m.Pricing)
  },
  {
    path: 'docs',
    title: 'Documentation | SimpleTrack',
    loadComponent: () => import('./pages/docs/docs').then(m => m.Docs)
  },
  
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard),
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        redirectTo: 'overview',
        pathMatch: 'full'
      },
      {
        path: 'overview',
        title: 'Overview | SimpleTrack',
        loadComponent: () => import('./pages/dashboard/overview/overview').then(m => m.DashboardOverview)
      },
      {
        path: 'api-keys',
        title: 'API Keys | SimpleTrack',
        loadComponent: () => import('./pages/dashboard/api-keys/api-keys').then(m => m.DashboardApiKeys)
      },
      {
        path: 'users',
        title: 'Users | SimpleTrack',
        loadComponent: () => import('./pages/dashboard/users/users').then(m => m.DashboardUsersComponent)
      },
      {
        path: 'reports',
        title: 'Reports | SimpleTrack',
        loadComponent: () => import('./pages/dashboard/reports/reports').then(m => m.DashboardReports)
      },
      {
        path: 'plans',
        title: 'Plans | SimpleTrack',
        loadComponent: () => import('./pages/dashboard/plans/plans').then(m => m.DashboardPlans)
      },
      {
        path: 'billing',
        title: 'Billing | SimpleTrack',
        loadComponent: () => import('./pages/dashboard/billing/billing').then(m => m.DashboardBilling)
      },
      {
        path: 'events',
        title: 'Events | SimpleTrack',
        loadComponent: () => import('./pages/dashboard/events/events').then(m => m.DashboardEvents)
      },
      {
        path: 'settings',
        title: 'Settings | SimpleTrack',
        loadComponent: () => import('./pages/dashboard/settings/settings').then(m => m.DashboardSettings)
      }
    ]
  },
  {
    path: 'contact',
    title: 'Contact | SimpleTrack',
    loadComponent: () => import('./pages/contact/contact').then(m => m.Contact)
  },
  {
    path: 'reset-password/:token',
    title: 'Reset Password | SimpleTrack',
    loadComponent: () => import('./pages/reset-password/reset-password').then(m => m.ResetPassword)
  }
];