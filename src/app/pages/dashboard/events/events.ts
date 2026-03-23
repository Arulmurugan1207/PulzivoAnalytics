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
import { Subscription } from 'rxjs';
import { RouterLink } from '@angular/router';
import { AnalyticsAPIService } from '../../../services/analytics-api.service';
import { ApiKeysService, ApiKey } from '../../../services/api-keys.service';
import { AuthService } from '../../../services/auth.service';
import { DemoService } from '../../../services/demo.service';
import { MenuItem } from 'primeng/api';

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
  timestamp: string;
  page: string | null;
  country: string | null;
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
    { label: 'Today', days: 0 },
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 }
  ];
  activePreset = 'Last 7 days';
  
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

  // Timeline Chart
  timelineChartData: any = {};
  timelineChartOptions: any = {};

  // Chart
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
    this.initTimelineChart();
    this.initDateRange();
    this.loadApiKeys();
  }

  isPlanAtLeast(plan: 'free' | 'starter' | 'pro' | 'enterprise'): boolean {
    const order: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };
    return (order[this.userPlan] ?? 0) >= order[plan];
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    clearTimeout(this.searchTimer);
  }

  private loadDemoData(): void {
    const d = this.demoService;
    this.availableApiKeys = [{ apiKey: 'DEMO-KEY', name: 'demo-site.com', isActive: true } as any];
    this.selectedApiKey = 'DEMO-KEY';
    this.totalEvents = 8423;
    this.events = d.eventsBreakdown as any;
    this.customEvents = d.customEvents as any;
    this.topClicks = d.eventsTopClicks as any;
    this.summary = d.eventsSummary;
    this.historyEvents = d.eventsHistory as any;
    this.historyTotal = d.eventsHistory.length;
    this.historyPages = 1;
    this.eventTypes = [...new Set(d.eventsHistory.map(e => e.event_name))];
    this.filterOptions = {
      countries: ['US', 'GB', 'DE', 'IN', 'CA', 'FR', 'AU', 'NL'],
      devices: ['Desktop', 'Mobile', 'Tablet'],
      pages: ['/', '/pricing', '/docs', '/features', '/contact', '/blog']
    };
    this.initChart();
    this.initTimelineChart();
    this.barChartData = d.eventsBarChart;
    this.timelineChartData = d.eventsTimelineChart;
    this.loading.breakdown = false;
    this.loading.history = false;
    this.cdr.markForCheck();
  }

  private initDateRange(): void {
    // Default to last 7 days
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    this.dateRange = { start, end };
  }

  applyDatePreset(preset: string): void {
    this.activePreset = preset;
    const presetConfig = this.datePresets.find(p => p.label === preset);
    if (presetConfig) {
      const end = new Date();
      const start = new Date();
      if (presetConfig.days === 0) {
        start.setHours(0, 0, 0, 0);
      } else {
        start.setDate(start.getDate() - presetConfig.days);
      }
      this.dateRange = { start, end };
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
  }

  private initTimelineChart(): void {
    this.timelineChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom' },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } },
        x: { grid: { display: false } }
      }
    };
    this.updateTimelineChart();
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
          this.summary = data.summary || this.summary;
          this.updateChart();
          this.updateTimelineChart();
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

    // Build date range object
    const dateRange = this.dateRange.start && this.dateRange.end ? {
      startDate: this.dateRange.start,
      endDate: this.dateRange.end
    } : undefined;

    this.subscriptions.add(
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
      ).subscribe({
        next: (data: any) => {
          this.historyEvents = data.events || [];
          this.historyTotal = data.total || 0;
          this.historyPages = data.pages || 1;
          if (data.eventTypes?.length) {
            this.eventTypes = data.eventTypes;
          }
          // Populate filter options
          if (data.filterOptions) {
            this.filterOptions = data.filterOptions;
          }
          this.loading.history = false;
          this.cdr.markForCheck();
        },
        error: () => { this.loading.history = false; this.cdr.markForCheck(); }
      })
    );
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

  private updateTimelineChart(): void {
    // Generate mock timeline data for the last 7 days
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const categories = this.eventCategories.slice(0, 5);
    
    this.timelineChartData = {
      labels: days,
      datasets: categories.map(cat => ({
        label: cat.label,
        data: days.map(() => Math.floor(Math.random() * 500) + 100),
        borderColor: cat.color,
        backgroundColor: cat.color + '20',
        tension: 0.4,
        fill: true
      }))
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
    this.showEventDetail = true;
  }

  closeEventDetail(): void {
    this.showEventDetail = false;
    this.selectedEvent = null;
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
