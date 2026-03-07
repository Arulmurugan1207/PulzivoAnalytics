import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { AuthService } from '../../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface Plan {
  type: 'free' | 'pro' | 'enterprise';
  name: string;
  price: number;
  billingCycle: 'month' | 'year';
  description: string;
  apiKeyLimit: number | string;
  eventLimit: number | string;
  features: string[];
  popular?: boolean;
  currentPlan?: boolean;
}

@Component({
  selector: 'app-dashboard-plans',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    CardModule,
    TagModule,
    DialogModule,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './plans.html',
  styleUrl: './plans.scss',
})
export class DashboardPlans implements OnInit {
  currentPlan = signal<'free' | 'pro' | 'enterprise'>('free');
  billingCycle = signal<'month' | 'year'>('month');
  showConfirmDialog = signal(false);
  selectedPlan: Plan | null = null;
  loading = signal(false);
  user: any = null;
  pendingRequest: any = null;

  plans: Plan[] = [
    {
      type: 'free',
      name: 'Free',
      price: 0,
      billingCycle: 'month',
      description: 'Perfect for side projects and getting started',
      apiKeyLimit: 1,
      eventLimit: 5000,
      features: [
        '1 Website',
        '5,000 events/month',
        '7-day data retention',
        'Page view tracking',
        'Click tracking',
        'Basic dashboard',
        'Community support'
      ]
    },
    {
      type: 'pro',
      name: 'Pro',
      price: 19,
      billingCycle: 'month',
      description: 'Full analytics suite for growing businesses',
      apiKeyLimit: 5,
      eventLimit: 500000,
      popular: true,
      features: [
        '5 Websites',
        '500,000 events/month',
        '12-month data retention',
        'Custom event tracking',
        'Auto impression & click tracking',
        'Scroll depth & engagement',
        'Session & visitor tracking',
        'Performance metrics',
        'UTM & attribution',
        'User identity tracking',
        'Referrer analytics',
        'Custom exports (CSV)',
        'Email support'
      ]
    },
    {
      type: 'enterprise',
      name: 'Enterprise',
      price: 79,
      billingCycle: 'month',
      description: 'For large organizations with advanced needs',
      apiKeyLimit: 'unlimited',
      eventLimit: 'unlimited',
      features: [
        'Unlimited websites',
        'Unlimited events',
        '24-month data retention',
        'Form tracking & abandonment',
        'Error & crash tracking',
        'Rage click & dead click detection',
        'Web Vitals (LCP, FID, CLS)',
        'Resource timing monitoring',
        'Heatmap data collection',
        'Client Hints (device data)',
        'API access (read data)',
        'Custom exports (CSV/JSON)',
        'Priority support',
        'SLA guarantee',
        'Dedicated account manager'
      ]
    }
  ];

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    this.loadCurrentPlan();
  }

  loadCurrentPlan() {
    this.user = this.authService.getUserData();
    if (this.user && this.user.plan) {
      this.currentPlan.set(this.user.plan);
      
      // Check for pending plan change request
      this.pendingRequest = this.user.pendingPlanChange || null;
      
      // Mark current plan in the plans array
      this.plans = this.plans.map(plan => ({
        ...plan,
        currentPlan: plan.type === this.user.plan
      }));
    }
  }

  toggleBillingCycle() {
    const newCycle = this.billingCycle() === 'month' ? 'year' : 'month';
    this.billingCycle.set(newCycle);
    
    // Update prices based on billing cycle
    this.plans = this.plans.map(plan => ({
      ...plan,
      billingCycle: newCycle,
      price: newCycle === 'year' && plan.type !== 'free' 
        ? Math.floor(plan.price * 12 * 0.8) // 20% discount for annual
        : plan.type === 'free' ? 0 : (plan.type === 'pro' ? 19 : 79)
    }));
  }

  getPlanPrice(plan: Plan): string {
    if (plan.price === 0) return 'Free';
    const price = this.billingCycle() === 'year' ? plan.price : plan.price;
    const cycle = this.billingCycle() === 'year' ? 'year' : 'mo';
    return `$${price}/${cycle}`;
  }

  canUpgrade(plan: Plan): boolean {
    const planHierarchy = { free: 0, pro: 1, enterprise: 2 };
    return planHierarchy[plan.type] > planHierarchy[this.currentPlan()];
  }

  canDowngrade(plan: Plan): boolean {
    const planHierarchy = { free: 0, pro: 1, enterprise: 2 };
    return planHierarchy[plan.type] < planHierarchy[this.currentPlan()];
  }

  selectPlan(plan: Plan) {
    if (plan.type === this.currentPlan()) {
      this.messageService.add({
        severity: 'info',
        summary: 'Current Plan',
        detail: 'This is your current plan'
      });
      return;
    }

    if (this.pendingRequest) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Request Pending',
        detail: `You have a pending ${this.pendingRequest.changeType} request to ${this.pendingRequest.requestedPlan.toUpperCase()}. Please wait for it to be processed.`
      });
      return;
    }

    this.selectedPlan = plan;
    this.showConfirmDialog.set(true);
  }

  confirmPlanChange() {
    if (!this.selectedPlan) return;

    this.loading.set(true);

    const userId = this.user._id;
    const currentPlanName = this.currentPlan();
    const newPlanName = this.selectedPlan.name;
    const isUpgrade = this.canUpgrade(this.selectedPlan);
    const changeType = isUpgrade ? 'upgrade' : 'downgrade';

    // Send admin notification email instead of auto-changing plan
    this.http.post(`${environment.apiUrl}/users/${userId}/request-plan-change`, {
      currentPlan: currentPlanName,
      requestedPlan: this.selectedPlan.type,
      changeType: changeType,
      userEmail: this.user.email,
      userName: `${this.user.firstname} ${this.user.lastname}`,
      billingCycle: this.billingCycle()
    }).subscribe({
      next: (response: any) => {
        this.loading.set(false);
        this.showConfirmDialog.set(false);

        // Update pending request in memory
        this.pendingRequest = response.pendingRequest;
        
        // Update localStorage with pending request
        const userData = this.authService.getUserData();
        userData.pendingPlanChange = response.pendingRequest;
        const storedData = JSON.parse(localStorage.getItem('userData') || '{}');
        storedData.user.pendingPlanChange = response.pendingRequest;
        localStorage.setItem('userData', JSON.stringify(storedData));

        this.messageService.add({
          severity: 'success',
          summary: 'Plan Change Request Submitted',
          detail: `Your ${changeType} request to ${newPlanName} has been sent to our team. You'll receive an email confirmation once processed.`
        });

        this.selectedPlan = null;
      },
      error: (error) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.error?.message || 'Failed to submit plan change request'
        });
      }
    });
  }

  cancelPlanChange() {
    this.showConfirmDialog.set(false);
    this.selectedPlan = null;
  }

  getButtonLabel(plan: Plan): string {
    if (plan.currentPlan) return 'Current Plan';
    if (this.pendingRequest && plan.type === this.pendingRequest.requestedPlan) return 'Request Pending';
    if (this.pendingRequest) return 'Request Pending';
    if (this.canUpgrade(plan)) return 'Request Upgrade';
    if (this.canDowngrade(plan)) return 'Request Downgrade';
    return 'Request Plan';
  }

  getButtonSeverity(plan: Plan): 'secondary' | 'success' | 'warn' | 'danger' | 'info' | 'contrast' | undefined {
    if (plan.currentPlan) return 'secondary';
    if (this.pendingRequest) return 'contrast';
    if (this.canUpgrade(plan)) return 'success';
    return 'warn';
  }

  isPlanDisabled(plan: Plan): boolean {
    return plan.currentPlan || !!this.pendingRequest;
  }
}
