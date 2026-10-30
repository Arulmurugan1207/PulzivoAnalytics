import { Route, Routes } from '@angular/router';
import { AuthGuard, guestGuard } from './guards/auth.guard';

// Home is eager (landing page); other public pages are lazy-loaded to keep the initial bundle small
import { Home } from './pages/home/home';
import seoRoutes from './seo/seo-routes.json';
import posts from './pages/blog/posts.json';

// Title/description for public marketing routes live in seo-routes.json so the
// build-time prerender (scripts/prerender-seo.mjs) and the router stay in sync.
function seo(path: string): Pick<Route, 'title' | 'data'> {
  const r = seoRoutes.find(x => x.path === path);
  if (!r) throw new Error(`Missing SEO entry for /${path}`);
  return { title: r.title, data: { description: r.description } };
}

const blogPostRoutes: Routes = posts.map(p => ({
  path: `blog/${p.slug}`,
  title: `${p.title} | Pulzivo Analytics`,
  data: { description: p.description, slug: p.slug },
  loadComponent: () => import('./pages/blog/blog-post').then(m => m.BlogPost),
}));

export const routes: Routes = [
  {
    path: '',
    ...seo(''),
    component: Home
  },
  {
    path: 'pricing',
    ...seo('pricing'),
    loadComponent: () => import('./pages/pricing/pricing').then(m => m.Pricing)
  },
  {
    path: 'docs',
    ...seo('docs'),
    loadComponent: () => import('./pages/docs/docs').then(m => m.Docs)
  },
  {
    path: 'features',
    ...seo('features'),
    loadComponent: () => import('./pages/features/features').then(m => m.Features)
  },
  {
    path: 'why-pulzivo',
    ...seo('why-pulzivo'),
    loadComponent: () => import('./pages/why-pulzivo/why-pulzivo').then(m => m.WhyPulzivo)
  },
  {
    path: 'use-cases',
    ...seo('use-cases'),
    loadComponent: () => import('./pages/use-cases/use-cases').then(m => m.UseCases)
  },
  {
    path: 'blog',
    ...seo('blog'),
    loadComponent: () => import('./pages/blog/blog').then(m => m.Blog)
  },
  ...blogPostRoutes,
  {
    path: 'contact',
    ...seo('contact'),
    loadComponent: () => import('./pages/contact/contact').then(m => m.Contact)
  },
  {
    path: 'privacy',
    ...seo('privacy'),
    loadComponent: () => import('./pages/privacy/privacy').then(m => m.Privacy)
  },
  {
    path: 'terms',
    ...seo('terms'),
    loadComponent: () => import('./pages/terms/terms').then(m => m.Terms)
  },
  {
    path: 'login',
    title: 'Sign In | Pulzivo Analytics',
    data: { authModal: 'signin', robots: 'noindex, follow' },
    canActivate: [guestGuard],
    component: Home
  },
  {
    path: 'signin',
    title: 'Sign In | Pulzivo Analytics',
    data: { authModal: 'signin', robots: 'noindex, follow' },
    canActivate: [guestGuard],
    component: Home
  },
  {
    path: 'signup',
    title: 'Sign Up | Pulzivo Analytics',
    data: { authModal: 'signup', robots: 'noindex, follow' },
    canActivate: [guestGuard],
    component: Home
  },
  {
    path: 'register',
    title: 'Sign Up | Pulzivo Analytics',
    data: { authModal: 'signup', robots: 'noindex, follow' },
    canActivate: [guestGuard],
    component: Home
  },
  {
    path: 'reset-password/:token',
    title: 'Reset Password | Pulzivo Analytics',
    data: { description: 'Reset your Pulzivo Analytics account password.', robots: 'noindex, nofollow' },
    loadComponent: () => import('./pages/reset-password/reset-password').then(m => m.ResetPassword)
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