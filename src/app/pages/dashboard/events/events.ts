import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChartModule } from 'primeng/chart';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SkeletonModule } from 'primeng/skeleton';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { MultiSelectModule } from 'primeng/multiselect';
import { MenuModule } from 'primeng/menu';
import { TooltipModule } from 'primeng/tooltip';
import { DatePickerModule } from 'primeng/datepicker';
import { PopoverModule } from 'primeng/popover';
import { Subscription, Subject } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';
import { RouterLink } from '@angular/router';
import { AnalyticsAPIService } from '../../../services/analytics-api.service';
import { ApiKeysService, ApiKey } from '../../../services/api-keys.service';
import { AuthService } from '../../../services/auth.service';
import { DemoService } from '../../../services/demo.service';
import { MenuItem } from 'primeng/api';

interface UserColor { bg: string; text: string; border: string; }

interface EventSummary {
  rageClicks: number;
  deadClicks: number;
  formSubmits: number;
  formAbandons: number;
  formFocuses: number;
}

interface EventBreakdown {
  name: string;
  count: number;
  percentage: number;
}

interface TopClick {
  element: string;
  page: string;
  count: number;
}

interface HistoryEvent {
  id: string;
  event_name: string;
  user_id: string;
  session_id: string | null;
  timestamp: string;
  page: string | null;
  country: string | null;
  timezone: string | null;
  device: string | null;
  data: any;
}

interface EventCategory {
  name: string;
  label: string;
  events: string[];
  color: string;
  icon: string;
}

interface FilterOptions {
  countries: string[];
  devices: string[];
  pages: string[];
}

