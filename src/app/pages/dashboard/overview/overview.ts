import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, Subscription, BehaviorSubject } from 'rxjs';
import { ChartModule } from 'primeng/chart';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DatePickerModule } from 'primeng/datepicker';
import { PopoverModule, Popover } from 'primeng/popover';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import {
  AnalyticsDataService,
  AnalyticsMetrics,
  DeviceBreakdown,
  PageData,
  GeographicData,
  PageViewsTrendData,
  RealtimeEvent,
  DateRange,
  ConversionFunnel,
  TrafficSource,
  UtmSource,
  BrowserData,
  WebVitals,
  WebVitalMetric
} from '../../../services/analytics-data.service';
import { AnalyticsAPIService } from '../../../services/analytics-api.service';
import { ApiKeysService, ApiKey } from '../../../services/api-keys.service';
import { AuthService } from '../../../services/auth.service';
import { DemoService } from '../../../services/demo.service';

// Plan feature access map
const PLAN_FEATURES: Record<string, string[]> = {
  free: ['page_views', 'clicks'],
  pro: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility',
        'unique_visitors', 'sessions', 'performance', 'utm_attribution', 'user_identity', 'custom_events'],
  enterprise: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility',
               'unique_visitors', 'sessions', 'performance', 'utm_attribution', 'user_identity',
               'custom_events', 'client_hints', 'form_tracking', 'error_tracking', 'rage_clicks',
               'dead_clicks', 'web_vitals', 'resource_timing', 'heatmap_data', 'custom_dimensions'],
};

export interface ClickData {
  label: string;
  clickType: string;
  count: number;
  page?: string;
}

export interface EventData {
  name: string;
  count: number;
  lastSeen?: string;
}

export interface FormInteractionData {
  formId: string;
  submissions: number;
  abandons: number;
  avgTimeToComplete: number;
  conversionRate: number;
  fieldInteractions: number;
}

