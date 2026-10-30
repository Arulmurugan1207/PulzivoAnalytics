import { Component, OnInit, OnDestroy, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart } from 'chart.js';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ChartModule } from 'primeng/chart';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DatePickerModule } from 'primeng/datepicker';
import { PopoverModule, Popover } from 'primeng/popover';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import {forkJoin, of, Subscription} from 'rxjs';
import { catchError } from 'rxjs/operators';
import { RouterLink } from '@angular/router';
import { AnalyticsDataService, DateRange } from '../../../services/analytics-data.service';
import { ApiKeysService, ApiKey } from '../../../services/api-keys.service';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  metrics: string[];
  charts: string[];
  plan?: 'pro' | 'enterprise';
}

interface SavedReport {
  id: string;
  name: string;
  template: string;
  dateRange: { startDate: Date; endDate: Date };
  createdAt: Date;
}

interface MetricData {
  key: string;
  label: string;
  value: number | string;
  trend?: number;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-dashboard-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ChartModule,
    CardModule,
    ButtonModule,
    TableModule,
    TagModule,
    DatePickerModule,
    PopoverModule,

    CheckboxModule,
    InputTextModule,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class DashboardReports implements OnInit, OnDestroy {
  @ViewChild('datePopover') datePopover!: Popover;
  @ViewChild('saveReportPopover') saveReportPopover!: Popover;

  // Report templates
  templates: ReportTemplate[] = [
    {
      id: 'traffic',
      name: 'Traffic Report',
      description: 'Visits, page views and where they come from',
      icon: 'pi-chart-line',
      metrics: ['pageViews', 'visitors', 'sessions', 'bounceRate'],
      charts: ['pageViewsTrend', 'topPages', 'trafficSources']
    },
    {
      id: 'behavior',
      name: 'User Behavior',
      description: 'How people engage with your site',
      icon: 'pi-users',
      metrics: ['avgSessionDuration', 'pagesPerSession', 'bounceRate', 'exitRate'],
      charts: ['sessionDuration', 'pageDepth', 'exitPages']
    },
    {
      id: 'geographic',
      name: 'Geographic Analysis',
      description: 'Where your visitors are',
      icon: 'pi-map-marker',
      metrics: ['countries', 'topCountry', 'topRegion'],
      charts: ['geoMap', 'countryBreakdown', 'regionBreakdown']
    },
    {
      id: 'device',
      name: 'Device & Browser',
      description: 'Devices and browsers used',
      icon: 'pi-mobile',
      metrics: ['desktop', 'mobile', 'tablet'],
      charts: ['deviceBreakdown', 'browserBreakdown', 'screenResolution']
    },
    {
      id: 'content',
      name: 'Content Performance',
      description: 'Your most and least viewed pages',
      icon: 'pi-file',
      metrics: ['topPage', 'avgTimeOnPage', 'scrollDepth'],
      charts: ['topPages', 'bottomPages', 'contentEngagement']
    },
    {
      id: 'conversion',
      name: 'Conversion Funnel',
      description: 'Where visitors drop off',
      icon: 'pi-filter',
      metrics: ['conversionRate', 'dropOffRate', 'completions'],
      charts: ['funnelSteps', 'dropOffPoints', 'conversionTrend'],
      plan: 'enterprise'
    }
  ];

  selectedTemplate = signal<string>('traffic');
  activeView = signal<'templates' | 'custom' | 'saved'>('templates');

  // Date range
  dateRangeValue: Date[] = [];
  tempDateRange: Date[] = [];
  activePreset = 'Last 30 Days';
  dateRangeLabel = 'Last 30 Days';
  errorMessage = signal<string | null>(null);
  summary = '';
  private loadTimer: any;

  presets = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'Last 7 Days', value: 'last7' },
    { label: 'Last 30 Days', value: 'last30' },
    { label: 'This Month', value: 'thisMonth' },
    { label: 'Last Month', value: 'lastMonth' },
    { label: 'Custom Range', value: 'custom' }
  ];

  // API Keys (shared via dashboard topbar + localStorage)
  availableApiKeys: ApiKey[] = [];
  selectedApiKey = '';
  private subscriptions = new Subscription();

  // Report data
  reportMetrics: MetricData[] = [];
  chartData: any = {};
  chartOptions: any = {};
  topPagesData: any[] = [];
  trafficSources: any[] = [];
  geographicData: any[] = [];
  browserData: any[] = [];
  osData: any[] = [];
  funnelSteps: any[] = [];
  entryPagesData: any[] = [];
  exitPagesData: any[] = [];
  loading = signal(false);
  exporting = signal(false);

  // Plan access
  userPlan: 'free' | 'pro' | 'enterprise' = 'free';

  // Custom report builder
  availableMetrics = [
    { label: 'Page Views',            value: 'pageViews',          checked: true  },
    { label: 'Unique Visitors',       value: 'visitors',           checked: true  },
    { label: 'Avg. Session Duration', value: 'avgSessionDuration', checked: false },
    { label: 'Bounce Rate',           value: 'bounceRate',         checked: true  },
  ];

  availableCharts = [
    { label: 'Page Views Trend', value: 'pageViewsTrend', checked: true },
    { label: 'Top Pages', value: 'topPages', checked: true },
    { label: 'Device Breakdown', value: 'deviceBreakdown', checked: true },
    { label: 'Geographic Distribution', value: 'geographic', checked: false },
    { label: 'Traffic Sources', value: 'trafficSources', checked: false }
  ];

  // Saved reports
  savedReports: SavedReport[] = [];
  newReportName = '';

  // Make Math available in template
  Math = Math;

  private apiUrl = environment.apiUrl;

  constructor(
    private analyticsDataService: AnalyticsDataService,
    private apiKeysService: ApiKeysService,
    private authService: AuthService,
    private messageService: MessageService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeprint', this.resizeCharts);
      window.addEventListener('afterprint', this.resizeCharts);
      window.addEventListener('resize', this.resizeCharts);
      this.printMql = window.matchMedia?.('print') ?? null;
      this.printMql?.addEventListener?.('change', this.onPrintChange);
    }
    this.loadUserPlan();
    this.initializeDateRange();
    this.bindSharedApiKey();
    this.loadSavedReports();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    clearTimeout(this.loadTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeprint', this.resizeCharts);
      window.removeEventListener('afterprint', this.resizeCharts);
      window.removeEventListener('resize', this.resizeCharts);
      this.printMql?.removeEventListener?.('change', this.onPrintChange);
    }
  }

  loadUserPlan() {
    const user = this.authService.getUserData();
    if (user?.role === 'owner') {
      this.userPlan = 'enterprise';
    } else {
      this.userPlan = user?.plan ?? 'free';
    }
  }

  isTemplateAccessible(template: ReportTemplate): boolean {
    if (!template.plan) return true; // no restriction
    if (template.plan === 'enterprise') return this.userPlan === 'enterprise';
    return this.userPlan === 'pro' || this.userPlan === 'enterprise';
  }

  private bindSharedApiKey(): void {
    this.availableApiKeys = this.apiKeysService.getAvailableApiKeys();
    this.selectedApiKey = this.apiKeysService.getSelectedApiKey() || '';
    let initialLoadDone = false;

    this.subscriptions.add(
      this.apiKeysService.availableApiKeys$.subscribe(keys => {
        this.availableApiKeys = keys;
      })
    );
    this.subscriptions.add(
      this.apiKeysService.selectedApiKey$.subscribe(key => {
        const next = key || '';
        const changed = next !== this.selectedApiKey;
        this.selectedApiKey = next;
        if (this.selectedApiKey && (changed || !initialLoadDone)) {
          initialLoadDone = true;
          this.generateReport();
        }
      })
    );
    this.subscriptions.add(
      this.apiKeysService.loadAvailableApiKeys().subscribe()
    );
  }

  initializeDateRange() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    this.dateRangeValue = [start, end];
    this.tempDateRange = [...this.dateRangeValue];
  }

  private getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.authService.getToken() || ''}` });
  }

  loadSavedReports() {
    const user = this.authService.getUserData();
    if (!user?._id) {
      const saved = localStorage.getItem('savedReports');
      if (saved) this.savedReports = JSON.parse(saved);
      return;
    }
    this.http.get<{ reports: any[] }>(`${this.apiUrl}/users/${user._id}/reports`,
      { headers: this.getAuthHeaders() }
    ).subscribe({
      next: (res) => {
        this.savedReports = (res?.reports || []).map(r => ({
          id: r._id,
          name: r.name,
          template: r.template,
          dateRange: r.dateRange,
          createdAt: new Date(r.createdAt)
        }));
      },
      error: () => {
        const saved = localStorage.getItem('savedReports');
        if (saved) this.savedReports = JSON.parse(saved);
      }
    });
  }

  selectTemplate(templateId: string) {
    const template = this.templates.find(t => t.id === templateId);
    if (template && !this.isTemplateAccessible(template)) return;
    this.selectedTemplate.set(templateId);
    this.generateReport();
  }

  selectPreset(preset: any) {
    this.activePreset = preset.label;
    if (preset.value === 'custom') {
      return; // Let user pick custom range
    }

    const range = this.getPresetRange(preset.value);
    this.dateRangeValue = range;
    this.tempDateRange = [...range];
    this.dateRangeLabel = preset.label;
    this.datePopover?.hide();
    this.generateReport();
  }

  getPresetRange(preset: string): Date[] {
    const end = new Date();
    const start = new Date();

    switch (preset) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case 'yesterday':
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case 'last7':
        start.setDate(start.getDate() - 7);
        break;
      case 'last30':
        start.setDate(start.getDate() - 30);
        break;
      case 'thisMonth':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'lastMonth':
        start.setMonth(start.getMonth() - 1);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        break;
    }

    return [start, end];
  }

  applyCustomDateRange() {
    this.dateRangeValue = [...this.tempDateRange];
    this.dateRangeLabel = `${this.formatDate(this.dateRangeValue[0])} - ${this.formatDate(this.dateRangeValue[1])}`;
    this.activePreset = 'Custom Range';
    this.datePopover?.hide();
    this.generateReport();
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ── Rank-list rows (home-page sample style) ──────────────────────
  readonly rowLimit = 10;
  expanded: Record<string, boolean> = {};
  accents: Record<string, string> = {
    pages: '#6366f1', sources: '#0ea5e9', geo: '#10b981', browsers: '#f59e0b',
    os: '#ec4899', entry: '#14b8a6', exit: '#f97316'
  };

  private siteOrigin(): string {
    const key = this.availableApiKeys?.find((k: any) => k.apiKey === this.selectedApiKey) as any;
    const d = key?.allowedDomains?.[0];
    if (!d) return '';
    return (/^https?:\/\//.test(d) ? d : `https://${d}`).replace(/\/+$/, '');
  }

  pageHref(path: string): string | null {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const origin = this.siteOrigin();
    return origin && path.startsWith('/') ? origin + path : null;
  }

  sourceHref(src: string): string | null {
    if (!src) return null;
    if (/^https?:\/\//i.test(src)) return src;
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(src.trim()) ? `https://${src.trim()}` : null;
  }

  /** Normalised rows for each list card: label, value, bar % (relative to max), optional link. */
  rankRows(kind: string): { label: string; value: number; pct: number; href: string | null; sub?: string; title?: string }[] {
    let rows: { label: string; value: number; href: string | null; sub?: string; title?: string }[] = [];
    const n = (v: any) => +(v || 0);
    const arr = (a: any) => Array.isArray(a) ? a : [];
    switch (kind) {
      case 'pages':    rows = arr(this.topPagesData).map(p => { const l = p.url || p.path || p.page || '/'; const t = typeof p.title === 'string' ? p.title.trim() : ''; return { label: l, value: n(p.views), href: this.pageHref(l), title: t && t !== l ? t : undefined }; }); break;
      case 'entry':    rows = arr(this.entryPagesData).map(p => { const l = p.url || p.path || p.page || '/'; return { label: l, value: n(p.entrances ?? p.count), href: this.pageHref(l) }; }); break;
      case 'exit':     rows = arr(this.exitPagesData).map(p => { const l = p.url || p.path || p.page || '/'; return { label: l, value: n(p.exits ?? p.count), href: this.pageHref(l), sub: p.exitRate != null ? `${p.exitRate}% exit` : undefined }; }); break;
      case 'sources':  rows = arr(this.trafficSources).map(s => ({ label: s.source || 'Direct', value: n(s.visits), href: this.sourceHref(s.source) })); break;
      case 'geo':      rows = arr(this.geographicData).map(c => ({ label: `${c.flag || ''} ${c.country || 'Unknown'}`.trim(), value: n(c.visitors), href: null })); break;
      case 'browsers': rows = arr(this.browserData).map(b => ({ label: b.name || 'Unknown', value: n(b.count), href: null })); break;
      case 'os':       rows = arr(this.osData).map(o => ({ label: o.name || 'Unknown', value: n(o.count), href: null })); break;
    }
    const max = Math.max(1, ...rows.map(r => r.value));
    return rows.map(r => ({ ...r, pct: Math.max(2, (r.value / max) * 100) }));
  }

  visibleRows(kind: string) {
    const all = this.rankRows(kind);
    return this.expanded[kind] ? all : all.slice(0, this.rowLimit);
  }

  toggleRows(kind: string) { this.expanded[kind] = !this.expanded[kind]; }

  /** Resize Chart.js canvases to the printable width before/after printing so charts aren't clipped. */
  private resizeCharts = () => {
    try { Object.values((Chart as any).instances || {}).forEach((c: any) => { if (c?.options) c.options.animation = false; c?.resize?.(); c?.update?.('none'); }); } catch { /* ignore */ }
  };
  private printMql: MediaQueryList | null = null;
  private onPrintChange = () => setTimeout(this.resizeCharts);

  /** Always returns a valid range; falls back to the last 30 days. */
  private safeDateRange(): DateRange {
    const ok = (d: any) => d instanceof Date && !isNaN(d.getTime());
    let [start, end] = this.dateRangeValue || [];
    if (!ok(end)) end = new Date();
    if (!ok(start)) start = new Date(end.getTime() - 30 * 86400000);
    this.dateRangeValue = [start, end];
    return { startDate: start, endDate: end };
  }

  private failReport(msg = "We couldn't load this report. Please try again in a moment.") {
    clearTimeout(this.loadTimer);
    this.loading.set(false);
    this.errorMessage.set(msg);
  }

  generateReport() {
    if (!this.selectedApiKey) return;
    this.errorMessage.set(null);
    this.loading.set(true);
    clearTimeout(this.loadTimer);
    this.loadTimer = setTimeout(() => {
      if (this.loading()) this.failReport('This report is taking too long. Please try again or pick a shorter date range.');
    }, 30000);
    try {
      this.runReport(this.safeDateRange());
    } catch (e) {
      console.error(e);
      this.failReport();
    }
  }

  private runReport(dateRange: DateRange) {

    // Load core metrics + real comparison trends in parallel
    forkJoin({
      metrics:    this.analyticsDataService.getMetrics(dateRange, this.selectedApiKey),
      comparison: this.analyticsDataService.getMetricsComparison(dateRange, this.selectedApiKey)
    }).pipe(catchError(() => of({ metrics: {}, comparison: { trends: {} } }))).subscribe({
      next: ({ metrics, comparison }: any) => {
        this.buildReportMetrics(metrics, comparison?.trends || {});
      }
    });

    if (this.activeView() === 'custom') {
      this.loadCustomData(dateRange);
    } else {
      this.loadTemplateData(this.selectedTemplate(), dateRange);
    }
  }

  loadTemplateData(template: string, dateRange: DateRange) {
    switch (template) {
      case 'traffic':    this.loadTrafficData(dateRange);    break;
      case 'behavior':   this.loadBehaviorData(dateRange);   break;
      case 'geographic': this.loadGeographicData(dateRange); break;
      case 'device':     this.loadDeviceData(dateRange);     break;
      case 'content':    this.loadContentData(dateRange);    break;
      case 'conversion': this.loadConversionData(dateRange); break;
      default:           this.loading.set(false);
    }
  }

  loadTrafficData(dateRange: DateRange) {
    forkJoin({
      trend:   this.analyticsDataService.getPageViewsTrend(dateRange),
      sources: this.analyticsDataService.getTrafficSources(dateRange),
      pages:   this.analyticsDataService.getTopPages(dateRange, 1, 25)
    }).subscribe({
      next: ({ trend, sources, pages }: any) => {
        this.updatePageViewsChart(trend);
        this.trafficSources = sources.sources || [];
        this.updateTrafficSourceChart(this.trafficSources);
        this.topPagesData = pages.pages || [];
        this.loading.set(false);
      },
      error: () => this.failReport()
    });
  }

  loadBehaviorData(dateRange: DateRange) {
    forkJoin({
      trend:  this.analyticsDataService.getPageViewsTrend(dateRange),
      device: this.analyticsDataService.getDeviceBreakdown(dateRange),
      pages:  this.analyticsDataService.getTopPages(dateRange, 1, 25)
    }).subscribe({
      next: ({ trend, device, pages }: any) => {
        this.updatePageViewsChart(trend);
        this.updateDeviceChart(device);
        this.topPagesData = pages.pages || [];
        this.loading.set(false);
      },
      error: () => this.failReport()
    });
  }

  loadGeographicData(dateRange: DateRange) {
    forkJoin({
      geo:    this.analyticsDataService.getGeographicData(dateRange),
      device: this.analyticsDataService.getDeviceBreakdown(dateRange)
    }).subscribe({
      next: ({ geo, device }: any) => {
        this.geographicData = geo || [];
        this.updateDeviceChart(device);
        this.loading.set(false);
      },
      error: () => this.failReport()
    });
  }

  loadDeviceData(dateRange: DateRange) {
    forkJoin({
      device:  this.analyticsDataService.getDeviceBreakdown(dateRange),
      browser: this.analyticsDataService.getBrowserBreakdown(dateRange)
    }).subscribe({
      next: ({ device, browser }: any) => {
        this.updateDeviceChart(device);
        this.browserData = browser.browsers || [];
        this.osData = browser.operatingSystems || [];
        this.updateBrowserChart(this.browserData);
        this.loading.set(false);
      },
      error: () => this.failReport()
    });
  }

  loadContentData(dateRange: DateRange) {
    forkJoin({
      trend: this.analyticsDataService.getPageViewsTrend(dateRange),
      pages: this.analyticsDataService.getTopPages(dateRange, 1, 50),
      entry: this.analyticsDataService.getEntryPages(dateRange),
      exit:  this.analyticsDataService.getExitPages(dateRange)
    }).subscribe({
      next: ({ trend, pages, entry, exit }: any) => {
        this.updatePageViewsChart(trend);
        this.topPagesData = pages.pages || [];
        this.entryPagesData = entry.pages || [];
        this.exitPagesData = exit.pages || [];
        this.loading.set(false);
      },
      error: () => this.failReport()
    });
  }

  loadConversionData(dateRange: DateRange) {
    this.analyticsDataService.getConversionFunnel(dateRange).subscribe({
      next: (funnel) => {
        const raw: any[] = Array.isArray(funnel?.steps) ? funnel.steps : [];
        const first = +(raw[0]?.visitors ?? raw[0]?.count ?? 0) || 0;
        const steps = raw.map((st: any) => {
          const visitors = +(st?.visitors ?? st?.count ?? 0) || 0;
          const conversion = st?.conversion != null && isFinite(+st.conversion) ? +st.conversion : (first ? (visitors / first) * 100 : 0);
          return { ...st, name: st?.name || st?.step || 'Step', visitors, conversion };
        });
        this.funnelSteps = steps;
        this.updateFunnelChart({ steps });
        this.loading.set(false);
      },
      error: () => this.failReport()
    });
  }

  loadCustomData(dateRange: DateRange) {
    const checked = this.availableCharts.filter(c => c.checked).map(c => c.value);
    const requests: any = {};
    if (checked.includes('pageViewsTrend'))  requests.trend   = this.analyticsDataService.getPageViewsTrend(dateRange);
    if (checked.includes('topPages'))        requests.pages   = this.analyticsDataService.getTopPages(dateRange);
    if (checked.includes('deviceBreakdown')) requests.device  = this.analyticsDataService.getDeviceBreakdown(dateRange);
    if (checked.includes('geographic'))      requests.geo     = this.analyticsDataService.getGeographicData(dateRange);
    if (checked.includes('trafficSources'))  requests.sources = this.analyticsDataService.getTrafficSources(dateRange);
    if (Object.keys(requests).length === 0) { this.loading.set(false); return; }

    forkJoin(requests).subscribe({
      next: (results: any) => {
        if (results.trend)   this.updatePageViewsChart(results.trend);
        if (results.pages)   this.topPagesData = results.pages.pages || [];
        if (results.device)  this.updateDeviceChart(results.device);
        if (results.geo)     this.geographicData = results.geo || [];
        if (results.sources) { this.trafficSources = results.sources.sources || []; this.updateTrafficSourceChart(this.trafficSources); }
        this.loading.set(false);
      },
      error: () => this.failReport()
    });
  }

  buildReportMetrics(data: any, trends: any = {}) {
    const pv = +(data?.totalPageViews || 0), uv = +(data?.uniqueVisitors || 0);
    const t = trends?.uniqueVisitors;
    this.summary = pv || uv
      ? `${uv.toLocaleString()} visitors viewed ${pv.toLocaleString()} pages in ${this.dateRangeLabel.toLowerCase()}` +
        (typeof t === 'number' && isFinite(t) && t !== 0 ? ` — visitors ${t > 0 ? 'up' : 'down'} ${Math.abs(t).toFixed(0)}% vs the previous period.` : '.')
      : `No visits recorded in ${this.dateRangeLabel.toLowerCase()} yet.`;
    this.reportMetrics = [
      {
        key: 'pageViews',
        label: 'Total Page Views',
        value: data.totalPageViews || 0,
        trend: trends.totalPageViews,
        icon: 'pi-eye',
        color: '#667eea'
      },
      {
        key: 'visitors',
        label: 'Unique Visitors',
        value: data.uniqueVisitors || 0,
        trend: trends.uniqueVisitors,
        icon: 'pi-users',
        color: '#f093fb'
      },
      {
        key: 'avgSessionDuration',
        label: 'Avg. Session Duration',
        value: this.formatDuration(data.avgSessionDuration || 0),
        icon: 'pi-clock',
        color: '#4facfe'
      },
      {
        key: 'bounceRate',
        label: 'Bounce Rate',
        value: `${(+(data.bounceRate || 0)).toFixed(1)}%`,
        trend: trends.bounceRate !== undefined ? -(trends.bounceRate) : undefined,
        icon: 'pi-sign-out',
        color: '#43e97b'
      }
    ];
  }

  updateTrafficSourceChart(sources: any[]) {
    this.chartData.trafficSources = {
      labels: sources.map(s => s.source),
      datasets: [{
        data: sources.map(s => s.visits),
        backgroundColor: ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#fee140']
      }]
    };
    this.chartOptions.trafficSources = this.donutOptions();
  }

  updateBrowserChart(browsers: any[]) {
    this.chartData.browsers = {
      labels: browsers.map(b => b.name),
      datasets: [{
        data: browsers.map(b => b.count),
        backgroundColor: ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a']
      }]
    };
    this.chartOptions.browsers = this.donutOptions();
  }

  updateFunnelChart(funnel: any) {
    const steps = funnel.steps || [];
    this.chartData.funnel = {
      labels: steps.map((s: any) => s.name),
      datasets: [{
        label: 'Visitors',
        data: steps.map((s: any) => s.visitors),
        backgroundColor: steps.map((_: any, i: number) => `rgba(102,126,234,${Math.max(0.3, 0.9 - i * 0.15)})`),
        borderColor: '#667eea',
        borderWidth: 1
      }]
    };
    this.chartOptions.funnel = {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } }
    };
  }

  updatePageViewsChart(data: any[]) {
    const chartLabels = data && data.length > 0 ? data.map(d => d.date) : [];
    const chartValues = data && data.length > 0 ? data.map(d => d.pageViews || d.count || 0) : [];

    this.chartData.pageViews = {
      labels: chartLabels,
      datasets: [{
        label: 'Page Views',
        data: chartValues,
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        tension: 0.4,
        fill: true
      }]
    };

    this.chartOptions.pageViews = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: data && data.length === 0,
          text: 'No data available for selected period'
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0, maxTicksLimit: 6 } },
        x: { ticks: { autoSkip: true, maxRotation: 0, maxTicksLimit: 8 } }
      }
    };
  }

  updateDeviceChart(data: any) {
    this.chartData.devices = {
      labels: ['Desktop', 'Mobile', 'Tablet'],
      datasets: [{
        data: [data.desktop || 0, data.mobile || 0, data.tablet || 0],
        backgroundColor: ['#667eea', '#f093fb', '#4facfe']
      }]
    };

    this.chartOptions.devices = this.donutOptions();
  }

  /** Compact donut: centred, sane radius, legend right (below on mobile) with value + %, zero slices hidden. */
  donutOptions(): any {
    const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
    return {
      responsive: true,
      maintainAspectRatio: false,
      radius: '92%',
      cutout: '62%',
      layout: { padding: 8 },
      plugins: {
        legend: {
          position: narrow ? 'bottom' : 'right',
          align: 'center',
          labels: {
            boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 12 },
            generateLabels: (chart: any) => {
              const ds = chart.data?.datasets?.[0] || {};
              const vals: number[] = (ds.data || []).map((v: any) => +v || 0);
              const total = vals.reduce((a, b) => a + b, 0) || 1;
              return (chart.data?.labels || []).map((label: string, i: number) => ({
                text: `${label}  ${vals[i].toLocaleString()} (${Math.round((vals[i] / total) * 100)}%)`,
                fillStyle: Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i % ds.backgroundColor.length] : ds.backgroundColor,
                strokeStyle: '#fff', lineWidth: 0, hidden: !chart.getDataVisibility(i), index: i
              })).filter((_: any, i: number) => vals[i] > 0);
            }
          }
        }
      }
    };
  }

  formatDuration(seconds: number): string {
    // Backend sometimes returns milliseconds — normalise if value looks like ms (> 1 hour in seconds = >3600)
    // A session over 2 hours is almost certainly wrong data in ms
    if (seconds > 7200) seconds = Math.round(seconds / 1000);
    if (seconds <= 0) return '0m 0s';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  }

  exportReport(format: 'pdf' | 'csv') {
    this.exporting.set(true);
    if (format === 'csv') {
      this.exportToCSV();
      this.exporting.set(false);
    } else {
      this.exportToPDF();
    }
  }

  exportToCSV() {
    const template = this.selectedTemplate();
    const templateLabels: Record<string, string> = {
      traffic:    'Traffic-Report',
      behavior:   'User-Behavior',
      geographic: 'Geographic-Analysis',
      device:     'Device-Browser',
      content:    'Content-Performance',
      conversion: 'Conversion-Funnel'
    };
    const now = new Date();
    const ts = now.getFullYear().toString()
      + (now.getMonth() + 1).toString().padStart(2, '0')
      + now.getDate().toString().padStart(2, '0')
      + '-'
      + now.getHours().toString().padStart(2, '0')
      + now.getMinutes().toString().padStart(2, '0')
      + now.getSeconds().toString().padStart(2, '0');
    const label = templateLabels[template] || template;
    let filename = `Pulzivo_${label}_${ts}.csv`;
    let data: any[] = [];

    switch (template) {
      case 'traffic':
      case 'behavior':
      case 'content':   data = this.topPagesData; break;
      case 'geographic': data = this.geographicData.map(g => ({ country: g.country, visitors: g.visitors, percentage: g.percentage })); break;
      case 'device':    data = this.browserData.map(b => ({ browser: b.name, sessions: b.count, percentage: b.percentage })); break;
      case 'conversion': data = this.funnelSteps.map(s => ({ step: s.name, visitors: s.visitors, conversion_rate: s.conversion })); break;
    }

    if (!data || data.length === 0) {
      this.messageService.add({ severity: 'warn', summary: 'No Data', detail: 'Nothing to export yet. Generate a report first.' });
      return;
    }

    const csvContent = this.convertToCSV(data);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
    this.messageService.add({ severity: 'success', summary: 'Export Successful', detail: `Report exported as ${filename}` });
  }

  exportToPDF() {
    const templateLabels: Record<string, string> = {
      traffic:    'Traffic-Report',
      behavior:   'User-Behavior',
      geographic: 'Geographic-Analysis',
      device:     'Device-Browser',
      content:    'Content-Performance',
      conversion: 'Conversion-Funnel'
    };
    const now = new Date();
    const ts = now.getFullYear().toString()
      + (now.getMonth() + 1).toString().padStart(2, '0')
      + now.getDate().toString().padStart(2, '0')
      + '-'
      + now.getHours().toString().padStart(2, '0')
      + now.getMinutes().toString().padStart(2, '0')
      + now.getSeconds().toString().padStart(2, '0');
    const label = templateLabels[this.selectedTemplate()] || this.selectedTemplate();
    const originalTitle = document.title;
    document.title = `Pulzivo_${label}_${ts}`;
    window.print();
    document.title = originalTitle;
    this.exporting.set(false);
  }

  convertToCSV(data: any[]): string {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).join(',')).join('\n');
    return `${headers}\n${rows}`;
  }

  saveReport() {
    if (!this.newReportName.trim()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Name Required',
        detail: 'Please enter a name for the report'
      });
      return;
    }

    const report: SavedReport = {
      id: Date.now().toString(),
      name: this.newReportName,
      template: this.selectedTemplate(),
      dateRange: {
        startDate: this.dateRangeValue[0],
        endDate: this.dateRangeValue[1]
      },
      createdAt: new Date()
    };

    const user = this.authService.getUserData();
    if (user?._id) {
      this.http.post<{ report: any }>(`${this.apiUrl}/users/${user._id}/reports`,
        { name: report.name, template: report.template, dateRange: report.dateRange },
        { headers: this.getAuthHeaders() }
      ).subscribe({
        next: (res) => {
          const saved: SavedReport = {
            id: res.report._id,
            name: res.report.name,
            template: res.report.template,
            dateRange: res.report.dateRange,
            createdAt: new Date(res.report.createdAt)
          };
          this.savedReports.unshift(saved);
          this.messageService.add({ severity: 'success', summary: 'Report Saved', detail: `"${report.name}" has been saved` });
        },
        error: () => {
          // Fallback to localStorage
          this.savedReports.push(report);
          localStorage.setItem('savedReports', JSON.stringify(this.savedReports));
          this.messageService.add({ severity: 'success', summary: 'Report Saved', detail: `"${report.name}" has been saved` });
        }
      });
    } else {
      this.savedReports.push(report);
      localStorage.setItem('savedReports', JSON.stringify(this.savedReports));
      this.messageService.add({ severity: 'success', summary: 'Report Saved', detail: `"${report.name}" has been saved` });
    }

    this.newReportName = '';
    this.saveReportPopover?.hide();
  }

  loadSavedReport(report: SavedReport) {
    this.selectedTemplate.set(report.template);
    // Fix: JSON.parse gives strings, not Date objects
    this.dateRangeValue = [
      new Date(report.dateRange.startDate),
      new Date(report.dateRange.endDate)
    ];
    this.tempDateRange = [...this.dateRangeValue];
    this.generateReport();
    this.activeView.set('templates');
  }

  isMetricChecked(key: string): boolean {
    return this.availableMetrics.find(m => m.value === key)?.checked ?? true;
  }

  isChartChecked(value: string): boolean {
    return this.availableCharts.find(c => c.value === value)?.checked ?? false;
  }

  deleteSavedReport(reportId: string) {
    const user = this.authService.getUserData();
    if (user?._id) {
      this.http.delete(`${this.apiUrl}/users/${user._id}/reports/${reportId}`,
        { headers: this.getAuthHeaders() }
      ).subscribe();
    }
    this.savedReports = this.savedReports.filter(r => r.id !== reportId);
    localStorage.setItem('savedReports', JSON.stringify(this.savedReports));
    this.messageService.add({
      severity: 'success',
      summary: 'Report Deleted',
      detail: 'Saved report has been removed'
    });
  }
}
