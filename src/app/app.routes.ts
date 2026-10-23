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
    title: 'Pulzivo Analytics — Free, Privacy-First Web & Product Analytics',
    data: { description: 'Free, privacy-first, cookieless web and product analytics in one script tag. Track page views, clicks, custom events and sessions — about 9KB gzip, no cookie banners.' },
    component: Home
  },
  {
    path: 'pricing',
    title: 'Pricing — Free Plan & Paid Tiers | Pulzivo Analytics',
    data: { description: 'Pulzivo pricing: free forever plan with 10,000 events/month, plus paid tiers for higher volume. No credit card required, cookieless and GDPR compliant.' },
    component: Pricing
  },
  {
    path: 'docs',
    title: 'Documentation — Install & Track Events | Pulzivo Analytics',
    data: { description: 'Install Pulzivo with one script tag, then track page views, clicks, custom events and sessions. Setup guides, API reference and FAQs for developers.' },
    component: Docs
  },
  {
    path: 'features',
    title: 'Features — Cookieless Auto-Tracking SDK | Pulzivo Analytics',
    data: { description: 'Auto page views, click and scroll tracking, custom events, UTM attribution, funnels and real-time reports — in an analytics SDK of about 9KB gzip.' },
    component: Features
  },
  {
    path: 'why-pulzivo',
    title: 'Why Pulzivo — A Google Analytics Alternative | Pulzivo Analytics',
    data: { description: 'How Pulzivo compares with Google Analytics and other tools: privacy-first, no cookie banners, about 9KB gzip, zero configuration, free to start.' },
    component: WhyPulzivo
  },
  {
    path: 'use-cases',
    title: 'Use Cases — Marketing Sites, SaaS & Apps | Pulzivo Analytics',
    data: { description: 'See how teams use Pulzivo to measure marketing sites, SaaS products and web apps with one privacy-first analytics script and custom events.' },
    component: UseCases
  },
  {
    path: 'blog',
    title: 'Blog | Pulzivo Analytics',
    data: { description: 'Product updates and announcements from Pulzivo Analytics.', robots: 'noindex, follow' },
    component: Blog
  },
  {
    path: 'contact',
    title: 'Contact Us — Support & Sales | Pulzivo Analytics',
    data: { description: 'Questions about Pulzivo Analytics? Contact support or sales at support@pulzivo.com, or browse common questions about setup, privacy and pricing.' },
    component: Contact
  },
  {
    path: 'privacy',
    title: 'Privacy Policy | Pulzivo Analytics',
    data: { description: 'How Pulzivo Analytics handles data: cookieless tracking, no personal data collected from your visitors, and how account data is stored and protected.' },
    component: Privacy
  },
  {
    path: 'terms',
    title: 'Terms of Service | Pulzivo Analytics',
    data: { description: 'The terms of service governing use of the Pulzivo Analytics website, tracking SDK, dashboard and paid plans.' },
    component: Terms
  },
  {
    path: 'reset-password/:token',
    title: 'Reset Password | Pulzivo Analytics',
    data: { description: 'Reset your Pulzivo Analytics account password.', robots: 'noindex, nofollow' },
    component: ResetPassword
  },
  // Public demo — same shell+components as dashboard, no auth, mock data via DemoService
  {
    path: 'demo',
    data: { description: 'Interactive demo of the Pulzivo Analytics dashboard with sample data.', robots: 'noindex, follow' },
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
    data: { robots: 'noindex, nofollow' },
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