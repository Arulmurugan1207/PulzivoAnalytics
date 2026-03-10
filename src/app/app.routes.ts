import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    title: 'Home',
    loadComponent: () => import('./pages/home/home').then(m => m.Home)
  },
  {
    path: 'pricing',
    title: 'Pricing',
    loadComponent: () => import('./pages/pricing/pricing').then(m => m.Pricing)
  },
  {
    path: 'docs',
    title: 'Documentation',
    loadComponent: () => import('./pages/docs/docs').then(m => m.Docs)
  },
  {
    path: 'features',
    title: 'Features',
    loadComponent: () => import('./pages/features/features').then(m => m.Features)
  },
  {
    path: 'why-pulzivo',
    title: 'Why Pulzivo',
    loadComponent: () => import('./pages/why-pulzivo/why-pulzivo').then(m => m.WhyPulzivo)
  },
  {
    path: 'use-cases',
    title: 'Use Cases',
    loadComponent: () => import('./pages/use-cases/use-cases').then(m => m.UseCases)
  },
  {
    path: 'blog',
    title: 'Blog',
    loadComponent: () => import('./pages/blog/blog').then(m => m.Blog)
  },
  {
    path: 'contact',
    title: 'Contact',
    loadComponent: () => import('./pages/contact/contact').then(m => m.Contact)
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
        title: 'Overview',
        loadComponent: () => import('./pages/dashboard/overview/overview').then(m => m.DashboardOverview)
      },
      {
        path: 'api-keys',
        title: 'API Keys',
        loadComponent: () => import('./pages/dashboard/api-keys/api-keys').then(m => m.DashboardApiKeys)
      },
      {
        path: 'users',
        title: 'Users',
        loadComponent: () => import('./pages/dashboard/users/users').then(m => m.DashboardUsersComponent)
      },
      {
        path: 'reports',
        title: 'Reports',
        loadComponent: () => import('./pages/dashboard/reports/reports').then(m => m.DashboardReports)
      },
      {
        path: 'plans',
        title: 'Plans',
        loadComponent: () => import('./pages/dashboard/plans/plans').then(m => m.DashboardPlans)
      },
      {
        path: 'billing',
        title: 'Billing',
        loadComponent: () => import('./pages/dashboard/billing/billing').then(m => m.DashboardBilling)
      },
      {
        path: 'events',
        title: 'Events',
        loadComponent: () => import('./pages/dashboard/events/events').then(m => m.DashboardEvents)
      },
      {
        path: 'settings',
        title: 'Settings',
        loadComponent: () => import('./pages/dashboard/settings/settings').then(m => m.DashboardSettings)
      }
    ]
  },
  {
    path: 'reset-password/:token',
    title: 'Reset Password',
    loadComponent: () => import('./pages/reset-password/reset-password').then(m => m.ResetPassword)
  }
];