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
import { AnalyticsDataService, DateRange } from '../../../services/analytics-data.service';
import { ApiKeysService, ApiKey } from '../../../services/api-keys.service';

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  metrics: string[];
  charts: string[];
}

interface SavedReport {
  id: string;
  name: string;
  template: string;
  dateRange: { startDate: Date; endDate: Date };
  createdAt: Date;
}

interface MetricData {
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
      charts: ['funnelSteps', 'dropOffPoints', 'conversionTrend']
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
  tableData: any[] = [];
  loading = signal(false);
  exporting = signal(false);

  // Custom report builder
  availableMetrics = [
    { label: 'Page Views', value: 'pageViews', checked: true },
    { label: 'Unique Visitors', value: 'visitors', checked: true },
    { label: 'Sessions', value: 'sessions', checked: true },
    { label: 'Bounce Rate', value: 'bounceRate', checked: true },
    { label: 'Avg. Session Duration', value: 'avgSessionDuration', checked: false },
    { label: 'Pages per Session', value: 'pagesPerSession', checked: false },
    { label: 'Conversion Rate', value: 'conversionRate', checked: false }
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
    private messageService: MessageService
  ) {}

  ngOnInit() {
    this.loadApiKeys();
    this.initializeDateRange();
    this.loadSavedReports();
    this.generateReport();
  }

  loadApiKeys() {
    this.apiKeysService.getApiKeys().subscribe({
      next: (response) => {
        if (response && response.apiKeys) {
          this.availableApiKeys = response.apiKeys.filter((key: ApiKey) => key.isActive);
          if (this.availableApiKeys.length > 0) {
            this.selectedApiKey = this.availableApiKeys[0].apiKey;
            this.apiKeysService.setSelectedApiKey(this.selectedApiKey);
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

    // Load metrics
    this.analyticsDataService.getMetrics(dateRange, this.selectedApiKey).subscribe({
      next: (metrics) => {
        this.buildReportMetrics(metrics);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Error loading metrics:', error);
        this.loading.set(false);
      }
    });

    // Load charts based on template
    this.loadChartData(dateRange);
  }

  buildReportMetrics(data: any) {
    this.reportMetrics = [
      {
        label: 'Total Page Views',
        value: data.totalPageViews || 0,
        trend: 12.5,
        icon: 'pi-eye',
        color: '#667eea'
      },
      {
        label: 'Unique Visitors',
        value: data.uniqueVisitors || 0,
        trend: 8.3,
        icon: 'pi-users',
        color: '#f093fb'
      },
      {
        label: 'Avg. Session Duration',
        value: this.formatDuration(data.avgSessionDuration || 0),
        trend: -3.2,
        icon: 'pi-clock',
        color: '#4facfe'
      },
      {
        label: 'Bounce Rate',
        value: `${data.bounceRate || 0}%`,
        trend: -5.1,
        icon: 'pi-sign-out',
        color: '#43e97b'
      }
    ];
  }

  loadChartData(dateRange: DateRange) {
    // Load page views trend
    this.analyticsDataService.getPageViewsTrend(dateRange, this.selectedApiKey).subscribe({
      next: (data) => {
        console.log('Page Views Trend Response:', data);
        this.updatePageViewsChart(data);
      },
      error: (error) => {
        console.error('Error loading page views trend:', error);
        this.updatePageViewsChart([]); // Initialize with empty data
      }
    });

    // Load top pages
    this.analyticsDataService.getTopPages(dateRange).subscribe({
      next: (res) => {
        console.log('Top Pages Response:', res);
        this.tableData = res.pages;
      },
      error: (error) => {
        console.error('Error loading top pages:', error);
        this.tableData = [];
      }
    });

    // Load device breakdown
    this.analyticsDataService.getDeviceBreakdown(dateRange, this.selectedApiKey).subscribe({
      next: (data) => {
        console.log('Device Breakdown Response:', data);
        this.updateDeviceChart(data);
      },
      error: (error) => {
        console.error('Error loading device breakdown:', error);
        this.updateDeviceChart({});
      }
    });
  }

  updatePageViewsChart(data: any[]) {
    console.log('Page Views Chart Data:', data);
    
    // Always initialize the chart, even with empty data
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
        y: { 
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
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

    this.chartOptions.devices = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' }
      }
    };
  }

  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  }

  exportReport(format: 'pdf' | 'csv') {
    this.exporting.set(true);
    
    setTimeout(() => {
      if (format === 'csv') {
        this.exportToCSV();
      } else {
        this.exportToPDF();
      }
      this.exporting.set(false);
    }, 1000);
  }

  exportToCSV() {
    const csvData = this.convertToCSV(this.tableData);
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report-${this.selectedTemplate()}-${Date.now()}.csv`;
    link.click();
    
    this.messageService.add({
      severity: 'success',
      summary: 'Export Successful',
      detail: 'Report exported as CSV'
    });
  }

  exportToPDF() {
    this.messageService.add({
      severity: 'info',
      summary: 'PDF Export',
      detail: 'PDF export will be implemented with a PDF library'
    });
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
    this.dateRangeValue = [report.dateRange.startDate, report.dateRange.endDate];
    this.generateReport();
    this.activeView.set('templates');
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
