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
    { path: '/', views: 2841, percentage: 33.7, avgTimeOnPage: 142, avgScrollDepth: 68.4 },
    { path: '/pricing', views: 1124, percentage: 13.3, avgTimeOnPage: 98, avgScrollDepth: 72.1 },
    { path: '/docs', views: 987, percentage: 11.7, avgTimeOnPage: 234, avgScrollDepth: 81.6 },
    { path: '/features', views: 762, percentage: 9.0, avgTimeOnPage: 117, avgScrollDepth: 61.3 },
    { path: '/why-pulzivo', views: 541, percentage: 6.4, avgTimeOnPage: 89, avgScrollDepth: 54.7 },
    { path: '/use-cases', views: 413, percentage: 4.9, avgTimeOnPage: 176, avgScrollDepth: 77.2 },
    { path: '/blog', views: 389, percentage: 4.6, avgTimeOnPage: 201, avgScrollDepth: 83.5 },
    { path: '/contact', views: 211, percentage: 2.5, avgTimeOnPage: 63, avgScrollDepth: 42.8 },
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

  // ─── Overview tab mock data (missing from 3 lazy tabs) ───────────────────────

  /** Trend % vs previous period (used by KPI cards) */
  readonly overviewTrends = {
    totalPageViews: 12.4,
    uniqueVisitors: 8.7,
    bounceRate: -3.2,
    avgSessionDuration: 5.1
  };

  /** Previous-period bar chart dataset (overlaid on trend chart when comparison is ON) */
  readonly prevBarChartDataset = {
    label: 'Prev. Period',
    data: [724, 891, 812, 1043, 1187, 934, 778],
    backgroundColor: 'rgba(99,102,241,0.18)',
    borderColor: '#6366f1',
    borderWidth: 2,
    borderRadius: 6,
    borderSkipped: false,
    barThickness: 24,
    type: 'bar'
  };

  /** Acquisition tab — Entry Pages */
  readonly entryPages = [
    { path: '/', entrances: 3241, percentage: 38.4 },
    { path: '/pricing', entrances: 891, percentage: 10.6 },
    { path: '/features', entrances: 672, percentage: 8.0 },
    { path: '/docs', entrances: 541, percentage: 6.4 },
    { path: '/blog', entrances: 312, percentage: 3.7 },
  ];

  /** Acquisition tab — Exit Pages */
  readonly exitPages = [
    { path: '/pricing', exits: 1124, exitRate: 42.3 },
    { path: '/contact', exits: 687, exitRate: 38.1 },
    { path: '/docs', exits: 541, exitRate: 29.7 },
    { path: '/', exits: 489, exitRate: 17.2 },
    { path: '/features', exits: 312, exitRate: 22.8 },
  ];

  /** Behaviour tab — Form Interactions */
  readonly formInteractions = [
    { formId: 'contact-form', page: '/contact', submits: 143, abandons: 58, focuses: 312, submitRate: 71.1 },
    { formId: 'signup-form',  page: '/',        submits: 187, abandons: 94, focuses: 421, submitRate: 66.5 },
    { formId: 'login-form',   page: '/login',   submits: 891, abandons: 23, focuses: 921, submitRate: 97.5 },
    { formId: 'newsletter',   page: '/blog',    submits: 76,  abandons: 31, focuses: 142, submitRate: 71.0 },
  ];

  /** Behaviour tab — Tooltip Insights */
  readonly tooltipInsights = [
    { tooltipId: 'api-key-help',      page: '/dashboard', views: 312, uniqueUsers: 241, avgDwellMs: 3200 },
    { tooltipId: 'plan-comparison',   page: '/pricing',   views: 289, uniqueUsers: 198, avgDwellMs: 4800 },
    { tooltipId: 'web-vitals-lcp',    page: '/dashboard', views: 187, uniqueUsers: 156, avgDwellMs: 2900 },
    { tooltipId: 'utm-attribution',   page: '/docs',      views: 143, uniqueUsers: 121, avgDwellMs: 5100 },
    { tooltipId: 'bounce-rate-info',  page: '/dashboard', views: 98,  uniqueUsers: 87,  avgDwellMs: 2400 },
  ];

  /** Technical tab — Operating Systems */
  readonly operatingSystems = [
    { name: 'Windows',   count: 3541, percentage: 42.0 },
    { name: 'macOS',     count: 2187, percentage: 26.0 },
    { name: 'iOS',       count: 1421, percentage: 16.9 },
    { name: 'Android',   count: 891,  percentage: 10.6 },
    { name: 'Linux',     count: 383,  percentage: 4.5  },
  ];

  /** Session Stats — accurate session-level metrics */
  readonly sessionStats = {
    totalSessions: 2841,
    avgPagesPerSession: 3.2,
    avgSessionDuration: 187,
    topEntryPages: [
      { page: '/',          count: 1241, percentage: 43.7 },
      { page: '/pricing',   count: 412,  percentage: 14.5 },
      { page: '/features',  count: 287,  percentage: 10.1 },
      { page: '/docs',      count: 198,  percentage: 6.97 },
      { page: '/blog',      count: 143,  percentage: 5.03 },
    ],
    topExitPages: [
      { page: '/pricing',   count: 687,  percentage: 24.2 },
      { page: '/contact',   count: 521,  percentage: 18.3 },
      { page: '/docs',      count: 398,  percentage: 14.0 },
      { page: '/',          count: 341,  percentage: 12.0 },
      { page: '/features',  count: 287,  percentage: 10.1 },
    ]
  };

  /** Attribution Model — First Touch, Last Touch, Linear */
  readonly attribution = {
    totalSessions: 2841,
    firstTouch: [
      { source: 'Direct',        value: 1241, percentage: 43.7 },
      { source: 'google',        value: 712,  percentage: 25.1 },
      { source: 'twitter.com',   value: 289,  percentage: 10.2 },
      { source: 'github.com',    value: 198,  percentage: 7.0  },
      { source: 'newsletter',    value: 143,  percentage: 5.0  },
      { source: 'linkedin.com',  value: 98,   percentage: 3.5  },
      { source: 'ycombinator',   value: 76,   percentage: 2.7  },
      { source: 'reddit.com',    value: 54,   percentage: 1.9  },
    ],
    lastTouch: [
      { source: 'Direct',        value: 1541, percentage: 54.2 },
      { source: 'google',        value: 587,  percentage: 20.7 },
      { source: 'twitter.com',   value: 241,  percentage: 8.5  },
      { source: 'github.com',    value: 187,  percentage: 6.6  },
      { source: 'newsletter',    value: 143,  percentage: 5.0  },
      { source: 'linkedin.com',  value: 76,   percentage: 2.7  },
      { source: 'ycombinator',   value: 54,   percentage: 1.9  },
      { source: 'reddit.com',    value: 12,   percentage: 0.4  },
    ],
    linear: [
      { source: 'Direct',        value: 1389, percentage: 48.9 },
      { source: 'google',        value: 641,  percentage: 22.6 },
      { source: 'twitter.com',   value: 264,  percentage: 9.3  },
      { source: 'github.com',    value: 192,  percentage: 6.8  },
      { source: 'newsletter',    value: 143,  percentage: 5.0  },
      { source: 'linkedin.com',  value: 87,   percentage: 3.1  },
      { source: 'ycombinator',   value: 65,   percentage: 2.3  },
      { source: 'reddit.com',    value: 33,   percentage: 1.2  },
    ]
  };

  /** Cohort Retention — 8 weekly cohorts with W0–W4 return rates */
  readonly cohortRetention = [
    { week: '2026-W12', label: '2026 W12', total: 312, w0: 100, w1: 38.5, w2: 24.0, w3: 17.3, w4: 12.8 },
    { week: '2026-W11', label: '2026 W11', total: 287, w0: 100, w1: 41.1, w2: 26.8, w3: 19.2, w4: 14.6 },
    { week: '2026-W10', label: '2026 W10', total: 341, w0: 100, w1: 35.2, w2: 21.7, w3: 15.8, w4: 11.1 },
    { week: '2026-W09', label: '2026 W09', total: 298, w0: 100, w1: 43.6, w2: 28.5, w3: 20.1, w4: 15.4 },
    { week: '2026-W08', label: '2026 W08', total: 324, w0: 100, w1: 39.2, w2: 25.3, w3: 18.5, w4: 13.9 },
    { week: '2026-W07', label: '2026 W07', total: 276, w0: 100, w1: 36.6, w2: 22.8, w3: 16.3, w4: 12.0 },
    { week: '2026-W06', label: '2026 W06', total: 391, w0: 100, w1: 44.8, w2: 30.2, w3: 22.6, w4: 17.1 },
    { week: '2026-W05', label: '2026 W05', total: 312, w0: 100, w1: 37.5, w2: 23.4, w3: 16.7, w4: 12.2 },
  ];

  /** User Paths — top page-to-page session flows */
  readonly userPaths = [
    { from: '/',           to: '/features',   count: 487 },
    { from: '/',           to: '/pricing',    count: 412 },
    { from: '/features',   to: '/pricing',    count: 298 },
    { from: '/pricing',    to: '/contact',    count: 241 },
    { from: '/',           to: '/docs',       count: 198 },
    { from: '/features',   to: '/docs',       count: 176 },
    { from: '/pricing',    to: '/',           count: 154 },
    { from: '/docs',       to: '/pricing',    count: 143 },
    { from: '/blog',       to: '/',           count: 132 },
    { from: '/contact',    to: '/',           count: 121 },
    { from: '/docs',       to: '/features',   count: 109 },
    { from: '/',           to: '/blog',       count: 98  },
    { from: '/features',   to: '/',           count: 87  },
    { from: '/pricing',    to: '/features',   count: 76  },
    { from: '/blog',       to: '/pricing',    count: 65  },
  ];

  readonly userPathsTotalSessions = 2841;

  /** Error Tracking — JS errors by type and message */
  readonly errorTracking = [
    { type: 'TypeError',      message: "Cannot read properties of undefined (reading 'map')",   count: 47, affectedUsers: 31, lastSeen: new Date(Date.now() - 1000*60*12).toISOString(),  pageCount: 3 },
    { type: 'ReferenceError', message: 'PulzivoAnalytics is not defined',                        count: 23, affectedUsers: 19, lastSeen: new Date(Date.now() - 1000*60*45).toISOString(),  pageCount: 1 },
    { type: 'TypeError',      message: "Cannot set property 'innerHTML' of null",                count: 18, affectedUsers: 14, lastSeen: new Date(Date.now() - 1000*60*80).toISOString(),  pageCount: 2 },
    { type: 'SyntaxError',    message: 'Unexpected token < in JSON at position 0',               count: 12, affectedUsers: 9,  lastSeen: new Date(Date.now() - 1000*60*120).toISOString(), pageCount: 5 },
    { type: 'NetworkError',   message: 'Failed to fetch — net::ERR_NETWORK_CHANGED',             count: 9,  affectedUsers: 7,  lastSeen: new Date(Date.now() - 1000*60*200).toISOString(), pageCount: 4 },
    { type: 'TypeError',      message: "Cannot read properties of null (reading 'addEventListener')", count: 7, affectedUsers: 6, lastSeen: new Date(Date.now() - 1000*60*360).toISOString(), pageCount: 2 },
    { type: 'RangeError',     message: 'Maximum call stack size exceeded',                       count: 4,  affectedUsers: 3,  lastSeen: new Date(Date.now() - 1000*60*480).toISOString(), pageCount: 1 },
  ];

  /** Rage Clicks — frustrated rapid-click elements */
  readonly rageClicks = [
    { element: 'BUTTON', label: 'Submit',         page: '/pricing',   count: 87, avgClicks: 5.2, lastSeen: new Date(Date.now() - 1000*60*20).toISOString() },
    { element: 'A',      label: 'Get Started',    page: '/',          count: 64, avgClicks: 4.8, lastSeen: new Date(Date.now() - 1000*60*35).toISOString() },
    { element: 'BUTTON', label: 'Next',           page: '/docs',      count: 41, avgClicks: 4.1, lastSeen: new Date(Date.now() - 1000*60*55).toISOString() },
    { element: 'INPUT',  label: 'Search',         page: '/blog',      count: 33, avgClicks: 3.9, lastSeen: new Date(Date.now() - 1000*60*90).toISOString() },
    { element: 'DIV',    label: 'pricing-toggle', page: '/pricing',   count: 28, avgClicks: 3.7, lastSeen: new Date(Date.now() - 1000*60*130).toISOString() },
  ];

  /** Dead Clicks — clicks on non-interactive elements */
  readonly deadClicks = [
    { element: 'SPAN',   label: 'feature-icon',   page: '/features',  count: 112, lastSeen: new Date(Date.now() - 1000*60*15).toISOString() },
    { element: 'DIV',    label: 'hero-banner',    page: '/',          count: 98,  lastSeen: new Date(Date.now() - 1000*60*30).toISOString() },
    { element: 'P',      label: '',               page: '/pricing',   count: 76,  lastSeen: new Date(Date.now() - 1000*60*50).toISOString() },
    { element: 'IMG',    label: 'team-photo',     page: '/about',     count: 54,  lastSeen: new Date(Date.now() - 1000*60*80).toISOString() },
    { element: 'H2',     label: 'section-title',  page: '/features',  count: 39,  lastSeen: new Date(Date.now() - 1000*60*120).toISOString() },
  ];

  /** Per-Page Web Vitals */
  readonly pageVitals = [
    { page: '/',          count: 1241, avgLCP: 1820, avgFID: 48,  avgCLS: 0.04, lcpRating: 'good',              fidRating: 'good',             clsRating: 'good'             },
    { page: '/pricing',   count: 687,  avgLCP: 2210, avgFID: 72,  avgCLS: 0.08, lcpRating: 'good',              fidRating: 'good',             clsRating: 'good'             },
    { page: '/features',  count: 521,  avgLCP: 2680, avgFID: 91,  avgCLS: 0.12, lcpRating: 'needs-improvement', fidRating: 'good',             clsRating: 'needs-improvement'},
    { page: '/docs',      count: 398,  avgLCP: 1540, avgFID: 35,  avgCLS: 0.03, lcpRating: 'good',              fidRating: 'good',             clsRating: 'good'             },
    { page: '/blog',      count: 341,  avgLCP: 3120, avgFID: 143, avgCLS: 0.19, lcpRating: 'needs-improvement', fidRating: 'needs-improvement', clsRating: 'needs-improvement'},
    { page: '/contact',   count: 287,  avgLCP: 1980, avgFID: 55,  avgCLS: 0.06, lcpRating: 'good',              fidRating: 'good',             clsRating: 'good'             },
    { page: '/why-pulzivo', count: 198, avgLCP: 4350, avgFID: 312, avgCLS: 0.28, lcpRating: 'poor',             fidRating: 'poor',             clsRating: 'poor'             },
    { page: '/use-cases', count: 156,  avgLCP: 2890, avgFID: 88,  avgCLS: 0.09, lcpRating: 'needs-improvement', fidRating: 'good',             clsRating: 'good'             },
  ];
}
