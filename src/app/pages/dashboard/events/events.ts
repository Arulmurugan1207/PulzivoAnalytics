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
import { Subscription } from 'rxjs';
import { AnalyticsAPIService } from '../../../services/analytics-api.service';
import { ApiKeysService, ApiKey } from '../../../services/api-keys.service';

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

@Component({
  selector: 'app-dashboard-events',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ChartModule,
    SelectModule,
    ButtonModule,
    ProgressSpinnerModule,
    SkeletonModule,
    InputTextModule,
    TagModule
  ],
  templateUrl: './events.html',
  styleUrl: './events.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardEvents implements OnInit, OnDestroy {
  private subscriptions = new Subscription();

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

  // Chart
  barChartData: any = {};
  barChartOptions: any = {};

  get eventTypeOptions(): { label: string; value: string }[] {
    return [
      { label: 'All Events', value: '' },
      ...this.eventTypes.map(t => ({ label: this.formatEventName(t), value: t }))
    ];
  }

  constructor(
    private analyticsAPI: AnalyticsAPIService,
    private apiKeysService: ApiKeysService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initChart();
    this.loadApiKeys();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    clearTimeout(this.searchTimer);
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
    this.loadBreakdown();
    this.loadHistory();
  }

  private loadBreakdown(): void {
    this.loading.breakdown = true;
    this.cdr.markForCheck();

    this.subscriptions.add(
      this.analyticsAPI.getEventsBreakdown().subscribe({
        next: (data: any) => {
          this.events = data.events || [];
          this.customEvents = data.customEvents || [];
          this.topClicks = data.topClicks || [];
          this.totalEvents = data.totalEvents || 0;
          this.summary = data.summary || this.summary;
          this.updateChart();
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

    this.subscriptions.add(
      this.analyticsAPI.getEventHistory(this.historyPage, this.historyLimit, this.filterEventType, this.searchQuery).subscribe({
        next: (data: any) => {
          this.historyEvents = data.events || [];
          this.historyTotal = data.total || 0;
          this.historyPages = data.pages || 1;
          if (data.eventTypes?.length) {
            this.eventTypes = data.eventTypes;
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
}
