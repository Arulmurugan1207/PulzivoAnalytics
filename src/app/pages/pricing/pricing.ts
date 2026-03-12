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
      price: 79,
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
        return ['Page view tracking', 'Click tracking', 'Basic dashboard', '7-day data retention', 'Community support'];
      case 'pro':
        return ['Custom event tracking', 'Entry & exit page tracking', 'Session & bounce rate analytics', 'Unique visitor tracking', 'UTM & attribution tracking'];
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
}
