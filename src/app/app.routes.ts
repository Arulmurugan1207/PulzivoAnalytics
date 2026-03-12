import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

// Public pages — eagerly loaded for fast navigation and better SEO
import { Home } from './pages/home/home';
import { Pricing } from './pages/pricing/pricing';
import { Docs } from './pages/docs/docs';
import { Features } from './pages/features/features';
import { WhyPulzivo } from './pages/why-pulzivo/why-pulzivo';
import { UseCases } from './pages/use-cases/use-cases';
import { Blog } from './pages/blog/blog';
import { Contact } from './pages/contact/contact';
import { Privacy } from './pages/privacy/privacy';
import { Terms } from './pages/terms/terms';
import { ResetPassword } from './pages/reset-password/reset-password';

export const routes: Routes = [
  {
    path: '',
    title: 'Pulzivo Analytics — The Pulse of Modern Web & Product Analytics | Free & Privacy-First',
    component: Home
  },
  {
    path: 'pricing',
    title: 'Pricing',
    component: Pricing
  },
  {
    path: 'docs',
    title: 'Documentation',
    component: Docs
  },
  {
    path: 'features',
    title: 'Features',
    component: Features
  },
  {
    path: 'why-pulzivo',
    title: 'Why Pulzivo',
    component: WhyPulzivo
  },
  {
    path: 'use-cases',
    title: 'Use Cases',
    component: UseCases
  },
  {
    path: 'blog',
    title: 'Blog',
    component: Blog
  },
  {
    path: 'contact',
    title: 'Contact',
    component: Contact
  },
  {
    path: 'privacy',
    title: 'Privacy Policy',
    component: Privacy
  },
  {
    path: 'terms',
    title: 'Terms of Service',
    component: Terms
  },
  {
    path: 'reset-password/:token',
    title: 'Reset Password',
    component: ResetPassword
  },
  // Public demo — same shell+components as dashboard, no auth, mock data via DemoService
  {
    path: 'demo',
    loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard),
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      {
        path: 'overview',
        title: 'Live Demo — Analytics Overview',
        loadComponent: () => import('./pages/dashboard/overview/overview').then(m => m.DashboardOverview)
      },
      {
        path: 'events',
        title: 'Live Demo — Events',
        loadComponent: () => import('./pages/dashboard/events/events').then(m => m.DashboardEvents)
      }
    ]
  },
  // Dashboard — lazy loaded (auth-gated, heavy, no SEO value)
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
        path: 'funnels',
        title: 'Funnels',
        loadComponent: () => import('./pages/dashboard/funnels/funnels').then(m => m.DashboardFunnels)
      },
      {
        path: 'settings',
        title: 'Settings',
        loadComponent: () => import('./pages/dashboard/settings/settings').then(m => m.DashboardSettings)
      }
    ]
  }
];