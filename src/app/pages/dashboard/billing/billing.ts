import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { TableModule } from 'primeng/table';
import { ChartModule } from 'primeng/chart';
import { TimelineModule } from 'primeng/timeline';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';

interface PlanHistoryItem {
  _id: string;
  previousPlan: string;
  newPlan: string;
  changeType: 'upgrade' | 'downgrade' | 'initial';
  changedAt: Date;
  pricePaid: number;
  billingCycle: 'month' | 'year';
  changedBy: string;
}

interface PaymentItem {
  _id: string;
  plan: string;
  amount: number;
  status: 'completed' | 'pending' | 'failed' | 'refunded';
  paymentMethod: string;
  billingDate: Date;
  periodStart: Date;
  periodEnd: Date;
  invoiceUrl?: string;
}

interface UsageData {
  eventsUsed: number;
  eventsLimit: number | string;
  apiKeysUsed: number;
  apiKeysLimit: number | string;
  dataRetention: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  daysRemaining: number;
}

interface UsageMetric {
  date: string;
  eventsCount: number;
  apiKeysUsed: number;
}

@Component({
  selector: 'app-dashboard-billing',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ButtonModule,
    CardModule,
    TagModule,
    TableModule,
    ChartModule,
    TimelineModule,
    DialogModule,
    TooltipModule,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './billing.html',
  styleUrl: './billing.scss',
})
export class DashboardBilling implements OnInit {
  user: any = null;
  planHistory = signal<PlanHistoryItem[]>([]);
  paymentHistory = signal<PaymentItem[]>([]);
  usageData = signal<UsageData | null>(null);
  usageMetrics = signal<UsageMetric[]>([]);
  
  loading = signal(false);
  showCancelDialog = signal(false);
  
