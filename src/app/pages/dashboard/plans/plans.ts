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
  type: 'free' | 'starter' | 'pro' | 'enterprise';
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
  currentPlan = signal<'free' | 'starter' | 'pro' | 'enterprise'>('free');
  billingCycle = signal<'month' | 'year'>('month');
  showConfirmDialog = signal(false);
  showUpgradeComingSoon = signal(false);
  upgradeIntentPlan: Plan | null = null;
  selectedPlan: Plan | null = null;
  loading = signal(false);
  user: any = null;
  scheduledDowngrade = signal<{ plan: string; cancelAt: string } | null>(null);

  plans: Plan[] = [
    {
      type: 'free',
      name: 'Free',
      price: 0,
      billingCycle: 'month',
      description: 'Perfect for side projects and getting started',
      apiKeyLimit: 1,
      eventLimit: 10000,
      features: [
        '1 Website',
        '10,000 events/month',
        '30-day data retention',
        'Page view tracking',
        'Click tracking',
        'Basic dashboard',
        'Community support'
      ]
    },
    {
      type: 'starter',
      name: 'Starter',
      price: 9,
      billingCycle: 'month',
      description: 'For creators and small sites ready to grow',
      apiKeyLimit: 2,
      eventLimit: 100000,
      features: [
        '2 Websites',
        '100,000 events/month',
        '6-month data retention',
        'Custom event tracking',
        'Auto click & scroll tracking',
        'Entry & exit page tracking',
        'Session & bounce rate analytics',
        'Unique visitor tracking',
        'Geographic analytics',
        'UTM & attribution tracking',
        'Email support'
      ]
    },
    {
      type: 'pro',
      name: 'Pro',
      price: 29,
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
        'Entry & exit page tracking',
        'Session & bounce rate analytics',
        'Unique visitor tracking',
        'Geographic analytics',
        'Element visibility tracking',
        'Performance metrics',
        'UTM & attribution tracking',
        'Traffic source & referrer data',
        'User identity tracking',
        'Custom exports (CSV)',
        'Email support'
      ]
    },
    {
      type: 'enterprise',
      name: 'Enterprise',
      price: 99,
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
        'Client Hints (browser & OS detection)',
        'Tooltip & UX confusion insights',
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

      // Only show scheduledDowngrade if it's for a *lower* plan than current
      // (i.e. cancel-to-free). If the user has since upgraded, discard the stale flag.
      const sd = this.user.scheduledDowngrade;
      const planHierarchy: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };
      const isStale = sd && (planHierarchy[sd.plan] ?? 0) >= (planHierarchy[this.user.plan] ?? 0);
      if (isStale) {
        // Clear stale flag from localStorage too
        const stored = JSON.parse(localStorage.getItem('userData') || '{}');
        if (stored.user) { delete stored.user.scheduledDowngrade; localStorage.setItem('userData', JSON.stringify(stored)); }
        this.scheduledDowngrade.set(null);
      } else {
        this.scheduledDowngrade.set(sd || null);
      }

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
        : plan.type === 'free' ? 0 : (plan.type === 'starter' ? 9 : plan.type === 'pro' ? 29 : 99)
    }));
  }

  getPlanPrice(plan: Plan): string {
    if (plan.price === 0) return 'Free';
    const cycle = this.billingCycle() === 'year' ? 'year' : 'mo';
    return `$${plan.price} USD/${cycle}`;
  }

  canUpgrade(plan: Plan): boolean {
    const planHierarchy = { free: 0, starter: 1, pro: 2, enterprise: 3 };
    return planHierarchy[plan.type] > planHierarchy[this.currentPlan()];
  }

  canDowngrade(plan: Plan): boolean {
    const planHierarchy = { free: 0, starter: 1, pro: 2, enterprise: 3 };
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

    // Upgrades → show confirmation popup first
    if (this.canUpgrade(plan)) {
      this.selectedPlan = plan;
      this.showConfirmDialog.set(true);
      return;
    }

    if (this.scheduledDowngrade()) {
      this.messageService.add({
        severity: 'info',
        summary: 'Cancellation Scheduled',
        detail: 'You already have a cancellation scheduled. Contact support to make further changes.'
      });
      return;
    }

    this.selectedPlan = plan;
    this.showConfirmDialog.set(true);
  }

  dmOnX() {
    try {
      if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
        (window as any).PulzivoAnalytics('event', 'upgrade_dm_x_clicked', {
          from_plan: this.currentPlan(),
          to_plan: this.upgradeIntentPlan?.type ?? 'unknown'
        });
      }
    } catch (_) {}
    window.open('https://x.com/i/chat', '_blank', 'noopener');
  }

  confirmPlanChange() {
    if (!this.selectedPlan) return;
    this.loading.set(true);

    // Upgrade → fire analytics then redirect to Stripe Checkout
    if (this.canUpgrade(this.selectedPlan)) {
      try {
        if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
          (window as any).PulzivoAnalytics('event', 'upgrade_intent', {
            from_plan: this.currentPlan(),
            to_plan: this.selectedPlan.type,
            billing_cycle: this.billingCycle()
          });
        }
      } catch (_) {}

      this.http.post<{ url: string }>(`${environment.apiUrl}/billing/create-checkout-session`, {
        plan: this.selectedPlan.type,
        cycle: this.billingCycle(),
        userId: this.user._id,
        email: this.user.email
      }).subscribe({
        next: ({ url }) => {
          window.location.href = url;
        },
        error: (error) => {
          this.loading.set(false);
          // 402 means past_due — backend sends a portalUrl to fix payment first
          if (error.status === 402 && error.error?.portalUrl) {
            this.showConfirmDialog.set(false);
            this.messageService.add({
              severity: 'warn',
              summary: 'Payment Issue',
              detail: 'Your payment is past due. Redirecting to fix your card...',
              life: 3000
            });
            setTimeout(() => { window.location.href = error.error.portalUrl; }, 3000);
            return;
          }
          this.messageService.add({
            severity: 'error',
            summary: 'Checkout Error',
            detail: error.error?.message || 'Unable to start checkout. Please try again.'
          });
        }
      });
      return;
    }

    this.http.post<any>(`${environment.apiUrl}/billing/change-subscription`, {
      userId: this.user._id,
      plan: this.selectedPlan.type,
      cycle: this.billingCycle(),
    }).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.showConfirmDialog.set(false);

        const storedData = JSON.parse(localStorage.getItem('userData') || '{}');

        if (response.scheduledDowngrade) {
          // Cancel at period end — user stays on current plan until then
          this.scheduledDowngrade.set(response.scheduledDowngrade);
          if (storedData.user) storedData.user.scheduledDowngrade = response.scheduledDowngrade;
          localStorage.setItem('userData', JSON.stringify(storedData));

          const cancelDate = new Date(response.scheduledDowngrade.cancelAt)
            .toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
          this.messageService.add({
            severity: 'info',
            summary: 'Cancellation Scheduled',
            detail: `Your plan will cancel on ${cancelDate}. You keep full access until then.`,
          });
        } else {
          // Immediate change (paid→paid downgrade or no-sub free)
          this.authService.updateUserData({ plan: response.plan, billingCycle: response.billingCycle });
          this.currentPlan.set(response.plan);
          this.plans = this.plans.map(p => ({ ...p, currentPlan: p.type === response.plan }));
          if (storedData.user) {
            storedData.user.plan = response.plan;
            delete storedData.user.scheduledDowngrade;
          }
          localStorage.setItem('userData', JSON.stringify(storedData));

          const planName = response.plan.charAt(0).toUpperCase() + response.plan.slice(1);
          this.messageService.add({
            severity: 'success',
            summary: 'Plan Updated',
            detail: `You've been moved to the ${planName} plan.`,
          });
        }

        this.selectedPlan = null;
      },
      error: (error) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Downgrade Failed',
          detail: error.error?.error || 'Failed to process downgrade. Please try again.',
        });
      },
    });
  }

  cancelPlanChange() {
    this.showConfirmDialog.set(false);
    this.selectedPlan = null;
  }

  getButtonLabel(plan: Plan): string {
    if (plan.currentPlan) return 'Current Plan';
    if (this.canUpgrade(plan)) return this.loading() ? 'Redirecting...' : 'Upgrade Now';
    if (this.scheduledDowngrade()?.plan === plan.type) return 'Cancellation Scheduled';
    if (this.canDowngrade(plan)) return 'Downgrade';
    return 'Current Plan';
  }

  getButtonSeverity(plan: Plan): 'secondary' | 'success' | 'warn' | 'danger' | 'info' | 'contrast' | undefined {
    if (plan.currentPlan) return 'secondary';
    if (this.canUpgrade(plan)) return 'success';
    return 'secondary';
  }

  isPlanDisabled(plan: Plan): boolean {
    if (plan.currentPlan) return true;
    if (this.canUpgrade(plan)) return this.loading();
    if (this.scheduledDowngrade()) return true;
    return false;
  }

  // ── Comparison table ──────────────────────────────────────────────────────
  showComparisonTable = signal(false);

  comparisonCategories = [
    {
      name: 'Limits',
      rows: [
        { feature: 'Websites',         free: '1',          starter: '2',          pro: '5',           enterprise: 'Unlimited' },
        { feature: 'Events / month',   free: '10,000',     starter: '100,000',    pro: '500,000',     enterprise: 'Unlimited' },
        { feature: 'Data retention',   free: '30 days',    starter: '6 months',   pro: '12 months',   enterprise: '24 months' },
      ]
    },
    {
      name: 'Core Tracking',
      rows: [
        { feature: 'Page views',             free: true, starter: true,  pro: true,  enterprise: true  },
        { feature: 'Click tracking',         free: true, starter: true,  pro: true,  enterprise: true  },
        { feature: 'Custom events',          free: true, starter: true,  pro: true,  enterprise: true  },
        { feature: 'Auto click tracking',    free: false, starter: true,  pro: true,  enterprise: true  },
        { feature: 'Scroll depth',           free: false, starter: true,  pro: true,  enterprise: true  },
        { feature: 'Session analytics',      free: false, starter: true,  pro: true,  enterprise: true  },
        { feature: 'Unique visitors',        free: false, starter: true,  pro: true,  enterprise: true  },
      ]
    },
    {
      name: 'Advanced Analytics',
      rows: [
        { feature: 'Entry & exit pages',      free: false, starter: true,  pro: true,  enterprise: true  },
        { feature: 'Geographic analytics',     free: false, starter: true,  pro: true,  enterprise: true  },
        { feature: 'UTM & attribution',        free: false, starter: true,  pro: true,  enterprise: true  },
        { feature: 'Performance metrics',      free: false, starter: false, pro: true,  enterprise: true  },
        { feature: 'User identity tracking',   free: false, starter: false, pro: true,  enterprise: true  },
        { feature: 'Element visibility',       free: false, starter: false, pro: true,  enterprise: true  },
        { feature: 'Custom exports (CSV)',     free: false, starter: false, pro: true,  enterprise: true  },
      ]
    },
    {
      name: 'Enterprise Features',
      rows: [
        { feature: 'Form tracking & abandonment',   free: false, starter: false, pro: false, enterprise: true },
        { feature: 'Error & crash tracking',         free: false, starter: false, pro: false, enterprise: true },
        { feature: 'Rage & dead click detection',    free: false, starter: false, pro: false, enterprise: true },
        { feature: 'Web Vitals (LCP, FID, CLS)',     free: false, starter: false, pro: false, enterprise: true },
        { feature: 'Heatmap data collection',        free: false, starter: false, pro: false, enterprise: true },
        { feature: 'Client Hints (browser & OS)',    free: false, starter: false, pro: false, enterprise: true },
        { feature: 'Tooltip & UX confusion insights',free: false, starter: false, pro: false, enterprise: true },
        { feature: 'Custom exports (CSV/JSON)',      free: false, starter: false, pro: false, enterprise: true },
        { feature: 'API access (read data)',         free: false, starter: false, pro: false, enterprise: true },
      ]
    },
    {
      name: 'Support',
      rows: [
        { feature: 'Community support',       free: true,  starter: true,  pro: true,  enterprise: true  },
        { feature: 'Email support',            free: false, starter: true,  pro: true,  enterprise: true  },
        { feature: 'Priority support',         free: false, starter: false, pro: false, enterprise: true  },
        { feature: 'SLA guarantee',            free: false, starter: false, pro: false, enterprise: true  },
        { feature: 'Dedicated account manager',free: false, starter: false, pro: false, enterprise: true  },
      ]
    }
  ];
}
