import { Component } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';
import { AuthService } from '../../services/auth.service';

interface Plan {
  type: string;
  name: string;
  price: number;
  description: string;
  apiKeyLimit: number | string;
  eventLimit: number | string;
  features: string[];
  popular?: boolean;
}

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonModule, CardModule, TagModule, DividerModule],
  templateUrl: './pricing.html',
  styleUrl: './pricing.scss',
})
export class Pricing {
  currentPlan: Plan = {
    type: 'free',
    name: 'Free',
    price: 0,
    description: 'Perfect for testing and small projects',
    apiKeyLimit: 1,
    eventLimit: 10000,
    features: []
  };

  constructor(private authService: AuthService, private meta: Meta, private titleService: Title) {
    this.meta.updateTag({ name: 'description', content: 'Simple, transparent pricing for Pulzivo Analytics — The Pulse of Modern Product Analytics. Start free, upgrade as you grow. No hidden fees.' });
    this.meta.updateTag({ property: 'og:url', content: 'https://pulzivo.com/pricing' });
      this.meta.updateTag({ property: 'og:title', content: 'Pricing | Pulzivo Analytics' });
    this.meta.updateTag({ property: 'og:description', content: 'Simple, transparent pricing for Pulzivo Analytics. Start free, upgrade as you grow.' });
    this.meta.updateTag({ property: 'twitter:url', content: 'https://pulzivo.com/pricing' });
      this.meta.updateTag({ property: 'twitter:title', content: 'Pricing | Pulzivo Analytics' });
    this.meta.updateTag({ property: 'twitter:description', content: 'Simple, transparent pricing for Pulzivo Analytics. Start free, upgrade as you grow.' });

    // Funnel: user reached pricing page (strong purchase intent signal)
    if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
      (window as any).PulzivoAnalytics('event', 'pricing_viewed', {
        logged_in: this.authService.isAuthenticated()
      });
    }
  }

  get isLoggedIn(): boolean {
    return this.authService.isAuthenticated();
  }

  plans: Plan[] = [
    {
      type: 'free',
      name: 'Free',
      price: 0,
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

  isCurrentPlan(plan: Plan): boolean {
    return plan.type === this.currentPlan.type;
  }

  getPlanLimitDisplay(limit: number | string): string {
    if (limit === 'unlimited') return '∞';
    if (typeof limit === 'number' && limit >= 1000) {
      return `${(limit / 1000).toLocaleString()}K`;
    }
    return limit.toString();
  }

  selectPlan(plan: Plan): void {
    // Track which plan the user clicked — key intent signal
    if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
      (window as any).PulzivoAnalytics('event', 'plan_selected', {
        plan: plan.type,
        price: plan.price,
        is_upgrade: plan.price > this.currentPlan.price
      });
    }
    console.log('Selected plan:', plan);
    // Handle plan selection logic here
  }

  getSavingsText(plan: Plan): string {
    if (plan.price > this.currentPlan.price) {
      const savings = ((plan.eventLimit as number) / (this.currentPlan.eventLimit as number) * 100).toFixed(0);
      return `${savings}x more events`;
    }
    return '';
  }

  getAllFeatures(): string[] {
    const allFeatures = new Set<string>();
    this.plans.forEach(plan => {
      plan.features.forEach(feature => allFeatures.add(feature));
    });
    return Array.from(allFeatures);
  }

  getKeyFeatures(plan: Plan): string[] {
    switch (plan.type) {
      case 'free':
        return ['Page view tracking', 'Click tracking', 'Basic dashboard', '30-day data retention', 'Community support'];
      case 'starter':
        return ['Custom event tracking', 'Auto click & scroll tracking', 'Session & bounce rate analytics', 'Unique visitor tracking', 'UTM & attribution tracking'];
      case 'pro':
        return ['Performance metrics', 'User identity tracking', 'Element visibility tracking', 'Entry & exit page tracking', 'Custom exports (CSV)'];
      case 'enterprise':
        return ['Form tracking & abandonment', 'Rage/dead click detection', 'Web Vitals (LCP, FID, CLS)', 'Tooltip & UX confusion insights', 'Client Hints (browser & OS)', 'Priority support'];
      default:
        return plan.features.slice(0, 5);
    }
  }

  getPreviousPlanName(plan: Plan): string {
    const index = this.plans.findIndex(p => p.type === plan.type);
    return index > 0 ? this.plans[index - 1].name : '';
  }

  scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  // ── Comparison table ──────────────────────────────────────────────────────
  comparisonCategories: { name: string; rows: { feature: string; [key: string]: string | boolean }[] }[] = [
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