  usageChartData: any;
  usageChartOptions: any;

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private messageService: MessageService
  ) {
    this.initializeChartOptions();
  }

  ngOnInit() {
    this.user = this.authService.getUserData();
    this.loadBillingData();
  }

  loadBillingData() {
    this.loading.set(true);
    const userId = this.user._id;

    // Load all billing data in parallel
    Promise.all([
      this.loadPlanHistory(userId),
      this.loadPaymentHistory(userId),
      this.loadUsageData(userId),
      this.loadUsageMetrics(userId)
    ]).finally(() => {
      this.loading.set(false);
    });
  }

  loadPlanHistory(userId: string): Promise<void> {
    return new Promise((resolve) => {
      this.http.get<any>(`${environment.apiUrl}/users/${userId}/plan-history`)
        .subscribe({
          next: (response) => {
            this.planHistory.set(response.history || []);
            resolve();
          },
          error: (error) => {
            console.error('Failed to load plan history:', error);
            // Set empty array as fallback
            this.planHistory.set([]);
            resolve();
          }
        });
    });
  }

  loadPaymentHistory(userId: string): Promise<void> {
    return new Promise((resolve) => {
      this.http.get<any>(`${environment.apiUrl}/users/${userId}/payments`)
        .subscribe({
          next: (response) => {
            this.paymentHistory.set(response.payments || []);
            resolve();
          },
          error: (error) => {
            console.error('Failed to load payment history:', error);
            this.paymentHistory.set([]);
            resolve();
          }
        });
    });
  }

  loadUsageData(userId: string): Promise<void> {
    return new Promise((resolve) => {
      this.http.get<any>(`${environment.apiUrl}/users/${userId}/billing/current`)
        .subscribe({
          next: (response) => {
            this.usageData.set(response);
            resolve();
          },
          error: (error) => {
            console.error('Failed to load usage data:', error);
            resolve();
          }
        });
    });
  }

  loadUsageMetrics(userId: string): Promise<void> {
    return new Promise((resolve) => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      this.http.get<any>(`${environment.apiUrl}/users/${userId}/usage`, {
        params: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        }
      }).subscribe({
        next: (response) => {
          this.usageMetrics.set(response.metrics || []);
          this.updateUsageChart(response.metrics || []);
          resolve();
        },
        error: (error) => {
          console.error('Failed to load usage metrics:', error);
          this.usageMetrics.set([]);
          resolve();
        }
      });
    });
  }

  updateUsageChart(metrics: UsageMetric[]) {
    const labels = metrics.map(m => new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const eventsData = metrics.map(m => m.eventsCount);

    this.usageChartData = {
      labels: labels,
      datasets: [
        {
          label: 'Events',
          data: eventsData,
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          tension: 0.4,
          fill: true
        }
      ]
    };
  }

  initializeChartOptions() {
    this.usageChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        x: {
          display: true,
          grid: {
            display: false
          }
        },
        y: {
          display: true,
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          }
        }
      }
    };
  }

  getPlanBadgeSeverity(plan: string): 'secondary' | 'success' | 'info' {
    switch (plan) {
      case 'enterprise': return 'success';
      case 'pro': return 'info';
      default: return 'secondary';
    }
  }

  getStatusBadgeSeverity(status: string): 'success' | 'warn' | 'danger' | 'secondary' {
    switch (status) {
      case 'completed': return 'success';
      case 'pending': return 'warn';
      case 'failed': return 'danger';
      case 'refunded': return 'secondary';
      default: return 'secondary';
    }
  }

  getChangeTypeIcon(changeType: string): string {
    switch (changeType) {
      case 'upgrade': return 'pi pi-arrow-up';
      case 'downgrade': return 'pi pi-arrow-down';
      case 'initial': return 'pi pi-check-circle';
      default: return 'pi pi-circle';
    }
  }

  getUsagePercentage(): number {
    const usage = this.usageData();
    if (!usage || usage.eventsLimit === 'unlimited') return 0;
    return (usage.eventsUsed / (usage.eventsLimit as number)) * 100;
  }

  getUsageColor(): string {
    const percentage = this.getUsagePercentage();
    if (percentage >= 90) return '#ef4444';
    if (percentage >= 75) return '#f59e0b';
    return '#10b981';
  }

  downloadInvoice(payment: PaymentItem) {
    if (payment.invoiceUrl) {
      window.open(payment.invoiceUrl, '_blank');
    } else {
      this.messageService.add({
        severity: 'info',
        summary: 'Not Available',
        detail: 'Invoice not available for this payment'
      });
    }
  }

  openCancelDialog() {
    this.showCancelDialog.set(true);
  }

  closeCancelDialog() {
    this.showCancelDialog.set(false);
  }

  confirmCancellation() {
    this.loading.set(true);
    const userId = this.user._id;

    this.http.post(`${environment.apiUrl}/users/${userId}/cancel-subscription`, {})
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.showCancelDialog.set(false);
          this.messageService.add({
            severity: 'success',
            summary: 'Subscription Cancelled',
            detail: 'Your subscription will remain active until the end of the current billing period'
          });
          this.loadBillingData();
        },
        error: (error) => {
          this.loading.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: error.error?.message || 'Failed to cancel subscription'
          });
        }
      });
  }

  exportBillingData() {
    const data = {
      planHistory: this.planHistory(),
      paymentHistory: this.paymentHistory(),
      usageMetrics: this.usageMetrics()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `billing-data-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    window.URL.revokeObjectURL(url);

    this.messageService.add({
      severity: 'success',
      summary: 'Export Complete',
      detail: 'Billing data exported successfully'
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  getNextBillingDate(): string {
    const usage = this.usageData();
    if (usage) {
      return this.formatDate(usage.currentPeriodEnd);
    }
    return 'N/A';
  }

  getCurrentPlan(): string {
    return this.user?.plan || 'free';
  }

  getCurrentPlanPrice(): string {
    const plan = this.getCurrentPlan();
    switch (plan) {
      case 'pro': return '$19/mo';
      case 'enterprise': return '$79/mo';
      default: return '$0/mo';
    }
  }
}