@Component({
  selector: 'app-dashboard-events',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ChartModule,
    SelectModule,
    ButtonModule,
    ProgressSpinnerModule,
    SkeletonModule,
    InputTextModule,
    TagModule,
    DialogModule,
    MultiSelectModule,
    MenuModule,
    TooltipModule,
    DatePickerModule,
    PopoverModule
  ],
  templateUrl: './events.html',
  styleUrl: './events.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardEvents implements OnInit, OnDestroy {
  private subscriptions = new Subscription();
  private historyCancel$ = new Subject<void>();
  private destroy$ = new Subject<void>();

  // Plan gating
  userPlan: 'free' | 'pro' | 'enterprise' = 'free';

  availableApiKeys: ApiKey[] = [];
  selectedApiKey = '';

  loading = { breakdown: true, history: true };

  // Breakdown data
  totalEvents = 0;
  events: EventBreakdown[] = [];
  customEvents: EventBreakdown[] = [];
  topClicks: TopClick[] = [];
  summary: EventSummary = { rageClicks: 0, deadClicks: 0, formSubmits: 0, formAbandons: 0, formFocuses: 0 };

  // History table
  historyEvents: HistoryEvent[] = [];
  historyTotal = 0;
  historyPage = 1;
  historyLimit = 50;
  historyPages = 1;
  jumpToPage = '';
  pageSizeOptions = [
    { label: '25 / page',  value: 25 },
    { label: '50 / page',  value: 50 },
    { label: '100 / page', value: 100 },
  ];
  eventTypes: string[] = [];
  filterEventType = '';
  searchQuery = '';
  private searchTimer: any;

  // Advanced Filters
  showAdvancedFilters = false;
  selectedCountries: string[] = [];
  selectedDevices: string[] = [];
  selectedPages: string[] = [];
  selectedCategories: string[] = [];
  dateRange: { start: Date | null; end: Date | null } = { start: null, end: null };
  
  // Date Range Presets
  datePresets = [
    { label: 'All time',    days: -1 },
    { label: 'Today',       days: 0 },
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 }
  ];
  activePreset = 'All time';
  
  // Helper for template
  get maxDate(): Date {
    return new Date();
  }

  // Filter Options
  filterOptions: FilterOptions = {
    countries: [],
    devices: [],
    pages: []
  };

  // Event Categories
  eventCategories: EventCategory[] = [
    {
      name: 'user_actions',
      label: 'User Actions',
      events: ['click', 'scroll', 'hover', 'input'],
      color: '#2a6df6',
      icon: 'pi-hand-point-right'
    },
    {
      name: 'navigation',
      label: 'Navigation',
      events: ['page_view', 'route_change', 'navigation'],
      color: '#6f41ff',
      icon: 'pi-compass'
    },
    {
      name: 'forms',
      label: 'Forms',
      events: ['form_submit', 'form_abandon', 'form_focus', 'form_blur', 'form_error'],
      color: '#f59e0b',
      icon: 'pi-file-edit'
    },
    {
      name: 'errors',
      label: 'Errors & Issues',
      events: ['error', 'rage_click', 'dead_click', 'javascript_error'],
      color: '#ef4444',
      icon: 'pi-exclamation-triangle'
    },
    {
      name: 'performance',
      label: 'Performance',
      events: ['web_vital_lcp', 'web_vital_fid', 'web_vital_cls', 'resource_timing', 'performance'],
      color: '#22c55e',
      icon: 'pi-gauge'
    },
    {
      name: 'custom',
      label: 'Custom Events',
      events: [],
      color: '#8b5cf6',
      icon: 'pi-star-fill'
    }
  ];

  // Event Detail Modal
  showEventDetail = false;
  selectedEvent: HistoryEvent | null = null;
  modalTab: 'details' | 'timeline' = 'details';

  // Session Timeline
  sessionEvents: HistoryEvent[] = [];
  loadingTimeline = false;
  timelineActiveId: string | null = null;

  // Export Menu
  exportMenuItems: MenuItem[] = [
    {
      label: 'Export as CSV',
      icon: 'pi pi-file',
      command: () => this.exportData('csv')
    },
    {
      label: 'Export as JSON',
      icon: 'pi pi-code',
      command: () => this.exportData('json')
    },
    {
      label: 'Export Filtered Data',
      icon: 'pi pi-filter',
      command: () => this.exportData('csv', true)
    }
  ];

  // Category counts from backend
  categoryCounts: Record<string, number> = {};

  // Donut chart
  donutChartData: any = {};
  donutChartOptions: any = {};

  // Frequency bar chart
  barChartData: any = {};
  barChartOptions: any = {};

  get eventTypeOptions(): { label: string; value: string }[] {
    return [
      { label: 'All Events', value: '' },
      ...this.eventTypes.map(t => ({ label: this.formatEventName(t), value: t }))
    ];
  }

  get countryOptions(): { label: string; value: string }[] {
    return this.filterOptions.countries.map(c => ({ label: c, value: c }));
  }

  get deviceOptions(): { label: string; value: string }[] {
    return this.filterOptions.devices.map(d => ({ label: d, value: d }));
  }

  get pageOptions(): { label: string; value: string }[] {
    return this.filterOptions.pages.map(p => ({ label: p, value: p }));
  }

  get categoryOptions(): { label: string; value: string }[] {
    return this.eventCategories.map(c => ({ label: c.label, value: c.name }));
  }

  get activeFiltersCount(): number {
    let count = 0;
    if (this.selectedCountries.length) count++;
    if (this.selectedDevices.length) count++;
    if (this.selectedPages.length) count++;
    if (this.selectedCategories.length) count++;
    if (this.filterEventType) count++;
    return count;
  }

  constructor(
    private analyticsAPI: AnalyticsAPIService,
    private apiKeysService: ApiKeysService,
    private cdr: ChangeDetectorRef,
    public demoService: DemoService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    if (this.demoService.isDemoMode()) {
      this.userPlan = 'pro'; // demo shows pro-level
      this.loadDemoData();
      return;
    }
    const user = this.authService.getUserData();
    if (user?.role === 'owner') {
      this.userPlan = 'enterprise';
    } else {
      this.userPlan = user?.plan || 'free';
    }
    this.initChart();
    this.initDateRange();
    this.loadApiKeys();
  }

  isPlanAtLeast(plan: 'free' | 'starter' | 'pro' | 'enterprise'): boolean {
    const order: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };
    return (order[this.userPlan] ?? 0) >= order[plan];
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.historyCancel$.complete();
    this.destroy$.next();
    this.destroy$.complete();
    clearTimeout(this.searchTimer);
  }

  private loadDemoData(): void {
    const d = this.demoService;
    this.availableApiKeys = [{ apiKey: 'DEMO-KEY', name: 'demo-site.com', isActive: true } as any];
    this.selectedApiKey = 'DEMO-KEY';
    this.totalEvents = 21859;
    this.events = d.eventsBreakdown as any;
    this.customEvents = d.customEvents as any;
    this.topClicks = d.eventsTopClicks as any;
    this.summary = d.eventsSummary;
    // Use explicit category counts from demo service
    this.categoryCounts = { ...d.eventsCategoryCounts };
    this.historyEvents = d.eventsHistory as any;
    this.historyTotal = d.eventsHistory.length;
    this.historyPages = Math.ceil(d.eventsHistory.length / this.historyLimit);
    this.eventTypes = [...new Set(d.eventsHistory.map(e => e.event_name))];
    this.filterOptions = {
      countries: ['US', 'GB', 'DE', 'IN', 'CA', 'FR', 'AU', 'NL'],
      devices: ['Desktop', 'Mobile', 'Tablet'],
      pages: ['/', '/pricing', '/docs', '/features', '/contact', '/blog', '/why-pulzivo', '/use-cases', '/blog']
    };
    this.initChart();
    this.barChartData = d.eventsBarChart;
    this.updateDonutChart();
    this.loading.breakdown = false;
    this.loading.history = false;
    this.cdr.markForCheck();
  }

  private initDateRange(): void {
    // Default to "All time" — no date filter, show everything
    this.dateRange = { start: null, end: null };
    this.activePreset = 'All time';
  }

  applyDatePreset(preset: string): void {
    this.activePreset = preset;
    const presetConfig = this.datePresets.find(p => p.label === preset);
    if (presetConfig) {
      if (presetConfig.days === -1) {
        // All time — clear the date filter
        this.dateRange = { start: null, end: null };
      } else {
        const end = new Date();
        const start = new Date();
        if (presetConfig.days === 0) {
          start.setHours(0, 0, 0, 0);
        } else {
          start.setDate(start.getDate() - presetConfig.days);
        }
        this.dateRange = { start, end };
      }
      this.onAdvancedFilterChange();
    }
  }

  onDateRangeChange(): void {
    if (this.dateRange.start && this.dateRange.end) {
      this.activePreset = 'Custom';
      this.onAdvancedFilterChange();
    }
  }

  private initChart(): void {
    this.barChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } },
        x: { ticks: { maxRotation: 30 }, grid: { display: false } }
      }
    };
    this.donutChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: { legend: { display: false }, tooltip: { enabled: true } }
    };
  }

  private loadApiKeys(): void {
    this.subscriptions.add(
      this.apiKeysService.getApiKeys().subscribe({
        next: (response) => {
          this.availableApiKeys = (response.apiKeys || []).filter((k: ApiKey) => k.isActive !== false);
          if (this.availableApiKeys.length > 0 && !this.selectedApiKey) {
            this.selectedApiKey = this.availableApiKeys[0].apiKey;
            this.apiKeysService.setSelectedApiKey(this.selectedApiKey);
            this.loadAll();
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
      this.loadAll();
    }
  }

  private loadAll(): void {
    // Free users: entire page is gated — skip all API calls
    if (!this.isPlanAtLeast('pro')) {
      this.loading.breakdown = false;
      this.loading.history = false;
      this.cdr.markForCheck();
      return;
    }
    this.loadBreakdown();
    this.loadHistory();
  }

  private loadBreakdown(): void {
    this.loading.breakdown = true;
    this.cdr.markForCheck();

    // Build date range object
    const dateRange = this.dateRange.start && this.dateRange.end ? {
      startDate: this.dateRange.start,
      endDate: this.dateRange.end
    } : undefined;

    this.subscriptions.add(
      this.analyticsAPI.getEventsBreakdownWithDateRange(dateRange).subscribe({
        next: (data: any) => {
          this.events = data.events || [];
          this.customEvents = data.customEvents || [];
          this.topClicks = data.topClicks || [];
          this.totalEvents = data.totalEvents || 0;
          this.categoryCounts = data.categoryCounts || {};
          this.summary = data.summary || this.summary;
          this.updateChart();
          this.updateDonutChart();
          this.loading.breakdown = false;
          this.cdr.markForCheck();
        },
        error: () => { this.loading.breakdown = false; this.cdr.markForCheck(); }
      })
    );
  }

  private loadHistory(): void {
    this.loading.history = true;
    this.cdr.markForCheck();

    // Cancel previous in-flight request, then create a fresh cancel signal for this request
    this.historyCancel$.next();
    const cancelSignal$ = new Subject<void>();
    this.historyCancel$ = cancelSignal$;

    const dateRange = this.dateRange.start && this.dateRange.end ? {
      startDate: this.dateRange.start,
      endDate: this.dateRange.end
    } : undefined;

    this.analyticsAPI.getEventHistory(
      this.historyPage,
      this.historyLimit,
      this.filterEventType,
      this.searchQuery,
      this.selectedCountries,
      this.selectedDevices,
      this.selectedPages,
      this.selectedCategories,
      dateRange
    ).pipe(
      takeUntil(cancelSignal$)
    ).subscribe({
      next: (data: any) => {
        this.historyEvents = data.events || [];
        this.historyTotal = data.total || 0;
        this.historyPages = data.pages || 1;
        if (data.eventTypes?.length) {
          this.eventTypes = data.eventTypes;
        }
        if (data.filterOptions) {
          this.filterOptions = data.filterOptions;
        }
        this.loading.history = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('[Events] loadHistory error:', err?.status, err?.message, err);
        this.loading.history = false;
        this.cdr.markForCheck();
      }
    });
  }

  private updateChart(): void {
    const top15 = this.events.slice(0, 15);
    this.barChartData = {
      labels: top15.map(e => e.name.replace(/_/g, ' ')),
      datasets: [{
        data: top15.map(e => e.count),
        backgroundColor: top15.map((_, i) => {
          const colors = ['#2a6df6', '#6f41ff', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
          return colors[i % colors.length];
        }),
        borderRadius: 6,
        borderSkipped: false
      }]
    };
  }

  private updateDonutChart(): void {
    const CATEGORY_COLORS: Record<string, string> = {
      user_actions: '#2a6df6',
      navigation:   '#6f41ff',
      forms:        '#f59e0b',
      errors:       '#ef4444',
      performance:  '#22c55e',
      custom:       '#8b5cf6',
    };
    const cats = this.eventCategories;
    const labels = cats.map(c => c.label);
    const data = cats.map(c => this.categoryCounts[c.name] || 0);
    const colors = cats.map(c => CATEGORY_COLORS[c.name] || '#94a3b8');

    this.donutChartData = {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#ffffff', hoverOffset: 6 }]
    };
    this.donutChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const val = ctx.raw ?? 0;
              const pct = this.totalEvents > 0 ? ((val / this.totalEvents) * 100).toFixed(1) : '0';
              return ` ${val.toLocaleString()} events (${pct}%)`;
            }
          }
        }
      }
    };
  }

  onFilterChange(): void {
    this.historyPage = 1;
    this.loadHistory();
  }

  onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.historyPage = 1;
      this.loadHistory();
    }, 400);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.filterEventType = '';
    this.historyPage = 1;
    this.loadHistory();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.historyPages) return;
    this.historyPage = page;
    this.loadHistory();
    this.scrollToHistory();
  }

  onPageSizeChange(): void {
    this.historyPage = 1;
    this.jumpToPage = '';
    this.loadHistory();
  }

  onJumpToPage(event: Event): void {
    if ((event as KeyboardEvent).key !== 'Enter') return;
    const p = parseInt(this.jumpToPage);
    if (!isNaN(p)) this.goToPage(p);
    this.jumpToPage = '';
  }

  scrollToHistory(): void {
    setTimeout(() => {
      document.getElementById('event-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  get showingFrom(): number {
    if (this.historyTotal === 0) return 0;
    return (this.historyPage - 1) * this.historyLimit + 1;
  }

  get showingTo(): number {
    return Math.min(this.historyPage * this.historyLimit, this.historyTotal);
  }

  getEventTagStyle(name: string): 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast' | null | undefined {
    const system = ['page_view', 'click', 'scroll', 'dead_click'];
    const forms = ['form_submit', 'form_abandon', 'form_focus'];
    const perf = ['performance', 'web_vital_lcp', 'web_vital_fid', 'web_vital_cls', 'resource_timing'];
    if (name === 'rage_click') return 'danger';
    if (system.includes(name)) return 'info';
    if (forms.includes(name)) return 'warn';
    if (perf.includes(name)) return 'secondary';
    return 'success';
  }

  formatEventName(name: string): string {
    return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  formatTime(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  getDeviceIcon(device: string | null): string {
    if (device === 'Mobile') return 'pi pi-mobile';
    if (device === 'Tablet') return 'pi pi-tablet';
    return 'pi pi-desktop';
  }

  get pagesArray(): number[] {
    const total = this.historyPages;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: number[] = [1];
    let start = Math.max(2, this.historyPage - 1);
    let end = Math.min(total - 1, this.historyPage + 1);
    if (start > 2) pages.push(-1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push(-1);
    pages.push(total);
    return pages;
  }

  // Advanced Filter Methods
  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  toggleCategory(categoryName: string): void {
    const index = this.selectedCategories.indexOf(categoryName);
    if (index > -1) {
      this.selectedCategories.splice(index, 1);
    } else {
      this.selectedCategories.push(categoryName);
    }
    this.onAdvancedFilterChange();
  }

  onAdvancedFilterChange(): void {
    this.historyPage = 1;
    this.loadHistory();
  }

  clearAllFilters(): void {
    this.searchQuery = '';
    this.filterEventType = '';
    this.selectedCountries = [];
    this.selectedDevices = [];
    this.selectedPages = [];
    this.selectedCategories = [];
    this.historyPage = 1;
    this.loadHistory();
  }

  // Event Detail Modal Methods
  openEventDetail(event: HistoryEvent): void {
    this.selectedEvent = event;
    this.modalTab = 'details';
    this.sessionEvents = [];
    this.timelineActiveId = event.id;
    this.showEventDetail = true;
  }

  closeEventDetail(): void {
    this.showEventDetail = false;
    this.selectedEvent = null;
    this.copiedEventData = false;
    this.sessionEvents = [];
    this.modalTab = 'details';
  }

  switchModalTab(tab: 'details' | 'timeline'): void {
    this.modalTab = tab;
    if (tab === 'timeline' && this.selectedEvent && !this.sessionEvents.length) {
      this.loadSessionTimeline();
    }
  }

  private loadSessionTimeline(): void {
    if (!this.selectedEvent?.session_id) return;
    this.loadingTimeline = true;
    this.cdr.markForCheck();

    if (this.demoService.isDemoMode()) {
      const events = this.demoService.getSessionEvents(this.selectedEvent.session_id);
      this.sessionEvents = events as any;
      this.loadingTimeline = false;
      this.cdr.markForCheck();
      return;
    }

    this.analyticsAPI.getSessionEvents(this.selectedEvent.session_id).subscribe({
      next: (events: any[]) => {
        this.sessionEvents = events;
        this.loadingTimeline = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingTimeline = false;
        this.cdr.markForCheck();
      }
    });
  }

  jumpToTimelineEvent(event: HistoryEvent): void {
    this.timelineActiveId = event.id;
    this.cdr.markForCheck();

    // Scroll the list item into view
    setTimeout(() => {
      const el = document.querySelector('.tl-item.tl-active');
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }

  setTimelineActive(id: string): void {
    this.timelineActiveId = id;
    this.cdr.markForCheck();
  }

  copiedEventData = false;
  private copiedTimer: any;

  copyEventData(): void {
    if (!this.selectedEvent) return;
    const text = this.formatEventData(this.selectedEvent.data);
    navigator.clipboard.writeText(text).then(() => {
      this.copiedEventData = true;
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => {
        this.copiedEventData = false;
      }, 2000);
    });
  }

  // Event label mapping
  private readonly EVENT_LABELS: Record<string, string> = {
    page_view:                    'Page View',
    click:                        'Click',
    scroll:                       'Scroll',
    hover:                        'Hover',
    input:                        'Input',
    interaction:                  'Interaction',
    route_change:                 'Route Change',
    navigation:                   'Navigation',
    page_exit:                    'Page Exit',
    page_hidden:                  'Page Hidden',
    form_submit:                  'Form Submit',
    form_abandon:                 'Form Abandon',
    form_focus:                   'Form Focus',
    form_blur:                    'Form Blur',
    form_error:                   'Form Error',
    form_field_interaction:       'Form Field',
    error:                        'JS Error',
    javascript_error:             'JS Error',
    rage_click:                   'Rage Click',
    dead_click:                   'Dead Click',
    web_vital_lcp:                'Page Speed (LCP)',
    web_vital_fid:                'Input Delay (FID)',
    web_vital_cls:                'Layout Shift (CLS)',
    web_vital_fcp:                'First Paint (FCP)',
    web_vital_ttfb:               'Server Response (TTFB)',
    resource_timing:              'Resource Load',
    performance:                  'Performance',
    page_load_complete:           'Page Load',
    session_start:                'Session Start',
    unique_visitor_daily:         'New Visitor',
    unique_visitor_session:       'Session',
    return_visit:                 'Return Visit',
    impression:                   'Impression',
    promo_impression:             'Promo Impression',
    promo_click:                  'Promo Click',
    visibility:                   'Visibility',
    scroll_depth:                 'Scroll Depth',
  };

  private readonly EVENT_ICONS: Record<string, string> = {
    page_view:             'pi pi-file',
    click:                 'pi pi-hand-point-right',
    scroll:                'pi pi-arrows-v',
    hover:                 'pi pi-eye',
    input:                 'pi pi-pencil',
    interaction:           'pi pi-hand-point-right',
    route_change:          'pi pi-compass',
    navigation:            'pi pi-compass',
    page_exit:             'pi pi-sign-out',
    page_hidden:           'pi pi-eye-slash',
    form_submit:           'pi pi-check-circle',
    form_abandon:          'pi pi-times-circle',
    form_focus:            'pi pi-align-left',
    form_blur:             'pi pi-align-left',
    form_error:            'pi pi-exclamation-circle',
    form_field_interaction:'pi pi-align-left',
    error:                 'pi pi-exclamation-triangle',
    javascript_error:      'pi pi-exclamation-triangle',
    rage_click:            'pi pi-bolt',
    dead_click:            'pi pi-ban',
    web_vital_lcp:         'pi pi-gauge',
    web_vital_fid:         'pi pi-gauge',
    web_vital_cls:         'pi pi-gauge',
    web_vital_fcp:         'pi pi-gauge',
    web_vital_ttfb:        'pi pi-gauge',
    resource_timing:       'pi pi-download',
    performance:           'pi pi-gauge',
    page_load_complete:    'pi pi-flag',
    session_start:         'pi pi-user',
    unique_visitor_daily:  'pi pi-user-plus',
    unique_visitor_session:'pi pi-user',
    return_visit:          'pi pi-refresh',
    impression:            'pi pi-eye',
    promo_impression:      'pi pi-tag',
    promo_click:           'pi pi-tag',
    visibility:            'pi pi-eye',
    scroll_depth:          'pi pi-arrows-v',
  };

  eventFriendlyLabel(name: string): string {
    return this.EVENT_LABELS[name] ?? this.formatEventName(name);
  }

  eventIcon(name: string): string {
    return this.EVENT_ICONS[name] ?? 'pi pi-sparkles';
  }

  sessionDuration(events: HistoryEvent[]): string {
    if (events.length < 2) return '< 1s';
    const ms = new Date(events[events.length - 1].timestamp).getTime() - new Date(events[0].timestamp).getTime();
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }

  timelineOffset(event: HistoryEvent, events: HistoryEvent[]): number {
    if (events.length < 2) return 0;
    const start = new Date(events[0].timestamp).getTime();
    const end   = new Date(events[events.length - 1].timestamp).getTime();
    const curr  = new Date(event.timestamp).getTime();
    return end === start ? 0 : ((curr - start) / (end - start)) * 100;
  }

  getCategoryCount(categoryName: string): number {
    return this.categoryCounts[categoryName] || 0;
  }

  getCategoryPercent(categoryName: string): number {
    if (!this.totalEvents) return 0;
    return Math.round((this.getCategoryCount(categoryName) / this.totalEvents) * 100);
  }

  private readonly USER_COLORS = [
    { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' }, // blue
    { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' }, // green
    { bg: '#fdf4ff', text: '#9333ea', border: '#e9d5ff' }, // purple
    { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa' }, // orange
    { bg: '#fdf2f8', text: '#db2777', border: '#fbcfe8' }, // pink
    { bg: '#f0fdfa', text: '#0d9488', border: '#99f6e4' }, // teal
    { bg: '#fefce8', text: '#ca8a04', border: '#fef08a' }, // yellow
    { bg: '#fff1f2', text: '#e11d48', border: '#fecdd3' }, // rose
  ];

  private userColorCache = new Map<string, UserColor>();

  userColor(userId: string | null | undefined): UserColor {
    if (!userId) return { bg: '#f8fafc', text: '#94a3b8', border: '#e2e8f0' };
    if (this.userColorCache.has(userId)) return this.userColorCache.get(userId)!;
    // Deterministic hash so the same user always gets the same colour
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
    }
    const color = this.USER_COLORS[hash % this.USER_COLORS.length];
    this.userColorCache.set(userId, color);
    return color;
  }

  userInitials(userId: string | null | undefined): string {
    if (!userId) return '?';
    // Take up to 2 meaningful chars — skip common prefix "anon_"
    const clean = userId.replace(/^anon_/i, '').toUpperCase();
    return clean.slice(0, 2);
  }

  getEventCategoryInfo(eventName: string): EventCategory | undefined {
    return this.eventCategories.find(cat => 
      cat.events.includes(eventName) || 
      (cat.name === 'custom' && !this.eventCategories.some(c => c.events.includes(eventName)))
    );
  }

  formatEventData(data: any): string {
    if (!data) return 'No additional data';
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  // Export Methods
  exportData(format: 'csv' | 'json', onlyFiltered: boolean = false): void {
    const dataToExport = onlyFiltered ? this.historyEvents : this.historyEvents;
    const timestamp = new Date().toISOString().split('T')[0];
    
    if (format === 'csv') {
      this.exportToCSV(dataToExport, `pulzivo-events-${timestamp}.csv`);
    } else {
      this.exportToJSON(dataToExport, `pulzivo-events-${timestamp}.json`);
    }
  }

  private exportToCSV(data: HistoryEvent[], filename: string): void {
    const headers = ['Time', 'Event', 'User ID', 'Page', 'Country', 'Device', 'Data'];
    const rows = data.map(evt => [
      evt.timestamp,
      evt.event_name,
      evt.user_id || '',
      evt.page || '',
      evt.country || '',
      evt.device || '',
      JSON.stringify(evt.data || {})
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    this.downloadFile(csvContent, filename, 'text/csv');
  }

  private exportToJSON(data: HistoryEvent[], filename: string): void {
    const jsonContent = JSON.stringify(data, null, 2);
    this.downloadFile(jsonContent, filename, 'application/json');
  }

  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  // Category Badge Methods
  getCategoryForEvent(eventName: string): EventCategory | null {
    const category = this.eventCategories.find(cat => 
      cat.events.includes(eventName)
    );
    return category || this.eventCategories.find(c => c.name === 'custom') || null;
  }

  getCategoryBadgeClass(eventName: string): string {
    const category = this.getCategoryForEvent(eventName);
    return category ? `cat-badge-${category.name}` : 'cat-badge-custom';
  }
}
