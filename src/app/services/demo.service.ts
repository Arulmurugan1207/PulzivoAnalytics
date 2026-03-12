import { Injectable, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class DemoService {
  isDemoMode = signal(false);

  constructor(private router: Router) {
    // On hard refresh router.url may not yet reflect the real URL — use window.location as fallback
    const currentPath = this.router.url || (typeof window !== 'undefined' ? window.location.pathname : '');
    if (currentPath.startsWith('/demo')) this.isDemoMode.set(true);

    // Keep in sync on subsequent navigations (SPA transitions)
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.isDemoMode.set(e.urlAfterRedirects?.startsWith('/demo'));
    });
  }

  // ─── Overview mock ───────────────────────────────────────────────────────────

  readonly overviewMetrics = {
    liveVisitors: 14,
    totalPageViews: 8423,
    conversionRate: 3.7,
    bounceRate: 42.1,
    avgSessionDuration: 187,
    newVsReturning: { new: 64, returning: 36 },
    uniqueVisitors: 1847
  };

  readonly deviceBreakdown = {
    desktop: 58, mobile: 36, tablet: 6,
    desktopPercentage: 58, mobilePercentage: 36, tabletPercentage: 6
  };

  readonly topPages = [
    { path: '/', views: 2841, percentage: 33.7 },
    { path: '/pricing', views: 1124, percentage: 13.3 },
    { path: '/docs', views: 987, percentage: 11.7 },
    { path: '/features', views: 762, percentage: 9.0 },
    { path: '/why-pulzivo', views: 541, percentage: 6.4 },
    { path: '/use-cases', views: 413, percentage: 4.9 },
    { path: '/blog', views: 389, percentage: 4.6 },
    { path: '/contact', views: 211, percentage: 2.5 },
  ];

  readonly geoData = [
    { country: 'United States', visitors: 3241, percentage: 38.4 },
    { country: 'United Kingdom', visitors: 891, percentage: 10.6 },
    { country: 'Germany', visitors: 672, percentage: 8.0 },
    { country: 'India', visitors: 541, percentage: 6.4 },
    { country: 'France', visitors: 387, percentage: 4.6 },
    { country: 'Canada', visitors: 312, percentage: 3.7 },
    { country: 'Australia', visitors: 289, percentage: 3.4 },
    { country: 'Netherlands', visitors: 201, percentage: 2.4 },
  ];

  readonly trafficSources = [
    { source: 'Organic Search', visitors: 3142, percentage: 37.3 },
    { source: 'Direct', visitors: 2187, percentage: 25.9 },
    { source: 'Referral', visitors: 1241, percentage: 14.7 },
    { source: 'Social Media', visitors: 897, percentage: 10.6 },
    { source: 'Email', visitors: 541, percentage: 6.4 },
    { source: 'Paid Search', visitors: 415, percentage: 4.9 },
  ];

  readonly topClicks = [
    { label: 'Start Free Now', clickType: 'click', count: 541, page: '/' },
    { label: 'Copy Script Button', clickType: 'click', count: 389, page: '/' },
    { label: 'View Pricing', clickType: 'click', count: 312, page: '/' },
    { label: 'Read Docs', clickType: 'click', count: 287, page: '/pricing' },
    { label: 'Get Started', clickType: 'click', count: 241, page: '/features' },
  ];

  readonly customEvents = [
    { name: 'script_copied', count: 312, lastSeen: '2 minutes ago', percentage: 100 },
    { name: 'signup_started', count: 187, lastSeen: '5 minutes ago', percentage: 60 },
    { name: 'signup_completed', count: 143, lastSeen: '8 minutes ago', percentage: 46 },
    { name: 'pricing_viewed', count: 98, lastSeen: '15 minutes ago', percentage: 31 },
    { name: 'docs_copied', count: 76, lastSeen: '22 minutes ago', percentage: 24 },
  ];

  readonly realtimeEvents = [
    { timestamp: new Date(Date.now() - 12000).toISOString(), event: 'page_view', page: '/pricing', user: 'anon_7f3a', country: 'US', device: 'Desktop' },
    { timestamp: new Date(Date.now() - 28000).toISOString(), event: 'script_copied', page: '/', user: 'anon_2b9c', country: 'DE', device: 'Desktop' },
    { timestamp: new Date(Date.now() - 45000).toISOString(), event: 'signup_started', page: '/', user: 'anon_4d1e', country: 'GB', device: 'Mobile' },
    { timestamp: new Date(Date.now() - 72000).toISOString(), event: 'click', page: '/features', user: 'anon_8a2f', country: 'IN', device: 'Desktop' },
    { timestamp: new Date(Date.now() - 91000).toISOString(), event: 'page_view', page: '/docs', user: 'anon_1c5b', country: 'CA', device: 'Tablet' },
    { timestamp: new Date(Date.now() - 138000).toISOString(), event: 'page_view', page: '/', user: 'anon_6e9d', country: 'FR', device: 'Mobile' },
  ];

  readonly barChartData = {
    labels: ['Mar 6', 'Mar 7', 'Mar 8', 'Mar 9', 'Mar 10', 'Mar 11', 'Mar 12'],
    datasets: [{
      data: [891, 1042, 978, 1187, 1341, 1089, 895],
      backgroundColor: '#2a6df6',
      borderRadius: 6,
      borderSkipped: false,
      barThickness: 24
    }]
  };

  readonly doughnutChartData = {
    labels: ['Desktop', 'Mobile', 'Tablet'],
    datasets: [{
      data: [58, 36, 6],
      backgroundColor: ['#2a6df6', '#6f41ff', '#f59e0b'],
      hoverBackgroundColor: ['#1d5fd6', '#5a32d6', '#d97706'],
      borderWidth: 0
    }]
  };

  readonly webVitals = {
    LCP: { avg: 1.8, p75: 2.2, count: 412, rating: 'good' as const },
    FID: { avg: 12, p75: 18, count: 389, rating: 'good' as const },
    CLS: { avg: 0.04, p75: 0.07, count: 401, rating: 'good' as const }
  };

  readonly funnelData = {
    labels: ['Visited Home', 'Viewed Pricing', 'Started Sign Up', 'Completed Sign Up'],
    steps: [8423, 1124, 187, 143]
  };

  readonly funnelBuilderData = {
    steps: [
      { name: 'Landing Page', eventName: 'page_view' },
      { name: 'Sign Up Started', eventName: 'signup_started' },
      { name: 'Sign Up Completed', eventName: 'signup_completed' },
      { name: 'Script Installed', eventName: 'script_copied' },
    ],
    counts: [8423, 187, 143, 98]
  };

  readonly browsers = [
    { name: 'Chrome', count: 4921, percentage: 58.4 },
    { name: 'Safari', count: 1842, percentage: 21.9 },
    { name: 'Firefox', count: 891, percentage: 10.6 },
    { name: 'Edge', count: 512, percentage: 6.1 },
    { name: 'Other', count: 257, percentage: 3.0 },
  ];

  readonly utmSources = [
    { source: 'google', campaign: 'brand', medium: 'cpc', visitors: 412 },
    { source: 'twitter', campaign: 'launch', medium: 'social', visitors: 287 },
    { source: 'newsletter', campaign: 'weekly', medium: 'email', visitors: 241 },
    { source: 'github', campaign: 'readme', medium: 'referral', visitors: 189 },
  ];

  // ─── Events mock ─────────────────────────────────────────────────────────────

  readonly eventsSummary = {
    rageClicks: 23,
    deadClicks: 87,
    formSubmits: 143,
    formAbandons: 58,
    formFocuses: 312
  };

  readonly eventsBreakdown = [
    { name: 'page_view', count: 8423, percentage: 100 },
    { name: 'click', count: 3241, percentage: 38.5 },
    { name: 'scroll', count: 2187, percentage: 26.0 },
    { name: 'script_copied', count: 312, percentage: 3.7 },
    { name: 'form_focus', count: 312, percentage: 3.7 },
    { name: 'rage_click', count: 23, percentage: 0.3 },
    { name: 'dead_click', count: 87, percentage: 1.0 },
    { name: 'form_submit', count: 143, percentage: 1.7 },
    { name: 'form_abandon', count: 58, percentage: 0.7 },
    { name: 'signup_started', count: 187, percentage: 2.2 },
    { name: 'signup_completed', count: 143, percentage: 1.7 },
    { name: 'pricing_viewed', count: 98, percentage: 1.2 },
    { name: 'page_exit', count: 1891, percentage: 22.5 },
    { name: 'session_start', count: 2341, percentage: 27.8 },
    { name: 'web_vital_lcp', count: 412, percentage: 4.9 },
  ];

  readonly eventsTopClicks = [
    { element: 'button#start-free', page: '/', count: 541 },
    { element: 'button.copy-button', page: '/', count: 389 },
    { element: 'a[href="/pricing"]', page: '/', count: 312 },
    { element: 'button#get-started', page: '/pricing', count: 241 },
    { element: 'a[href="/docs"]', page: '/features', count: 198 },
  ];

  readonly eventsHistory = [
    { id: '1', event_name: 'page_view', user_id: 'anon_7f3a', timestamp: new Date(Date.now() - 60000).toISOString(), page: '/pricing', country: 'US', device: 'Desktop', data: { referrer: 'google.com' } },
    { id: '2', event_name: 'script_copied', user_id: 'anon_2b9c', timestamp: new Date(Date.now() - 3 * 60000).toISOString(), page: '/', country: 'DE', device: 'Desktop', data: { section: 'script-tag', copy_number: 1 } },
    { id: '3', event_name: 'signup_started', user_id: 'anon_4d1e', timestamp: new Date(Date.now() - 7 * 60000).toISOString(), page: '/', country: 'GB', device: 'Mobile', data: {} },
    { id: '4', event_name: 'click', user_id: 'anon_8a2f', timestamp: new Date(Date.now() - 12 * 60000).toISOString(), page: '/features', country: 'IN', device: 'Desktop', data: { element: 'button#start-free', label: 'Start Free Now' } },
    { id: '5', event_name: 'page_view', user_id: 'anon_1c5b', timestamp: new Date(Date.now() - 18 * 60000).toISOString(), page: '/docs', country: 'CA', device: 'Tablet', data: {} },
    { id: '6', event_name: 'form_submit', user_id: 'anon_3d7e', timestamp: new Date(Date.now() - 22 * 60000).toISOString(), page: '/contact', country: 'FR', device: 'Desktop', data: { formId: 'contact-form' } },
    { id: '7', event_name: 'rage_click', user_id: 'anon_9b4f', timestamp: new Date(Date.now() - 31 * 60000).toISOString(), page: '/pricing', country: 'AU', device: 'Mobile', data: { element: 'div.plan-card', clicks: 5 } },
    { id: '8', event_name: 'scroll', user_id: 'anon_5c2a', timestamp: new Date(Date.now() - 38 * 60000).toISOString(), page: '/', country: 'US', device: 'Desktop', data: { depth: 75 } },
    { id: '9', event_name: 'page_view', user_id: 'anon_6e9d', timestamp: new Date(Date.now() - 45 * 60000).toISOString(), page: '/why-pulzivo', country: 'NL', device: 'Desktop', data: {} },
    { id: '10', event_name: 'signup_completed', user_id: 'anon_4d1e', timestamp: new Date(Date.now() - 52 * 60000).toISOString(), page: '/', country: 'GB', device: 'Mobile', data: { plan: 'free' } },
    { id: '11', event_name: 'dead_click', user_id: 'anon_1a8b', timestamp: new Date(Date.now() - 61 * 60000).toISOString(), page: '/features', country: 'US', device: 'Desktop', data: { element: 'div.feature-card' } },
    { id: '12', event_name: 'page_view', user_id: 'anon_7c3d', timestamp: new Date(Date.now() - 74 * 60000).toISOString(), page: '/blog', country: 'GB', device: 'Mobile', data: {} },
    { id: '13', event_name: 'pricing_viewed', user_id: 'anon_2b9c', timestamp: new Date(Date.now() - 88 * 60000).toISOString(), page: '/pricing', country: 'DE', device: 'Desktop', data: { plan: 'pro' } },
    { id: '14', event_name: 'form_abandon', user_id: 'anon_8f4e', timestamp: new Date(Date.now() - 97 * 60000).toISOString(), page: '/contact', country: 'IN', device: 'Mobile', data: { formId: 'contact-form', lastField: 'email' } },
    { id: '15', event_name: 'web_vital_lcp', user_id: 'anon_3a9c', timestamp: new Date(Date.now() - 112 * 60000).toISOString(), page: '/', country: 'US', device: 'Desktop', data: { value: 1.82, rating: 'good' } },
  ];

  readonly eventsTimelineChart = {
    labels: ['Mar 6', 'Mar 7', 'Mar 8', 'Mar 9', 'Mar 10', 'Mar 11', 'Mar 12'],
    datasets: [
      { label: 'User Actions', data: [312, 398, 421, 487, 531, 412, 289], borderColor: '#2a6df6', backgroundColor: '#2a6df620', tension: 0.4, fill: true },
      { label: 'Navigation', data: [891, 1042, 978, 1187, 1341, 1089, 895], borderColor: '#6f41ff', backgroundColor: '#6f41ff20', tension: 0.4, fill: true },
      { label: 'Forms', data: [41, 53, 48, 67, 72, 59, 43], borderColor: '#f59e0b', backgroundColor: '#f59e0b20', tension: 0.4, fill: true },
      { label: 'Errors & Issues', data: [8, 12, 9, 15, 11, 7, 4], borderColor: '#ef4444', backgroundColor: '#ef444420', tension: 0.4, fill: true },
      { label: 'Performance', data: [54, 61, 58, 72, 81, 67, 52], borderColor: '#22c55e', backgroundColor: '#22c55e20', tension: 0.4, fill: true },
    ]
  };

  readonly eventsBarChart = {
    labels: ['page_view', 'click', 'scroll', 'session start', 'page exit', 'form focus', 'signup started', 'form submit', 'script copied', 'signup done'],
    datasets: [{
      data: [8423, 3241, 2187, 2341, 1891, 312, 187, 143, 312, 143],
      backgroundColor: ['#2a6df6', '#6f41ff', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#4ade80', '#f97316'],
      borderRadius: 6,
      borderSkipped: false
    }]
  };
}
