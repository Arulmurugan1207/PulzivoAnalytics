import { Component, OnInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChartModule } from 'primeng/chart';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DatePickerModule } from 'primeng/datepicker';
import { PopoverModule, Popover } from 'primeng/popover';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { RouterLink } from '@angular/router';
import { AnalyticsDataService, DateRange } from '../../../services/analytics-data.service';
import { ApiKeysService, ApiKey } from '../../../services/api-keys.service';
import { AuthService } from '../../../services/auth.service';

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
    SelectModule,
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
export class DashboardReports implements OnInit {
  @ViewChild('datePopover') datePopover!: Popover;
  @ViewChild('saveReportPopover') saveReportPopover!: Popover;

  // Report templates
  templates: ReportTemplate[] = [
    {
      id: 'traffic',
      name: 'Traffic Report',
      description: 'Comprehensive overview of page views and visitor traffic',
      icon: 'pi-chart-line',
      metrics: ['pageViews', 'visitors', 'sessions', 'bounceRate'],
      charts: ['pageViewsTrend', 'topPages', 'trafficSources']
    },
    {
      id: 'behavior',
      name: 'User Behavior',
      description: 'Analyze user engagement and interaction patterns',
      icon: 'pi-users',
      metrics: ['avgSessionDuration', 'pagesPerSession', 'bounceRate', 'exitRate'],
      charts: ['sessionDuration', 'pageDepth', 'exitPages']
    },
    {
      id: 'geographic',
      name: 'Geographic Analysis',
      description: 'Visitor distribution by country and region',
      icon: 'pi-map-marker',
      metrics: ['countries', 'topCountry', 'topRegion'],
      charts: ['geoMap', 'countryBreakdown', 'regionBreakdown']
    },
    {
      id: 'device',
      name: 'Device & Browser',
      description: 'Device types, browsers, and screen resolutions',
      icon: 'pi-mobile',
      metrics: ['desktop', 'mobile', 'tablet'],
      charts: ['deviceBreakdown', 'browserBreakdown', 'screenResolution']
    },
    {
      id: 'content',
      name: 'Content Performance',
      description: 'Most and least popular pages and content',
      icon: 'pi-file',
      metrics: ['topPage', 'avgTimeOnPage', 'scrollDepth'],
      charts: ['topPages', 'bottomPages', 'contentEngagement']
    },
    {
      id: 'conversion',
      name: 'Conversion Funnel',
      description: 'Track conversion rates and funnel drop-offs',
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
  activePreset = 'Last 7 Days';
  dateRangeLabel = 'Last 7 Days';

  presets = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'Last 7 Days', value: 'last7' },
    { label: 'Last 30 Days', value: 'last30' },
    { label: 'This Month', value: 'thisMonth' },
    { label: 'Last Month', value: 'lastMonth' },
    { label: 'Custom Range', value: 'custom' }
  ];

  // API Keys
  availableApiKeys: ApiKey[] = [];
  selectedApiKey = '';

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

  constructor(
    private analyticsDataService: AnalyticsDataService,
    private apiKeysService: ApiKeysService,
    private authService: AuthService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    this.loadUserPlan();
    this.loadApiKeys();
    this.initializeDateRange();
    this.loadSavedReports();
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

  loadApiKeys() {
    this.apiKeysService.getApiKeys().subscribe({
      next: (response) => {
        if (response && response.apiKeys) {
          this.availableApiKeys = response.apiKeys.filter((key: ApiKey) => key.isActive);
          if (this.availableApiKeys.length > 0) {
            this.selectedApiKey = this.availableApiKeys[0].apiKey;
            this.apiKeysService.setSelectedApiKey(this.selectedApiKey);
            this.generateReport();
          }
        }
      },
      error: (error) => console.error('Error loading API keys:', error)
    });
  }

  initializeDateRange() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    this.dateRangeValue = [start, end];
    this.tempDateRange = [...this.dateRangeValue];
  }

  loadSavedReports() {
    const saved = localStorage.getItem('savedReports');
    if (saved) {
      this.savedReports = JSON.parse(saved);
    }
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

  onApiKeyChange() {
    this.apiKeysService.setSelectedApiKey(this.selectedApiKey);
    this.generateReport();
  }

  generateReport() {
    if (!this.selectedApiKey) return;
    this.loading.set(true);

    const dateRange: DateRange = {
      startDate: this.dateRangeValue[0],
      endDate: this.dateRangeValue[1]
    };

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
    }
  }

  loadTrafficData(dateRange: DateRange) {
    forkJoin({
      trend:   this.analyticsDataService.getPageViewsTrend(dateRange),
      sources: this.analyticsDataService.getTrafficSources(dateRange),
      pages:   this.analyticsDataService.getTopPages(dateRange)
    }).subscribe({
      next: ({ trend, sources, pages }: any) => {
        this.updatePageViewsChart(trend);
        this.trafficSources = sources.sources || [];
        this.updateTrafficSourceChart(this.trafficSources);
        this.topPagesData = pages.pages || [];
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  loadBehaviorData(dateRange: DateRange) {
    forkJoin({
      trend:  this.analyticsDataService.getPageViewsTrend(dateRange),
      device: this.analyticsDataService.getDeviceBreakdown(dateRange),
      pages:  this.analyticsDataService.getTopPages(dateRange)
    }).subscribe({
      next: ({ trend, device, pages }: any) => {
        this.updatePageViewsChart(trend);
        this.updateDeviceChart(device);
        this.topPagesData = pages.pages || [];
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
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
      error: () => this.loading.set(false)
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
      error: () => this.loading.set(false)
    });
  }

  loadContentData(dateRange: DateRange) {
    forkJoin({
      trend: this.analyticsDataService.getPageViewsTrend(dateRange),
      pages: this.analyticsDataService.getTopPages(dateRange, 1, 20),
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
      error: () => this.loading.set(false)
    });
  }

  loadConversionData(dateRange: DateRange) {
    this.analyticsDataService.getConversionFunnel(dateRange).subscribe({
      next: (funnel) => {
        this.funnelSteps = funnel.steps || [];
        this.updateFunnelChart(funnel);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
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
      error: () => this.loading.set(false)
    });
  }

  buildReportMetrics(data: any, trends: any = {}) {
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
    this.chartOptions.trafficSources = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right' } }
    };
  }

  updateBrowserChart(browsers: any[]) {
    this.chartData.browsers = {
      labels: browsers.map(b => b.name),
      datasets: [{
        data: browsers.map(b => b.count),
        backgroundColor: ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a']
      }]
    };
    this.chartOptions.browsers = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    };
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
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
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

    this.chartOptions.devices = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' }
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

    this.savedReports.push(report);
    localStorage.setItem('savedReports', JSON.stringify(this.savedReports));
    
    this.messageService.add({
      severity: 'success',
      summary: 'Report Saved',
      detail: `"${this.newReportName}" has been saved`
    });

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
    this.savedReports = this.savedReports.filter(r => r.id !== reportId);
    localStorage.setItem('savedReports', JSON.stringify(this.savedReports));
    
    this.messageService.add({
      severity: 'success',
      summary: 'Report Deleted',
      detail: 'Saved report has been removed'
    });
  }
}