@Component({
  selector: 'app-dashboard-overview',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ChartModule, SelectModule, TableModule, TagModule, DatePickerModule, PopoverModule, ButtonModule, ProgressSpinnerModule, SkeletonModule, TooltipModule],

  templateUrl: './overview.html',
  styleUrl: './overview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardOverview implements OnInit, OnDestroy {
  private dateRangeSubject = new BehaviorSubject<DateRange | null>(null);
  dateRange$ = this.dateRangeSubject.asObservable();

  metrics: AnalyticsMetrics = {
    liveVisitors: 0,
    totalPageViews: 0,
    conversionRate: 0,
    bounceRate: 0,
    avgSessionDuration: 0,
    newVsReturning: { new: 0, returning: 0 }
  };

  deviceBreakdown: DeviceBreakdown = {
    desktop: 0, mobile: 0, tablet: 0,
    desktopPercentage: 0, mobilePercentage: 0, tabletPercentage: 0
  };

  topPages: PageData[] = [];
  topPagesTotal = 0;
  topPagesPage = 1;
  topPagesRows = 10;
  entryPages: PageData[] = [];
  exitPages: PageData[] = [];
  geoData: GeographicData[] = [];
  pageViewsTrend: PageViewsTrendData[] = [];
  realtimeEvents: RealtimeEvent[] = [];
  trafficSources: TrafficSource[] = [];
  utmSources: UtmSource[] = [];
  browsers: BrowserData[] = [];
  operatingSystems: BrowserData[] = [];
  webVitals: WebVitals = {
    LCP: { avg: null, p75: null, count: 0, rating: 'no-data' },
    FID: { avg: null, p75: null, count: 0, rating: 'no-data' },
    CLS: { avg: null, p75: null, count: 0, rating: 'no-data' }
  };
  topClicks: ClickData[] = [];
  topClicksTotal = 0;
  topClicksPage = 1;
  topClicksRows = 10;
  customEvents: EventData[] = [];
  customEventsTotal = 0;
  customEventsPage = 1;
  customEventsRows = 10;
  formInteractions: FormInteractionData[] = [];
  formInteractionsTotal = 0;
  formInteractionsPage = 1;
  formInteractionsRows = 10;
  tooltipInsights: any[] = [];
  tooltipInsightsTotal = 0;
  tooltipInsightsPage = 1;
  tooltipInsightsRows = 10;
  isLiveEventsActive = true;
  showLiveEvents = true;
  isRefreshing = false;
  private liveEventsSubscription?: Subscription;

  // Overview tabs management (reduced to 2 tabs)
  activeTab = 'metrics';
  overviewTabs = [
    { id: 'metrics', label: 'Analytics Overview', icon: 'pi pi-chart-bar' },
    { id: 'live', label: 'Live Events', icon: 'pi pi-bolt' }
  ];

  // Loading states
  loadingStates = {
    metrics: false,
    pageViews: false,
    devices: false,
    geography: false,
    topPages: false,
    entryExit: false,
    conversion: false,
    features: false,
    liveEvents: false,
    trafficSources: false,
    browsers: false,
    webVitals: false,
    clicks: false,
    customEvents: false,
    formInteractions: false,
    tooltipInsights: false
  };
  
  funnelLabels: string[] = [];
  funnelSteps: number[] = [];

  // Plan gating
  userPlan: 'free' | 'pro' | 'enterprise' = 'free';

  availableApiKeys: ApiKey[] = [];
  selectedApiKey = '';
  isOwner = false;

  // Date range picker
  @ViewChild('datePopover') datePopover!: Popover;
  dateRangeValue: Date[] = [];
  tempDateRange: Date[] = [];
  activePreset = 'Last 7 Days';
  dateRangeLabel = '';

  // Trend period: auto-set based on date range, can be overridden manually
  trendPeriod: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'daily';
  availableTrendPeriods: { label: string; value: 'hourly' | 'daily' | 'weekly' | 'monthly' }[] = [];

  presets = [
    { label: 'Today',         range: () => this.getPresetRange('today') },
    { label: 'Yesterday',     range: () => this.getPresetRange('yesterday') },
    { label: 'This Week',     range: () => this.getPresetRange('thisWeek') },
    { label: 'Last 7 Days',   range: () => this.getPresetRange('last7') },
    { label: 'Last 30 Days',  range: () => this.getPresetRange('last30') },
    { label: 'This Month',    range: () => this.getPresetRange('thisMonth') },
    { label: 'Last Month',    range: () => this.getPresetRange('lastMonth') },
    { label: 'Last 3 Months', range: () => this.getPresetRange('last3months') },
    { label: 'This Year',     range: () => this.getPresetRange('thisYear') },
    { label: 'Last Year',     range: () => this.getPresetRange('lastYear') },
  ];

  // PrimeNG chart data
  barChartData: any = {};
  barChartOptions: any = {};
  doughnutChartData: any = {};
  doughnutChartOptions: any = {};

  private subscriptions = new Subscription();
  private updateInterval: any;
  private currentDateRange: DateRange | null = null;
  
  // Analytics preferences
  enabledFeatures: string[] = [];
  availableFeatures: string[] = [];
  featureDescriptions: Record<string, { label: string; description: string; icon: string }> = {
    page_views: { label: 'Page Views', description: 'Track when users visit pages', icon: 'pi-file' },
    clicks: { label: 'Manual Clicks', description: 'Track clicks you manually trigger', icon: 'pi-hand-point-right' },
    auto_clicks: { label: 'Auto Clicks', description: 'Automatically track all click events', icon: 'pi-hand-point-right' },
    scroll_depth: { label: 'Scroll Depth', description: 'Monitor how far users scroll on pages', icon: 'pi-arrows-v' },
    page_exit: { label: 'Page Exit', description: 'Track when users leave pages', icon: 'pi-sign-out' },
    visibility: { label: 'Page Visibility', description: 'Monitor when page becomes visible/hidden', icon: 'pi-eye' },
    unique_visitors: { label: 'Unique Visitors', description: 'Identify and count unique users', icon: 'pi-users' },
    sessions: { label: 'Sessions', description: 'Track user sessions and duration', icon: 'pi-clock' },
    performance: { label: 'Performance', description: 'Monitor page load times and performance', icon: 'pi-gauge' },
    utm_attribution: { label: 'UTM Tracking', description: 'Track marketing campaign attribution', icon: 'pi-tags' },
    user_identity: { label: 'User Identity', description: 'Link events to identified users', icon: 'pi-id-card' },
    custom_events: { label: 'Custom Events', description: 'Track custom business events', icon: 'pi-star' },
    client_hints: { label: 'Client Hints', description: 'Collect device and browser information', icon: 'pi-mobile' },
    form_tracking: { label: 'Form Tracking', description: 'Monitor form interactions and submissions', icon: 'pi-list' },
    error_tracking: { label: 'Error Tracking', description: 'Capture JavaScript errors and exceptions', icon: 'pi-exclamation-triangle' },
    rage_clicks: { label: 'Rage Clicks', description: 'Detect frustrated user behavior', icon: 'pi-bolt' },
    dead_clicks: { label: 'Dead Clicks', description: 'Track clicks on non-interactive elements', icon: 'pi-times-circle' },
    web_vitals: { label: 'Web Vitals', description: 'Monitor Core Web Vitals (LCP, FID, CLS)', icon: 'pi-chart-line' },
    resource_timing: { label: 'Resource Timing', description: 'Track resource loading performance', icon: 'pi-download' },
    heatmap_data: { label: 'Heatmap Data', description: 'Collect data for click and scroll heatmaps', icon: 'pi-th-large' },
    custom_dimensions: { label: 'Custom Dimensions', description: 'Add custom data to events', icon: 'pi-sliders-h' }
  };

  constructor(
    private analyticsDataService: AnalyticsDataService,
    private analyticsAPIService: AnalyticsAPIService,
    private apiKeysService: ApiKeysService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    public demoService: DemoService
  ) {}

  ngOnInit(): void {
    if (this.demoService.isDemoMode()) {
      this.loadDemoData();
      return;
    }

    console.log('🚀 Overview: Component initializing...');
    
    // Initialize default date range: last 7 days
    this.dateRangeSubject.next({
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate: new Date()
    });
    
    this.initChartOptions();
    this.loadUserPlan();
    this.loadAnalyticsPreferences();
    this.loadAnalyticsDataWithLoading();
    this.loadFeaturesDataWithDelay();
    this.loadLiveEventsWithDelay();
    console.log('📊 Overview: Final user plan after loading:', this.userPlan);
    console.log('🔓 Overview: Testing key features...');
    console.log('   - scroll_depth:', this.hasFeature('scroll_depth'));
    console.log('   - sessions:', this.hasFeature('sessions'));
    this.loadApiKeys();
    this.applyPreset('Last 7 Days');
    // availableTrendPeriods initialized by applyPreset → emitDateRange → computeAvailablePeriods
    if (!this.availableTrendPeriods.length) {
      const end = new Date();
      const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      this.availableTrendPeriods = this.computeAvailablePeriods(start, end);
    }

    this.subscriptions.add(
      this.dateRange$.subscribe(dateRange => {
        this.currentDateRange = dateRange;
        if (this.selectedApiKey) {
          this.loadAllData();
        }
      })
    );

    this.startRealtimeEvents();

    // Funnel: track first time a signed-up user reaches the dashboard (activation)
    const firstVisitKey = 'pulzivo_dashboard_visited';
    if (typeof (window as any).PulzivoAnalytics !== 'undefined' && !localStorage.getItem(firstVisitKey)) {
      localStorage.setItem(firstVisitKey, '1');
      (window as any).PulzivoAnalytics('event', 'dashboard_first_visit', {});
    }
  }

  ngOnDestroy(): void {
    this.stopLiveEvents();
    this.subscriptions.unsubscribe();
    if (this.updateInterval) clearInterval(this.updateInterval);
  }

  private loadDemoData(): void {
    const d = this.demoService;
    this.userPlan = 'pro';
    this.isOwner = false;
    this.availableApiKeys = [{ apiKey: 'DEMO-KEY', name: 'demo-site.com', isActive: true } as any];
    this.selectedApiKey = 'DEMO-KEY';
    this.activePreset = 'Last 7 Days';
    this.availableTrendPeriods = [
      { label: 'Daily', value: 'daily' },
      { label: 'Weekly', value: 'weekly' }
    ];
    this.metrics = { ...d.overviewMetrics } as any;
    this.deviceBreakdown = d.deviceBreakdown as any;
    this.topPages = d.topPages as any;
    this.geoData = d.geoData as any;
    this.trafficSources = d.trafficSources as any;
    this.topClicks = d.topClicks as any;
    this.customEvents = d.customEvents as any;
    this.browsers = d.browsers as any;
    this.utmSources = d.utmSources as any;
    this.webVitals = d.webVitals as any;
    this.funnelLabels = d.funnelData.labels;
    this.funnelSteps = d.funnelData.steps;
    this.realtimeEvents = d.realtimeEvents as any;
    this.enabledFeatures = ['page_views', 'clicks', 'scroll_depth', 'unique_visitors', 'sessions', 'custom_events', 'web_vitals', 'rage_clicks', 'dead_clicks', 'form_tracking'];
    this.availableFeatures = [...this.enabledFeatures];
    this.initChartOptions();
    this.barChartData = d.barChartData;
    this.doughnutChartData = d.doughnutChartData;
    Object.keys(this.loadingStates).forEach(k => (this.loadingStates as any)[k] = false);
    this.cdr.markForCheck();
  }

  private loadUserPlan(): void {
    const user = this.authService.getUserData();
    console.log('🔍 Overview: Loading user data:', user);
    console.log('🔍 Overview: User role:', user?.role);
    console.log('🔍 Overview: User plan:', user?.plan);
    
    if (user && user.plan) {
      this.userPlan = user.plan;
      console.log('✅ Overview: User plan set to:', this.userPlan);
    } else {
      console.log('⚠️ Overview: No user plan found, defaulting to free');
      this.userPlan = 'free';
    }
    
    // Special handling for owner role
    if (user?.role === 'owner') {
      console.log('👑 Overview: Owner detected - granting enterprise access');
      this.userPlan = 'enterprise';
      this.isOwner = true;
    }
  }

  private loadAnalyticsPreferences(): void {
    // Get available features for the plan
    const PLAN_FEATURES: Record<string, string[]> = {
      free: ['page_views', 'clicks'],
      pro: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'performance', 'utm_attribution', 'user_identity', 'custom_events'],
      enterprise: ['page_views', 'clicks', 'auto_clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'performance', 'utm_attribution', 'user_identity', 'custom_events', 'client_hints', 'form_tracking', 'error_tracking', 'rage_clicks', 'dead_clicks', 'web_vitals', 'resource_timing', 'heatmap_data', 'custom_dimensions']
    };
    
    this.availableFeatures = PLAN_FEATURES[this.userPlan] || PLAN_FEATURES['free'];
    
    // Load enabled preferences from localStorage
    const savedPreferences = localStorage.getItem('analytics_preferences');
    if (savedPreferences) {
      try {
        this.enabledFeatures = JSON.parse(savedPreferences).filter((feature: string) => 
          this.availableFeatures.includes(feature)
        );
      } catch (e) {
        console.warn('Failed to parse analytics preferences from localStorage');
        this.enabledFeatures = [...this.availableFeatures];
      }
    } else {
      // Default to all available features enabled
      this.enabledFeatures = [...this.availableFeatures];
    }
    
    console.log('📊 Overview: Loaded analytics preferences:', {
      plan: this.userPlan,
      available: this.availableFeatures.length,
      enabled: this.enabledFeatures.length,
      features: this.enabledFeatures
    });
  }

  private initChartOptions(): void {
    const documentStyle = getComputedStyle(document.documentElement);

    this.barChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          titleFont: { size: 12 },
          bodyFont: { size: 13 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx: any) => ` ${ctx.parsed.y.toLocaleString()} views`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: '#94a3b8', font: { size: 11 } },
          grid: { color: '#f1f5f9' },
          border: { display: false }
        },
        x: {
          ticks: { maxTicksLimit: 7, color: '#94a3b8', font: { size: 11 } },
          grid: { display: false },
          border: { display: false }
        }
      }
    };

    this.doughnutChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      cutout: '65%'
    };

    // Initial empty data
    this.barChartData = {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: '#2a6df6',
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 24
      }]
    };

    this.doughnutChartData = {
      labels: ['Desktop', 'Mobile', 'Tablet'],
      datasets: [{
        data: [0, 0, 0],
        backgroundColor: ['#2a6df6', '#6f41ff', '#f59e0b'],
        hoverBackgroundColor: ['#1d5fd6', '#5a32d6', '#d97706'],
        borderWidth: 0
      }]
    };
  }

  private loadApiKeys(): void {
    this.subscriptions.add(
      this.apiKeysService.getApiKeys().subscribe({
        next: (response) => {
          this.availableApiKeys = (response.apiKeys || []).filter(k => k.isActive !== false);
          if (this.availableApiKeys.length > 0 && !this.selectedApiKey) {
            this.selectedApiKey = this.availableApiKeys[0].apiKey;
            this.apiKeysService.setSelectedApiKey(this.selectedApiKey);
            this.loadAllData();
          } else if (this.availableApiKeys.length === 0) {
            // No API keys: user has no data to view
            this.selectedApiKey = '';
            this.apiKeysService.setSelectedApiKey(null);
            this.clearAllData();
          }
          this.cdr.markForCheck();
        },
        error: () => { this.availableApiKeys = []; this.clearAllData(); this.cdr.markForCheck(); }
      })
    );
  }

  onApiKeyChange(): void {
    // Stop any ongoing updates and subscriptions
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subscription();
    
    if (this.selectedApiKey) {
      this.apiKeysService.setSelectedApiKey(this.selectedApiKey);
      // Clear old data first to show loading state
      this.clearAllData();
      // Load ALL fresh data with new API key (including tooltip insights)
      this.loadAnalyticsDataWithLoading();
    } else {
      this.clearAllData();
    }
  }

  private loadAllData(): void {
    if (!this.selectedApiKey) return;

    // Load metrics
    this.subscriptions.add(
      this.analyticsAPIService.getRealtimeMetrics(this.currentDateRange ?? undefined).subscribe(data => {
        if (data && Object.keys(data).length > 0) { this.metrics = data; }
        this.cdr.markForCheck();
      })
    );

    // Load page views trend
    this.subscriptions.add(
      this.analyticsDataService.getPageViewsTrend(this.currentDateRange ?? undefined, this.trendPeriod).subscribe(data => {
        this.pageViewsTrend = Array.isArray(data) ? data : [];
        this.updateBarChart();
        this.cdr.markForCheck();
      })
    );

    // Load device breakdown
    this.subscriptions.add(
      this.analyticsDataService.getDeviceBreakdown(this.currentDateRange || undefined, this.selectedApiKey).subscribe(data => {
        this.deviceBreakdown = data;
        this.updateDoughnutChart();
        this.cdr.markForCheck();
      })
    );

    // Load geo data
    this.subscriptions.add(
      this.analyticsDataService.getGeographicData(this.currentDateRange || undefined, this.selectedApiKey).subscribe(data => {
        this.geoData = Array.isArray(data) ? data : [];
        this.cdr.markForCheck();
      })
    );

    // Load funnel
    this.subscriptions.add(
      this.analyticsDataService.getConversionFunnel(this.currentDateRange || undefined, this.selectedApiKey).subscribe(data => {
        this.funnelLabels = data.labels || [];
        this.funnelSteps = data.steps?.map((s: any) => s.conversion) || [];
        this.cdr.markForCheck();
      })
    );

    // Start periodic refresh
    this.startRealtimeUpdates();
  }

  private startRealtimeUpdates(): void {
    if (this.demoService.isDemoMode()) return;
    if (this.updateInterval) clearInterval(this.updateInterval);
    this.updateInterval = setInterval(() => {
      if (this.selectedApiKey) {
        this.subscriptions.add(
          this.analyticsAPIService.getRealtimeMetrics().subscribe(data => {
            if (data && Object.keys(data).length > 0) { this.metrics = data; this.cdr.markForCheck(); }
          })
        );
      }
    }, 30000);
  }

  manualRefresh(): void {
    if (this.demoService.isDemoMode() || this.isRefreshing || !this.selectedApiKey) return;
    
    this.isRefreshing = true;
    this.cdr.markForCheck();

    // Reload all data
    this.loadAllData();

    // Reset the auto-refresh timer (restart the 30s countdown)
    this.startRealtimeUpdates();

    // Stop the loading spinner after a brief delay
    setTimeout(() => {
      this.isRefreshing = false;
      this.cdr.markForCheck();
    }, 1000);
  }

  private startRealtimeEvents(): void {
    if (!this.isLiveEventsActive) return;
    
    this.liveEventsSubscription = this.analyticsDataService.getRealtimeEvents().subscribe({
      next: (event) => {
        // Add new event to the beginning of the array
        this.realtimeEvents.unshift(event);
        // Keep only the latest 15 events
        if (this.realtimeEvents.length > 15) {
          this.realtimeEvents = this.realtimeEvents.slice(0, 15);
        }
        this.cdr.markForCheck();
        console.log('[Dashboard] Live event received:', event);
      },
      error: (error) => {
        console.error('[Dashboard] SSE error:', error);
      }
    });
    
    this.subscriptions.add(this.liveEventsSubscription);
  }

  toggleLiveEvents(): void {
    this.isLiveEventsActive = !this.isLiveEventsActive;
    
    if (this.isLiveEventsActive) {
      this.startRealtimeEvents();
    } else {
      this.stopLiveEvents();
    }
    
    this.cdr.markForCheck();
  }

  private stopLiveEvents(): void {
    if (this.liveEventsSubscription) {
      this.liveEventsSubscription.unsubscribe();
      this.liveEventsSubscription = undefined;
    }
  }

  toggleLiveEventsVisibility(): void {
    this.showLiveEvents = !this.showLiveEvents;
    this.cdr.markForCheck();
  }

  clearLiveEvents(): void {
    this.realtimeEvents = [];
    this.cdr.markForCheck();
  }

  private clearAllData(): void {
    this.metrics = {
      liveVisitors: 0, totalPageViews: 0, conversionRate: 0,
      bounceRate: 0, avgSessionDuration: 0, newVsReturning: { new: 0, returning: 0 }
    };
    this.deviceBreakdown = { desktop: 0, mobile: 0, tablet: 0, desktopPercentage: 0, mobilePercentage: 0, tabletPercentage: 0 };
    this.topPages = [];
    this.geoData = [];
    this.funnelLabels = [];
    this.funnelSteps = [];
    this.realtimeEvents = [];
    this.trafficSources = [];
    this.utmSources = [];
    this.browsers = [];
    this.operatingSystems = [];
    this.webVitals = {
      LCP: { avg: null, p75: null, count: 0, rating: 'no-data' },
      FID: { avg: null, p75: null, count: 0, rating: 'no-data' },
      CLS: { avg: null, p75: null, count: 0, rating: 'no-data' }
    };
    this.topClicks = [];
    this.customEvents = [];
    this.tooltipInsights = [];
    this.tooltipInsightsTotal = 0;
    this.updateBarChart();
    this.updateDoughnutChart();
  }

  // Tab management methods
  setActiveTab(tabId: string): void {
    this.activeTab = tabId;
    this.cdr.markForCheck();
    
    // Load data for specific tab if needed
    if (tabId === 'live' && !this.isLiveEventsActive) {
      this.toggleLiveEvents();
    }
  }

  // Loading management
  private async loadAnalyticsDataWithLoading(): Promise<void> {
    // Always load free-tier data
    this.loadingStates.metrics = true;
    this.loadingStates.pageViews = true;
    this.loadingStates.devices = true;
    this.loadingStates.topPages = true;
    this.loadingStates.clicks = true;
    this.cdr.markForCheck();

    const promises: Promise<void>[] = [
      this.loadMetricsWithDelay(),
      this.loadPageViewsWithDelay(),
      this.loadDevicesWithDelay(),
      this.loadTopPagesWithDelay(),
      this.loadClicksWithDelay(),
    ];

    // Pro+ features — only fetch if user has access
    if (this.hasFeature('sessions')) {
      this.loadingStates.geography = true;
      promises.push(this.loadGeographyWithDelay());
    }
    if (this.hasFeature('page_exit')) {
      this.loadingStates.entryExit = true;
      promises.push(this.loadEntryExitPagesWithDelay());
    }
    if (this.hasFeature('utm_attribution')) {
      this.loadingStates.trafficSources = true;
      promises.push(this.loadTrafficSourcesWithDelay());
    }
    if (this.hasFeature('custom_events')) {
      this.loadingStates.customEvents = true;
      promises.push(this.loadCustomEventsWithDelay());
    }

    // Enterprise-only features — only fetch if user has access
    if (this.hasFeature('client_hints')) {
      this.loadingStates.browsers = true;
      promises.push(this.loadBrowsersWithDelay());
    }
    if (this.hasFeature('web_vitals')) {
      this.loadingStates.webVitals = true;
      promises.push(this.loadWebVitalsWithDelay());
    }
    if (this.hasFeature('form_tracking')) {
      this.loadingStates.formInteractions = true;
      promises.push(this.loadFormInteractionsWithDelay());
    }
    if (this.hasFeature('custom_dimensions')) {
      promises.push(this.loadTooltipInsightsWithDelay());
    }

    this.cdr.markForCheck();

    try {
      await Promise.all(promises);
    } catch (error) {
      console.error('Error loading analytics data:', error);
    }
  }

  private async loadMetricsWithDelay(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.analyticsDataService.getMetrics(this.currentDateRange ?? undefined).subscribe({
          next: (data: AnalyticsMetrics) => {
            this.metrics = data;
            this.loadingStates.metrics = false;
            this.cdr.markForCheck();
            resolve();
          },
          error: () => {
            this.loadingStates.metrics = false;
            this.cdr.markForCheck();
            resolve();
          }
        });
      }, 800 + Math.random() * 1000); // 800-1800ms delay
    });
  }

  private async loadPageViewsWithDelay(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.analyticsDataService.getPageViewsTrend(this.currentDateRange ?? undefined, this.trendPeriod).subscribe({
          next: (data: PageViewsTrendData[]) => {
            this.pageViewsTrend = data;
            this.updateBarChart();
            this.loadingStates.pageViews = false;
            this.cdr.markForCheck();
            resolve();
          },
          error: () => {
            this.loadingStates.pageViews = false;
            this.cdr.markForCheck();
            resolve();
          }
        });
      }, 600 + Math.random() * 800);
    });
  }

  private async loadDevicesWithDelay(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.analyticsDataService.getDeviceBreakdown(this.currentDateRange ?? undefined).subscribe({
          next: (data: DeviceBreakdown) => {
            this.deviceBreakdown = data;
            this.updateDoughnutChart();
            this.loadingStates.devices = false;
            this.cdr.markForCheck();
            resolve();
          },
          error: () => {
            this.loadingStates.devices = false;
            this.cdr.markForCheck();
            resolve();
          }
        });
      }, 700 + Math.random() * 900);
    });
  }

  private async loadGeographyWithDelay(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.analyticsDataService.getGeographicData(this.currentDateRange ?? undefined).subscribe({
          next: (data: GeographicData[]) => {
            this.geoData = data;
            this.loadingStates.geography = false;
            this.cdr.markForCheck();
            resolve();
          },
          error: () => {
            this.loadingStates.geography = false;
            this.cdr.markForCheck();
            resolve();
          }
        });
      }, 500 + Math.random() * 700);
    });
  }

  private async loadTopPagesWithDelay(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.analyticsDataService.getTopPages(this.currentDateRange ?? undefined, 1, this.topPagesRows).subscribe({
          next: (res) => {
            this.topPages = res.pages;
            this.topPagesTotal = res.total;
            this.topPagesPage = 1;
            this.loadingStates.topPages = false;
            this.cdr.markForCheck();
            resolve();
          },
          error: () => {
            this.loadingStates.topPages = false;
            this.cdr.markForCheck();
            resolve();
          }
        });
      }, 400 + Math.random() * 600);
    });
  }

  private async loadEntryExitPagesWithDelay(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        // Load real entry and exit pages from API
        Promise.all([
          this.analyticsAPIService.getEntryPages(this.currentDateRange ?? undefined, 5).toPromise(),
          this.analyticsAPIService.getExitPages(this.currentDateRange ?? undefined, 5).toPromise()
        ]).then(([entryData, exitData]) => {
          this.entryPages = entryData?.pages || [];
          this.exitPages = exitData?.pages || [];
          this.loadingStates.entryExit = false;
          this.cdr.markForCheck();
          resolve();
        }).catch(() => {
          // Fallback to empty arrays on error
          this.entryPages = [];
          this.exitPages = [];
          this.loadingStates.entryExit = false;
          this.cdr.markForCheck();
          resolve();
        });
      }, 500 + Math.random() * 700);
    });
  }

  onTopPageChange(event: any): void {
    const page = Math.floor(event.first / event.rows) + 1;
    const rows = event.rows;
    this.topPagesPage = page;
    this.topPagesRows = rows;
    this.loadingStates.topPages = true;
    this.cdr.markForCheck();
    this.analyticsDataService.getTopPages(this.currentDateRange ?? undefined, page, rows).subscribe({
      next: (res) => {
        this.topPages = res.pages;
        this.loadingStates.topPages = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingStates.topPages = false;
        this.cdr.markForCheck();
      }
    });
  }

  private async loadConversionWithDelay(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.analyticsDataService.getConversionFunnel().subscribe({
          next: (data: ConversionFunnel) => {
            this.funnelLabels = data.labels || [];
            this.funnelSteps = data.values || [];
            this.loadingStates.conversion = false;
            this.cdr.markForCheck();
            resolve();
          },
          error: () => {
            this.loadingStates.conversion = false;
            this.cdr.markForCheck();
            resolve();
          }
        });
      }, 900 + Math.random() * 1100);
    });
  }

  private async loadTrafficSourcesWithDelay(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.analyticsDataService.getTrafficSources(this.currentDateRange ?? undefined).subscribe({
          next: (data) => {
            this.trafficSources = data.sources || [];
            this.utmSources = (data.utmSources || []).filter((utm: any) =>
              !!utm?.source && !!utm?.medium && !!utm?.campaign
            );
            this.loadingStates.trafficSources = false;
            this.cdr.markForCheck();
            resolve();
          },
          error: () => {
            this.loadingStates.trafficSources = false;
            this.cdr.markForCheck();
            resolve();
          }
        });
      }, 600 + Math.random() * 800);
    });
  }

  private async loadBrowsersWithDelay(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.analyticsDataService.getBrowserBreakdown(this.currentDateRange ?? undefined).subscribe({
          next: (data) => {
            this.browsers = data.browsers || [];
            this.operatingSystems = data.operatingSystems || [];
            this.loadingStates.browsers = false;
            this.cdr.markForCheck();
            resolve();
          },
          error: () => {
            this.loadingStates.browsers = false;
            this.cdr.markForCheck();
            resolve();
          }
        });
      }, 700 + Math.random() * 900);
    });
  }

  private async loadWebVitalsWithDelay(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.analyticsDataService.getWebVitals(this.currentDateRange ?? undefined).subscribe({
          next: (data: WebVitals) => {
            this.webVitals = data;
            this.loadingStates.webVitals = false;
            this.cdr.markForCheck();
            resolve();
          },
          error: () => {
            this.loadingStates.webVitals = false;
            this.cdr.markForCheck();
            resolve();
          }
        });
      }, 1000 + Math.random() * 1000);
    });
  }

  private async loadClicksWithDelay(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.analyticsAPIService.getClicksBreakdown(this.currentDateRange ?? undefined, 1, this.topClicksRows).subscribe({
          next: (res) => {
            this.topClicks = res.clicks.map((d: any) => ({
              label: d.label ? `${d.element || 'ELEMENT'}["${d.label}"]` : (d.element || 'unknown'),
              clickType: 'click',
              count: d.count || 0,
              page: d.page || ''
            }));
            this.topClicksTotal = res.total;
            this.topClicksPage = 1;
            this.loadingStates.clicks = false;
            this.cdr.markForCheck();
            resolve();
          },
          error: () => {
            this.loadingStates.clicks = false;
            this.cdr.markForCheck();
            resolve();
          }
        });
      }, 800 + Math.random() * 700);
    });
  }

  onTopClicksChange(event: any): void {
    if (!this.hasFeature('clicks')) return;
    const page = Math.floor(event.first / event.rows) + 1;
    this.topClicksPage = page;
    this.topClicksRows = event.rows;
    this.loadingStates.clicks = true;
    this.cdr.markForCheck();
    this.analyticsAPIService.getClicksBreakdown(this.currentDateRange ?? undefined, page, event.rows).subscribe({
      next: (res) => {
        this.topClicks = res.clicks.map((d: any) => ({
          label: d.label ? `${d.element || 'ELEMENT'}["${d.label}"]` : (d.element || 'unknown'),
          clickType: 'click',
          count: d.count || 0,
          page: d.page || ''
        }));
        this.loadingStates.clicks = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loadingStates.clicks = false; this.cdr.markForCheck(); }
    });
  }

  private async loadCustomEventsWithDelay(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.analyticsAPIService.getCustomEventsBreakdown(this.currentDateRange ?? undefined, 1, this.customEventsRows).subscribe({
          next: (res) => {
            this.customEvents = res.customEvents.map((d: any) => ({
              name: d.name || d.event_name || 'unknown',
              count: d.count || 0,
              lastSeen: d.last_seen || d.lastSeen
            }));
            this.customEventsTotal = res.total;
            this.customEventsPage = 1;
            this.loadingStates.customEvents = false;
            this.cdr.markForCheck();
            resolve();
          },
          error: () => {
            this.loadingStates.customEvents = false;
            this.cdr.markForCheck();
            resolve();
          }
        });
      }, 900 + Math.random() * 800);
    });
  }

  onCustomEventsChange(event: any): void {
    if (!this.hasFeature('custom_events')) return;
    const page = Math.floor(event.first / event.rows) + 1;
    this.customEventsPage = page;
    this.customEventsRows = event.rows;
    this.loadingStates.customEvents = true;
    this.cdr.markForCheck();
    this.analyticsAPIService.getCustomEventsBreakdown(this.currentDateRange ?? undefined, page, event.rows).subscribe({
      next: (res) => {
        this.customEvents = res.customEvents.map((d: any) => ({
          name: d.name || d.event_name || 'unknown',
          count: d.count || 0,
          lastSeen: d.last_seen || d.lastSeen
        }));
        this.loadingStates.customEvents = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loadingStates.customEvents = false; this.cdr.markForCheck(); }
    });
  }

  private async loadFormInteractionsWithDelay(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.loadingStates.formInteractions = true;
        
        // Use real API call instead of mock data
        this.analyticsAPIService.getFormInteractions(
          this.currentDateRange || undefined,
          this.formInteractionsPage,
          this.formInteractionsRows
        ).subscribe({
          next: (response) => {
            this.formInteractions = response.forms || [];
            this.formInteractionsTotal = response.total || 0;
            this.loadingStates.formInteractions = false;
            this.cdr.markForCheck();
            resolve();
          },
          error: (error) => {
            console.error('Error loading form interactions:', error);
            this.formInteractions = [];
            this.formInteractionsTotal = 0;
            this.loadingStates.formInteractions = false;
            this.cdr.markForCheck();
            resolve();
          }
        });
      }, 850 + Math.random() * 750);
    });
  }

  private async loadTooltipInsightsWithDelay(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.loadingStates.tooltipInsights = true;
        this.analyticsAPIService.getTooltipInsights(
          this.currentDateRange || undefined,
          this.tooltipInsightsPage,
          this.tooltipInsightsRows
        ).subscribe({
          next: (response) => {
            this.tooltipInsights = response.tooltips || [];
            this.tooltipInsightsTotal = response.total || 0;
            this.loadingStates.tooltipInsights = false;
            this.cdr.markForCheck();
            resolve();
          },
          error: () => {
            this.tooltipInsights = [];
            this.tooltipInsightsTotal = 0;
            this.loadingStates.tooltipInsights = false;
            this.cdr.markForCheck();
            resolve();
          }
        });
      }, 900 + Math.random() * 500);
    });
  }

  onTooltipInsightsChange(event: any): void {
    if (!this.hasFeature('custom_dimensions')) return;
    const page = Math.floor(event.first / event.rows) + 1;
    this.tooltipInsightsPage = page;
    this.tooltipInsightsRows = event.rows;
    this.loadingStates.tooltipInsights = true;
    this.cdr.markForCheck();

    this.analyticsAPIService.getTooltipInsights(
      this.currentDateRange || undefined,
      page,
      event.rows
    ).subscribe({
      next: (response) => {
        this.tooltipInsights = response.tooltips || [];
        this.tooltipInsightsTotal = response.total || 0;
        this.loadingStates.tooltipInsights = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.tooltipInsights = [];
        this.tooltipInsightsTotal = 0;
        this.loadingStates.tooltipInsights = false;
        this.cdr.markForCheck();
      }
    });
  }

  onFormInteractionsChange(event: any): void {
    if (!this.hasFeature('form_tracking')) return;
    const page = Math.floor(event.first / event.rows) + 1;
    this.formInteractionsPage = page;
    this.formInteractionsRows = event.rows;
    this.loadingStates.formInteractions = true;
    this.cdr.markForCheck();
    
    // Call API with new pagination parameters
    this.analyticsAPIService.getFormInteractions(
      this.currentDateRange || undefined,
      page,
      event.rows
    ).subscribe({
      next: (response) => {
        this.formInteractions = response.forms || [];
        this.formInteractionsTotal = response.total || 0;
        this.loadingStates.formInteractions = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error loading form interactions:', error);
        this.loadingStates.formInteractions = false;
        this.cdr.markForCheck();
      }
    });
  }

  private async loadFeaturesDataWithDelay(): Promise<void> {
    this.loadingStates.features = true;
    this.cdr.markForCheck();
    
    return new Promise(resolve => {
      setTimeout(() => {
        // Simulate loading features data
        this.loadingStates.features = false;
        this.cdr.markForCheck();
        resolve();
      }, 1200 + Math.random() * 800);
    });
  }

  private async loadLiveEventsWithDelay(): Promise<void> {
    this.loadingStates.liveEvents = true;
    this.cdr.markForCheck();
    
    return new Promise(resolve => {
      setTimeout(() => {
        this.loadingStates.liveEvents = false;
        this.cdr.markForCheck();
        resolve();
      }, 600 + Math.random() * 400);
    });
  }

  private updateBarChart(): void {
    this.barChartData = {
      ...this.barChartData,
      labels: this.pageViewsTrend.map(item => {
        const raw = item.date;
        if (this.trendPeriod === 'hourly') {
          // Format: "2025-01-15T14:00" → "2 PM"
          const d = new Date(raw + ':00');
          return d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
        }
        if (this.trendPeriod === 'weekly') {
          // Format: "2025-W05" — show as "Week 5"
          const parts = raw.split('-W');
          return parts.length === 2 ? `W${parts[1]}` : raw;
        }
        if (this.trendPeriod === 'monthly') {
          // Format: "2025-01" → "Jan 25"
          const [y, m] = raw.split('-');
          const d = new Date(Number(y), Number(m) - 1, 1);
          return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        }
        // daily: "2025-01-15" → "Jan 15"
        const date = new Date(raw + 'T00:00:00');
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      datasets: [{
        ...this.barChartData.datasets[0],
        data: this.pageViewsTrend.map(item => item.pageViews)
      }]
    };
  }

  private updateDoughnutChart(): void {
    this.doughnutChartData = {
      ...this.doughnutChartData,
      datasets: [{
        ...this.doughnutChartData.datasets[0],
        data: [
          this.deviceBreakdown.desktopPercentage || 0,
          this.deviceBreakdown.mobilePercentage || 0,
          this.deviceBreakdown.tabletPercentage || 0
        ]
      }]
    };
  }

  // Helpers
  formatNumber(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  getTimeAgo(timestamp: Date | string): string {
    const now = new Date();
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  getEventIcon(eventName: string): string {
    switch (eventName) {
      case 'page_view': case 'navigation': return 'pi pi-eye';
      case 'click': return 'pi pi-mouse';
      case 'scroll': return 'pi pi-arrows-v';
      case 'form_submit': return 'pi pi-pencil';
      case 'purchase': return 'pi pi-shopping-cart';
      case 'user_sign_in': case 'user_login': return 'pi pi-sign-in';
      case 'user_sign_up': case 'user_register': return 'pi pi-user-plus';
      case 'user_sign_in_failed': case 'user_login_failed': return 'pi pi-times-circle';
      case 'user_sign_out': case 'user_logout': return 'pi pi-sign-out';
      default: return 'pi pi-bolt';
    }
  }

  isAuthEvent(eventName: string): boolean {
    const authEvents = [
      'user_sign_in', 'user_login', 
      'user_sign_up', 'user_register',
      'user_sign_in_failed', 'user_login_failed',
      'user_sign_out', 'user_logout'
    ];
    return authEvents.includes(eventName);
  }

  // Date range picker
  private getPresetRange(key: string): Date[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    switch (key) {
      case 'today':
        return [new Date(today), end];
      case 'yesterday': {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        const ye = new Date(y);
        ye.setHours(23, 59, 59, 999);
        return [y, ye];
      }
      case 'thisWeek': {
        const s = new Date(today);
        const day = s.getDay(); // 0=Sun, 1=Mon...
        s.setDate(s.getDate() - (day === 0 ? 6 : day - 1)); // Monday start
        return [s, end];
      }
      case 'last7': {
        const s = new Date(today);
        s.setDate(s.getDate() - 6);
        return [s, end];
      }
      case 'last30': {
        const s = new Date(today);
        s.setDate(s.getDate() - 29);
        return [s, end];
      }
      case 'thisMonth':
        return [new Date(today.getFullYear(), today.getMonth(), 1), end];
      case 'lastMonth': {
        const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const e = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
        return [s, e];
      }
      case 'last3months': {
        const s = new Date(today);
        s.setMonth(s.getMonth() - 3);
        return [s, end];
      }
      case 'thisYear':
        return [new Date(today.getFullYear(), 0, 1), end];
      case 'lastYear': {
        const s = new Date(today.getFullYear() - 1, 0, 1);
        const e = new Date(today.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        return [s, e];
      }
      default:
        return [new Date(today), end];
    }
  }

  applyPreset(label: string): void {
    this.activePreset = label;
    const preset = this.presets.find(p => p.label === label);
    if (preset) {
      const range = preset.range();
      if (range) {
        this.tempDateRange = [...range];
        this.dateRangeValue = [...range];
        this.updateDateLabel();
        this.emitDateRange();
      }
    }
  }

  onCalendarSelect(): void {
    this.activePreset = 'Custom Range';
    if (this.tempDateRange.length === 2 && this.tempDateRange[1]) {
      this.dateRangeValue = [...this.tempDateRange];
    }
  }

  onDateRangeChange(date: any): void {
    this.tempDateRange = date;
  }

  applyCustomDateRange(): void {
    this.applyDateRange();
  }

  applyDateRange(): void {
    if (this.tempDateRange.length === 2 && this.tempDateRange[1]) {
      this.dateRangeValue = [...this.tempDateRange];
      this.updateDateLabel();
      this.emitDateRange();
      this.datePopover.hide();
    }
  }

  cancelDateRange(): void {
    this.tempDateRange = [...this.dateRangeValue];
    this.datePopover.hide();
  }

  clearDateRange(): void {
    this.tempDateRange = [];
    this.dateRangeValue = [];
    this.activePreset = '';
    this.dateRangeLabel = '';
  }

  private updateDateLabel(): void {
    if (this.dateRangeValue.length === 2 && this.dateRangeValue[0] && this.dateRangeValue[1]) {
      const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
      this.dateRangeLabel = `${fmt(this.dateRangeValue[0])} - ${fmt(this.dateRangeValue[1])}`;
    }
  }

  private emitDateRange(): void {
    if (this.dateRangeValue.length === 2 && this.dateRangeValue[0] && this.dateRangeValue[1]) {
      this.currentDateRange = {
        startDate: this.dateRangeValue[0],
        endDate: this.dateRangeValue[1]
      };
      this.trendPeriod = this.autoTrendPeriod(this.dateRangeValue[0], this.dateRangeValue[1]);
      this.availableTrendPeriods = this.computeAvailablePeriods(this.dateRangeValue[0], this.dateRangeValue[1]);
      if (this.selectedApiKey) {
        this.loadAllData();
      }
      this.cdr.markForCheck();
    }
  }

  /** Returns the best default period for a given date range span */
  private autoTrendPeriod(start: Date, end: Date): 'hourly' | 'daily' | 'weekly' | 'monthly' {
    const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (days <= 2)   return 'hourly';
    if (days <= 90)  return 'daily';
    if (days <= 365) return 'weekly';
    return 'monthly';
  }

  /** Returns which period buttons should be shown for a given span */
  private computeAvailablePeriods(start: Date, end: Date): { label: string; value: 'hourly' | 'daily' | 'weekly' | 'monthly' }[] {
    const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    const all: { label: string; value: 'hourly' | 'daily' | 'weekly' | 'monthly'; minDays: number; maxDays: number }[] = [
      { label: 'Hour',  value: 'hourly',  minDays: 0,   maxDays: 7 },
      { label: 'Day',   value: 'daily',   minDays: 0,   maxDays: 180 },
      { label: 'Week',  value: 'weekly',  minDays: 14,  maxDays: 730 },
      { label: 'Month', value: 'monthly', minDays: 60,  maxDays: Infinity },
    ];
    return all
      .filter(p => days >= p.minDays && days <= p.maxDays)
      .map(({ label, value }) => ({ label, value }));
  }

  setTrendPeriod(period: 'hourly' | 'daily' | 'weekly' | 'monthly'): void {
    this.trendPeriod = period;
    this.loadPageViewsWithDelay();
  }

  toggleDatePopover(event: Event): void {
    this.tempDateRange = [...this.dateRangeValue];
    this.datePopover.toggle(event);
  }

  // Plan gating helpers
  hasFeature(feature: string): boolean {
    const user = this.authService.getUserData();
    if (user?.role === 'owner') return true;
    return (PLAN_FEATURES[this.userPlan] || []).includes(feature);
  }

  isPlanAtLeast(plan: 'free' | 'pro' | 'enterprise'): boolean {
    const user = this.authService.getUserData();
    if (user?.role === 'owner') return true;
    const order: Record<string, number> = { free: 0, pro: 1, enterprise: 2 };
    return (order[this.userPlan] ?? 0) >= order[plan];
  }

  upgradeRequired(feature: string): 'pro' | 'enterprise' {
    const enterpriseOnly = ['client_hints', 'form_tracking', 'error_tracking', 'rage_clicks',
      'dead_clicks', 'web_vitals', 'resource_timing', 'heatmap_data', 'custom_dimensions'];
    return enterpriseOnly.includes(feature) ? 'enterprise' : 'pro';
  }

  getUpgradePlan(): string {
    return this.userPlan === 'free' ? 'Pro' : 'Enterprise';
  }

  // ── Feature Analytics Methods ──
  isFeatureEnabled(feature: string): boolean {
    return this.enabledFeatures.includes(feature);
  }

  getPageViewsTrend(): { value: number; percentage: number }[] {
    if (!this.pageViewsTrend.length) {
      return Array(7).fill(0).map(() => ({ value: 0, percentage: 0 }));
    }
    
    const maxValue = Math.max(...this.pageViewsTrend.map(item => item.pageViews));
    return this.pageViewsTrend.slice(-7).map(item => ({
      value: item.pageViews,
      percentage: maxValue > 0 ? (item.pageViews / maxValue) * 100 : 0
    }));
  }

  getClicksData(): { total: number; rate: number } {
    const totalViews = this.metrics.totalPageViews || 1;
    const estimatedClicks = Math.floor(totalViews * 0.15); // Simulate 15% click rate
    return {
      total: estimatedClicks,
      rate: parseFloat(((estimatedClicks / totalViews) * 100).toFixed(1))
    };
  }

  getTopClickElements(): { selector: string; clicks: number }[] {
    return [
      { selector: '.cta-button', clicks: 1247 },
      { selector: '.nav-link', clicks: 892 },
      { selector: '.product-card', clicks: 678 },
      { selector: '.header-logo', clicks: 234 }
    ].slice(0, 4);
  }

  getScrollData(): { average: number; fullScroll: number } {
    return {
      average: 67,
      fullScroll: 23
    };
  }

  getScrollDepthDistribution(): { range: string; percentage: number }[] {
    return [
      { range: '0-25%', percentage: 85 },
      { range: '25-50%', percentage: 72 },
      { range: '50-75%', percentage: 45 },
      { range: '75-100%', percentage: 23 }
    ];
  }

  getSessionData(): { total: number } {
    return {
      total: Math.floor((this.metrics.totalPageViews || 0) * 0.7)
    };
  }

  getSessionDurationSegments(): { label: string; percentage: number; count: number }[] {
    const total = this.getSessionData().total;
    return [
      { label: '0-30s', percentage: 35, count: Math.floor(total * 0.35) },
      { label: '30s-2m', percentage: 28, count: Math.floor(total * 0.28) },
      { label: '2-5m', percentage: 22, count: Math.floor(total * 0.22) },
      { label: '5m+', percentage: 15, count: Math.floor(total * 0.15) }
    ];
  }

  getPerformanceData(): { avgLoad: number; lcp: number; fid: number; cls: number } {
    return {
      avgLoad: 1250,
      lcp: 2.1,
      fid: 85,
      cls: 0.08
    };
  }

  getPerformanceGrade(): string {
    const perf = this.getPerformanceData();
    if (perf.lcp <= 2.5 && perf.fid <= 100 && perf.cls <= 0.1) return 'good';
    if (perf.lcp <= 4.0 && perf.fid <= 300 && perf.cls <= 0.25) return 'fair';
    return 'poor';
  }

  getPerformanceMetric(metric: 'lcp' | 'fid' | 'cls'): number {
    const perf = this.getPerformanceData();
    const thresholds = {
      lcp: { good: 2.5, poor: 4.0 },
      fid: { good: 100, poor: 300 },
      cls: { good: 0.1, poor: 0.25 }
    };
    
    const value = perf[metric];
    const threshold = thresholds[metric];
    
    if (metric === 'cls') {
      return Math.min((value / threshold.poor) * 100, 100);
    } else {
      return Math.min((value / threshold.poor) * 100, 100);
    }
  }

  getCustomEventsData(): { total: number; types: number } {
    return {
      total: 3420,
      types: 8
    };
  }

  getTopCustomEvents(): { name: string; count: number; percentage: number }[] {
    const events = [
      { name: 'button_click', count: 1205 },
      { name: 'form_submit', count: 892 },
      { name: 'video_play', count: 634 },
      { name: 'download', count: 384 },
      { name: 'signup', count: 305 }
    ];
    
    const maxCount = Math.max(...events.map(e => e.count));
    return events.map(event => ({
      ...event,
      percentage: (event.count / maxCount) * 100
    }));
  }

  getErrorData(): { total: number; rate: number } {
    return {
      total: 12,
      rate: 0.3
    };
  }

  getRecentErrors(): { id: string; message: string; timestamp: string; count: number }[] {
    return [
      {
        id: '1',
        message: 'TypeError: Cannot read property of undefined',
        timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        count: 3
      },
      {
        id: '2', 
        message: 'ReferenceError: analytics is not defined',
        timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        count: 2
      }
    ].slice(0, 3);
  }

  getDataCollectionRate(): number {
    return 94; // Simulate 94% data collection rate
  }

  getFeatureCategory(feature: string): string {
    const categories: Record<string, string> = {
      page_views: 'core',
      clicks: 'core', 
      auto_clicks: 'core',
      scroll_depth: 'engagement',
      page_exit: 'engagement',
      visibility: 'engagement',
      unique_visitors: 'users',
      sessions: 'users',
      performance: 'technical',
      utm_attribution: 'marketing',
      user_identity: 'users',
      custom_events: 'business',
      client_hints: 'technical',
      form_tracking: 'engagement',
      error_tracking: 'technical',
      rage_clicks: 'engagement',
      dead_clicks: 'engagement',
      web_vitals: 'technical',
      resource_timing: 'technical',
      heatmap_data: 'engagement',
      custom_dimensions: 'business'
    };
    return categories[feature] || 'other';
  }

  getRandomMetricValue(): number {
    return Math.round(Math.random() * 10000 + 1000);
  }
}
