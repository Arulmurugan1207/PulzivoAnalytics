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

// Plan feature access map
const PLAN_FEATURES: Record<string, string[]> = {
  free: ['page_views', 'clicks'],
  pro: ['page_views', 'clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'performance', 'utm_attribution', 'user_identity', 'custom_events', 'csv_export'],
  enterprise: ['page_views', 'clicks', 'scroll_depth', 'page_exit', 'visibility', 'unique_visitors', 'sessions', 'performance', 'utm_attribution', 'user_identity', 'custom_events', 'csv_export', 'client_hints', 'api_access', 'json_export'],
};

@Component({
  selector: 'app-dashboard-overview',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartModule, SelectModule, TableModule, TagModule, DatePickerModule, PopoverModule, ButtonModule, ProgressSpinnerModule, SkeletonModule],
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
  isLiveEventsActive = true;
  showLiveEvents = true;
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
    conversion: false,
    features: false,
    liveEvents: false,
    trafficSources: false,
    browsers: false,
    webVitals: false
  };
  
  funnelLabels: string[] = [];
  funnelSteps: number[] = [];

  // Plan gating
  userPlan: 'free' | 'pro' | 'enterprise' = 'free';

  availableApiKeys: ApiKey[] = [];
  selectedApiKey = '';

  // Date range picker
  @ViewChild('datePopover') datePopover!: Popover;
  dateRangeValue: Date[] = [];
  tempDateRange: Date[] = [];
  activePreset = 'Last 7 Days';
  dateRangeLabel = '';

  presets = [
    { label: 'Today', range: () => this.getPresetRange('today') },
    { label: 'Yesterday', range: () => this.getPresetRange('yesterday') },
    { label: 'Last 7 Days', range: () => this.getPresetRange('last7') },
    { label: 'Last 30 Days', range: () => this.getPresetRange('last30') },
    { label: 'This Month', range: () => this.getPresetRange('thisMonth') },
    { label: 'Last Month', range: () => this.getPresetRange('lastMonth') },
    { label: 'Custom Range', range: () => null },
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
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
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

    this.subscriptions.add(
      this.dateRange$.subscribe(dateRange => {
        this.currentDateRange = dateRange;
        if (this.selectedApiKey) {
          this.loadAllData();
        }
      })
    );

    this.startRealtimeEvents();
  }

  ngOnDestroy(): void {
    this.stopLiveEvents();
    this.subscriptions.unsubscribe();
    if (this.updateInterval) clearInterval(this.updateInterval);
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
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } },
        x: { ticks: { maxTicksLimit: 7 }, grid: { display: false } }
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
          }
          this.cdr.markForCheck();
        },
        error: () => { this.availableApiKeys = []; this.cdr.markForCheck(); }
      })
    );
  }

  onApiKeyChange(): void {
    if (this.selectedApiKey) {
      this.apiKeysService.setSelectedApiKey(this.selectedApiKey);
      this.loadAllData();
    } else {
      this.clearAllData();
    }
  }

  private loadAllData(): void {
    if (!this.selectedApiKey) return;

    // Load metrics
    this.subscriptions.add(
      this.analyticsAPIService.getRealtimeMetrics().subscribe(data => {
        if (data && Object.keys(data).length > 0) { this.metrics = data; }
        this.cdr.markForCheck();
      })
    );

    // Load page views trend
    this.subscriptions.add(
      this.analyticsAPIService.getPageViewsData('7d').subscribe(data => {
        this.pageViewsTrend = data?.trend || [];
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

    // Load top pages
    this.subscriptions.add(
      this.analyticsDataService.getTopPages(this.currentDateRange || undefined, this.selectedApiKey).subscribe(data => {
        this.topPages = Array.isArray(data) ? data : [];
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
    // Start all loading indicators
    this.loadingStates.metrics = true;
    this.loadingStates.pageViews = true;
    this.loadingStates.devices = true;
    this.loadingStates.geography = true;
    this.loadingStates.topPages = true;
    this.loadingStates.conversion = true;
    this.loadingStates.trafficSources = true;
    this.loadingStates.browsers = true;
    this.loadingStates.webVitals = true;
    this.cdr.markForCheck();
    
    try {
      // Load data with realistic delays
      await Promise.all([
        this.loadMetricsWithDelay(),
        this.loadPageViewsWithDelay(),
        this.loadDevicesWithDelay(),
        this.loadGeographyWithDelay(),
        this.loadTopPagesWithDelay(),
        this.loadConversionWithDelay(),
        this.loadTrafficSourcesWithDelay(),
        this.loadBrowsersWithDelay(),
        this.loadWebVitalsWithDelay()
      ]);
    } catch (error) {
      console.error('Error loading analytics data:', error);
    }
  }

  private async loadMetricsWithDelay(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.analyticsDataService.getMetrics().subscribe({
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
        this.analyticsDataService.getPageViewsTrend().subscribe({
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
        this.analyticsDataService.getDeviceBreakdown().subscribe({
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
        this.analyticsDataService.getGeographicData().subscribe({
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
        this.analyticsDataService.getTopPages().subscribe({
          next: (data: PageData[]) => {
            this.topPages = data;
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
        this.analyticsDataService.getTrafficSources().subscribe({
          next: (data) => {
            this.trafficSources = data.sources || [];
            this.utmSources = data.utmSources || [];
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
        this.analyticsDataService.getBrowserBreakdown().subscribe({
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
        this.analyticsDataService.getWebVitals().subscribe({
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
        const date = new Date(item.date);
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
      default: return 'pi pi-bolt';
    }
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
      default:
        return [new Date(today), end];
    }
  }

  applyPreset(label: string): void {
    this.activePreset = label;
    if (label === 'Custom Range') return;
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
      if (this.selectedApiKey) {
        this.loadAllData();
      }
      this.cdr.markForCheck();
    }
  }

  toggleDatePopover(event: Event): void {
    this.tempDateRange = [...this.dateRangeValue];
    this.datePopover.toggle(event);
  }

  // Plan gating helpers
  hasFeature(feature: string): boolean {
    const user = this.authService.getUserData();
    console.log(`🔒 Overview: Checking feature '${feature}' for plan '${this.userPlan}', role '${user?.role}'`);
    
    // Owner role always has access to everything
    if (user?.role === 'owner') {
      console.log(`👑 Overview: Feature '${feature}' ALLOWED (owner role)`);
      return true;
    }
    
    // Non-free users (pro and enterprise) have access to all features
    if (this.userPlan === 'pro' || this.userPlan === 'enterprise') {
      console.log(`✅ Overview: Feature '${feature}' ALLOWED (paid plan: ${this.userPlan})`);
      return true;
    }
    
    // Free users only have access to limited features
    const hasAccess = (PLAN_FEATURES[this.userPlan] || []).includes(feature);
    console.log(`${hasAccess ? '✅' : '❌'} Overview: Feature '${feature}' ${hasAccess ? 'ALLOWED' : 'BLOCKED'} for free plan`);
    console.log(`📋 Overview: Available features for '${this.userPlan}':`, PLAN_FEATURES[this.userPlan]);
    return hasAccess;
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
