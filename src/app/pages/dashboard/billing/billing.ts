import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
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

interface StripeStatus {
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingCycle: string | null;
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
  stripeStatus = signal<StripeStatus | null>(null);

  loading = signal(false);
  loadingPlan = signal(true);
  loadingUsage = signal(true);
  loadingChart = signal(true);
  loadingHistory = signal(true);
  loadingPayments = signal(true);
  showCancelDialog = signal(false);
  showProBanner = signal(localStorage.getItem('billing_dismiss_pro_banner') !== '1');
  showEnterpriseBanner = signal(localStorage.getItem('billing_dismiss_enterprise_banner') !== '1');
  
  usageChartData: any;
  usageChartOptions: any;

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private messageService: MessageService,
    private route: ActivatedRoute
  ) {
    this.initializeChartOptions();
  }

  ngOnInit() {
    this.user = this.authService.getUserData();
    this.loadBillingData();

    // Show success toast if redirected back from Stripe checkout
    this.route.queryParams.subscribe(params => {
      if (params['upgraded'] === 'true') {
        const plan = params['plan'] || 'pro';
        const sessionId = params['session_id'];

        this.messageService.add({
          severity: 'success',
          summary: 'Upgrade Successful!',
          detail: `Welcome to ${plan.charAt(0).toUpperCase() + plan.slice(1)}! Activating your plan...`,
          life: 6000
        });

        if (sessionId) {
          // Sync directly from the Stripe checkout session — no webhook needed
          this.http.post<{ plan: string; billingCycle: string }>(
            `${environment.apiUrl}/billing/sync-from-checkout`,
            { sessionId, userId: this.user._id }
          ).subscribe({
            next: (result) => {
              this.updateLocalPlan(result.plan);
              // Clear any stale cancellation flag from a previous downgrade request
              const stored = JSON.parse(localStorage.getItem('userData') || '{}');
              if (stored.user) {
                delete stored.user.scheduledDowngrade;
                localStorage.setItem('userData', JSON.stringify(stored));
              }
              this.loadBillingData();
            },
            error: (err) => {
              console.error('sync-from-checkout failed:', err);
              this.refreshPlanStatus();
            }
          });
        } else {
          this.refreshPlanStatus();
        }
      }
    });
  }

  updateLocalPlan(plan: string) {
    this.user.plan = plan;
    this.authService.updateUserData({ plan });
  }

  refreshPlanStatus() {
    const userId = this.user._id;
    this.http.get<any>(`${environment.apiUrl}/billing/status/${userId}`)
      .subscribe({
        next: (status) => {
          this.updateLocalPlan(status.plan);
          this.user.plan = status.plan;
          if (status.subscription) {
            this.stripeStatus.set({
              status: status.subscription.status,
              currentPeriodEnd: status.subscription.currentPeriodEnd,
              cancelAtPeriodEnd: status.subscription.cancelAtPeriodEnd,
              billingCycle: status.billingCycle,
            });
          }
        },
        error: () => {} // Non-critical
      });
  }

  dismissBanner(type: 'pro' | 'enterprise') {
    if (type === 'pro') {
      localStorage.setItem('billing_dismiss_pro_banner', '1');
      this.showProBanner.set(false);
    } else {
      localStorage.setItem('billing_dismiss_enterprise_banner', '1');
      this.showEnterpriseBanner.set(false);
    }
  }

  openPortal() {
    this.loading.set(true);
    this.http.post<{ url: string }>(`${environment.apiUrl}/billing/portal`, {
      userId: this.user._id
    }).subscribe({
      next: ({ url }) => {
        window.location.href = url;
      },
      error: (error) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.error?.error || 'Unable to open billing portal. Please try again.'
        });
      }
    });
  }

  loadBillingData() {
    this.loading.set(true);
    const userId = this.user._id;

    Promise.all([
      this.loadStripeStatus(userId),
      this.loadUsageData(userId),
      this.loadUsageMetrics(userId),
      this.loadPlanHistory(userId),
      this.loadPaymentHistory(userId),
    ]).finally(() => {
      this.loading.set(false);
    });
  }

  loadStripeStatus(userId: string): Promise<void> {
    this.loadingPlan.set(true);
    return new Promise((resolve) => {
      this.http.get<any>(`${environment.apiUrl}/billing/status/${userId}`)
        .subscribe({
          next: (status) => {
            if (status.subscription) {
              this.stripeStatus.set({
                status: status.subscription.status,
                currentPeriodEnd: status.subscription.currentPeriodEnd,
                cancelAtPeriodEnd: status.subscription.cancelAtPeriodEnd,
                billingCycle: status.billingCycle,
              });
            }
            this.loadingPlan.set(false);
            resolve();
          },
          error: () => { this.loadingPlan.set(false); resolve(); }
        });
    });
  }

  loadPlanHistory(userId: string): Promise<void> {
    this.loadingHistory.set(true);
    return new Promise((resolve) => {
      this.http.get<any>(`${environment.apiUrl}/billing/plan-history/${userId}`)
        .subscribe({
          next: (response) => {
            this.planHistory.set(response.history || []);
            this.loadingHistory.set(false);
            resolve();
          },
          error: () => { this.planHistory.set([]); this.loadingHistory.set(false); resolve(); }
        });
    });
  }

  loadPaymentHistory(userId: string): Promise<void> {
    this.loadingPayments.set(true);
    return new Promise((resolve) => {
      this.http.get<any>(`${environment.apiUrl}/billing/invoices/${userId}`)
        .subscribe({
          next: (response) => {
            this.paymentHistory.set(response.invoices || []);
            this.loadingPayments.set(false);
            resolve();
          },
          error: () => { this.paymentHistory.set([]); this.loadingPayments.set(false); resolve(); }
        });
    });
  }

  loadUsageData(userId: string): Promise<void> {
    this.loadingUsage.set(true);
    return new Promise((resolve) => {
      this.http.get<any>(`${environment.apiUrl}/users/${userId}/billing/current`)
        .subscribe({
          next: (response) => {
            this.usageData.set(response);
            this.loadingUsage.set(false);
            resolve();
          },
          error: (error) => {
            console.error('Failed to load usage data:', error);
            this.loadingUsage.set(false);
            resolve();
          }
        });
    });
  }

  loadUsageMetrics(userId: string): Promise<void> {
    this.loadingChart.set(true);
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
          this.loadingChart.set(false);
          resolve();
        },
        error: (error) => {
          console.error('Failed to load usage metrics:', error);
          this.usageMetrics.set([]);
          this.loadingChart.set(false);
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
    this.showCancelDialog.set(false);
    // Redirect to Stripe Customer Portal for cancellation
    this.openPortal();
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
      currency: 'USD',
      currencyDisplay: 'narrowSymbol'
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
    const stripe = this.stripeStatus();
    if (stripe?.currentPeriodEnd) {
      return this.formatDate(stripe.currentPeriodEnd);
    }
    const usage = this.usageData();
    if (usage) {
      return this.formatDate(usage.currentPeriodEnd);
    }
    return 'N/A';
  }

  getCurrentPlan(): string {
    return this.user?.plan || 'free';
  }

  getBillingCycle(): string {
    return this.stripeStatus()?.billingCycle === 'year' ? 'Annual' : 'Monthly';
  }

  getCurrentPlanPrice(): string {
    const plan = this.getCurrentPlan();
    const yearly = this.stripeStatus()?.billingCycle === 'year';
    switch (plan) {
      case 'starter':    return yearly ? '$86 USD/yr' : '$9 USD/mo';
      case 'pro':        return yearly ? '$278 USD/yr' : '$29 USD/mo';
      case 'enterprise': return yearly ? '$950 USD/yr' : '$99 USD/mo';
      default: return 'Free';
    }
  }

  getSubscriptionStatusLabel(): string {
    const s = this.stripeStatus();
    if (!s) return '';
    if (s.cancelAtPeriodEnd) {
      if (s.currentPeriodEnd) {
        const d = new Date(s.currentPeriodEnd);
        if (d.getFullYear() > 1970) return `Cancels ${this.formatDate(s.currentPeriodEnd)}`;
      }
      return 'Cancellation Scheduled';
    }
    switch (s.status) {
      case 'active':   return 'Active';
      case 'trialing': return 'Trial';
      case 'past_due': return 'Past Due';
      case 'canceled': return 'Cancelled';
      default:         return s.status;
    }
  }

  getSubscriptionStatusSeverity(): 'success' | 'warn' | 'danger' | 'secondary' {
    const s = this.stripeStatus();
    if (!s) return 'secondary';
    if (s.cancelAtPeriodEnd) return 'warn';
    switch (s.status) {
      case 'active':   return 'success';
      case 'trialing': return 'info' as any;
      case 'past_due': return 'danger';
      default:         return 'secondary';
    }
  }
}
